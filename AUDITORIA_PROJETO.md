> Registro historico do diagnostico inicial. As propostas de mudanca estrutural deste documento nao representam o escopo atual aprovado. Consulte [a revisao de compatibilidade](CORRECOES_IMPLEMENTADAS.md).

# Auditoria técnica do VitDoor

Data: 11/09/2026. Escopo: código disponível neste workspace, backend Express/Prisma, painel React, simulador React, configuração Docker/Nginx e documentação de arquitetura/deploy.

> Atualização de 12/09/2026: diagnóstico histórico anterior às alterações. Consulte [CORRECOES_IMPLEMENTADAS.md](CORRECOES_IMPLEMENTADAS.md) para correções, testes, limitações e atualização do ambiente. As referências de linha abaixo representam a versão auditada.

## Resultado e limites

O projeto compila, mas contém falhas relevantes de isolamento entre clientes, integração do simulador, comprovação de reprodução e consistência de dados. A aprovação do build não demonstra prontidão comercial.

Foram identificados **48 achados**, separados abaixo por área, e **12 melhorias estruturais**. Esta é a lista dos problemas identificados nesta revisão; não é uma garantia de que não existam outros defeitos.

- `npm run build`: aprovado para backend, admin e player. A primeira execução esbarrou em permissões do sandbox no esbuild; a repetição autorizada concluiu com sucesso.
- `npm audit --json`: backend com 3 pacotes sinalizados como moderados; admin e player, cada um, com 2 altos e 1 moderado. São contagens de pacotes por projeto, com dependências repetidas, não nove falhas independentes.
- `node auditoria/reproduzir-achados.cjs`: cinco reproduções confirmadas com doubles de banco/WebSocket ou funções locais reais. Não são testes end-to-end nem testes de correções.
- Não foram executados deploy, migrations contra banco real, testes em TV Box, testes de carga ou inspeção de uma instalação de produção. Credenciais e arquivos `.env` reais não foram expostos.
- O código funcional não foi alterado. Foram adicionados este relatório e o script de reprodução isolada.
- O player Android não está neste repositório. A arquitetura declara o Android pendente e o player web como simulador. Ausência de implementação Android não foi contabilizada como defeito de código; incompatibilidades que quebram o simulador foram contabilizadas.

Prioridades: **P0** = corrigir antes de confiar no isolamento/disponibilidade em produção; **P1** = alta, afeta fluxo central ou integridade; **P2** = média, robustez, precisão ou operação. A prioridade é da revisão, não uma pontuação CVSS.

## Segurança, isolamento e disponibilidade

### 01 — P0 — Encerramento de alerta envia comando para tela de outro cliente

Em `backend/src/routes/emergencyRoutes.ts:81`, o banco é filtrado pelo tenant, mas o envio WebSocket usa todos os `screenIds` fornecidos pelo solicitante. Um operador autorizado no cliente A que conheça o ID de uma tela B pode mandar `EMERGENCY_ALERT_CLEARED` para ela, mesmo que nenhuma linha tenha sido modificada no banco de A. A tela B remove visualmente o alerta; o alerta persistido pode continuar ativo. **Reproduzido com doubles.** Validar todas as telas pelo tenant antes de qualquer alteração/envio e rejeitar IDs estrangeiros.

### 02 — P0 — Erros assíncronos escapam do middleware do Express

O projeto usa Express 4 e registra diversos handlers `async` diretamente, sem wrapper ou `catch(next)`: exemplos em `backend/src/routes/authRoutes.ts`, `mediaRoutes.ts`, `queueRoutes.ts` e `publicReportRoutes.ts`. A implementação instalada chama `fn(req, res, next)` e ignora a Promise. Uma falha de Prisma, um `tenantScope` que lança ou um tipo inválido podem gerar rejeição não tratada e derrubar o processo na configuração padrão do Node. **Reproduzido com a classe Layer instalada.** Aplicar tratamento uniforme e mapear erros esperados para 400/403/409; alternativamente, planejar migração ao Express 5 com testes. O encaminhamento automático de Promises é uma mudança documentada do [Express 5](https://expressjs.com/en/guide/migrating-5/#rejected-promises).

### 03 — P1 — QR permite referência cruzada de tela e vazamento de metadados

`backend/src/routes/qrRoutes.ts:70` consulta a tela apenas por ID ao receber `?s=...`. O scan pode conter tenant/mídia de A e tela de B. As consultas com `include.screen` em `qrStatsRoutes.ts` e `publicReportRoutes.ts` podem então devolver nome/localização da tela estrangeira. **Reproduzida a criação da referência cruzada com doubles.** Consultar `{ id: screenId, tenantId: media.tenantId }` e corrigir registros inconsistentes existentes após diagnóstico.

### 04 — P1 — Rotas administrativas de filas não verificam papel

`backend/src/routes/queueRoutes.ts:247`, `:270` e `:314` exigem apenas autenticação. Um usuário `VIEWER` consegue listar PINs, criar e excluir filas dentro de seu tenant; a interface não substitui controle na API. Adicionar autorização explícita por operação e DTO de leitura que omita o PIN quando não necessário.

### 05 — P1 — Autenticação de operador por PIN é fraca

`queueRoutes.ts:279` aceita strings arbitrárias como PIN e gera, por padrão, quatro dígitos com `Math.random()`. Não há limiter específico por fila/tenant para tentativas; apenas o limiter global de 300 requisições/minuto por IP. O PIN fica em texto no banco, é devolvido na listagem administrativa e salvo em `localStorage` em `admin/src/components/QueueCallerApp.tsx:25`. Validar formato, gerar com criptografia, guardar hash, limitar tentativas e trocar o PIN por sessão curta após autenticação.

### 06 — P1 — RSS tem defesa SSRF incompleta

`backend/src/lib/rssService.ts` valida somente o hostname inicial e usa `redirect: 'follow'`. Não valida destinos de redirects nem o IP resolvido por DNS. O regex IPv6 também não cobre toda a faixa privada: `https://[fd12::1]/feed` é aceito, confirmado sem realizar conexão. O recurso pode ser configurado por `DESIGNER`, não apenas pelo administrador da plataforma. Revalidar cada salto, bloquear endereços não públicos após resolução e aplicar controle de saída de rede/allowlist de feeds.

### 07 — P1 — Sessão de pareamento continua emitindo tokens depois de expirar

`backend/src/routes/deviceRoutes.ts:112` verifica expiração apenas enquanto a sessão não está pareada. Depois disso, quem mantém `pairingId` e segredo pode chamar status indefinidamente e receber token de 365 dias, inclusive com o `deviceTokenVersion` atual. Isso enfraquece uma futura revogação por versão. Consumir a credencial de bootstrap após entrega/confirmacão e separar renovação autenticada de token do pareamento.

### 08 — P2 — Autorização HTTP usa papel antigo do JWT

`backend/src/middleware/auth.ts` lê usuário ativo do banco, mas atribui `req.auth = auth` com o papel assinado no login. Se o papel for reduzido no banco, o privilégio antigo pode permanecer pelas 12 horas do token. Usar o papel atual do registro e uma política de revogação/versionamento de sessão.

### 09 — P2 — Logout e expiração não encerram sessões WebSocket já autenticadas

`authRoutes.ts` apenas limpa o cookie no logout. Em `backend/src/lib/websocket.ts:264`, o token/usuário é validado ao registrar; não há expiração agendada nem revalidação posterior. Clientes próprios podem manter conexões e receber eventos depois da expiração ou desativação do usuário. O fluxo normal de suspensão de tenant chama `disconnectTenant`, o que já é uma proteção parcial. Encerrar conexões por sessão/usuário e validar expiração periodicamente.

### 10 — P2 — Conexão WebSocket não autenticada pode cancelar seu timeout

No ramo sem tela de `REGISTER_PLAYER`, `backend/src/lib/websocket.ts:229` limpa o temporizador e responde `PAIRING_PENDING`, mesmo sem credencial válida. Uma conexão anônima pode permanecer aberta respondendo ping. Não cancelar o timeout sem autenticação; limitar conexões por origem/IP e rejeitar registros repetidos/incompatíveis.

### 11 — P1 — Dois heartbeats disputam o mesmo estado

`backend/src/lib/websocket.ts:26` e `:114` criam intervalos de 30 segundos sobre o mesmo `isAlive`. Um pode marcar a conexão como morta e o outro encerrá-la antes de chegar o pong, conforme o alinhamento dos timers e carga. Além disso, a limpeza dentro de `initWebSocketServer` não cancela o intervalo global. Manter um único heartbeat por servidor e testar clientes lentos e reconexão.

### 12 — P1 — Relatório de anunciante é público por ID da mídia, sem controle de compartilhamento

`backend/src/routes/publicReportRoutes.ts` disponibiliza nome/URL da mídia, métricas e locais de telas a qualquer pessoa com o UUID, sem token próprio, validade, revogação ou verificação do status do tenant. O UUID da mídia também aparece em QR público; logo não funciona como segredo exclusivo do relatório. A publicação é intencional, mas o acesso não é controlável. Criar link de compartilhamento com token próprio revogável e escopo/período explícitos.

### 13 — P2 — Screenshots não têm autorização na leitura

`backend/src/lib/storage.ts:84` gera URLs públicas e `backend/src/server.ts` serve `/uploads` antes da autenticação. `Cache-Control: private` não restringe acesso a quem possui a URL. Screenshots podem mostrar senhas ou informações operacionais. Usar armazenamento privado e endpoint autenticado/URL assinada para capturas; a política de mídia publicitária pode continuar separada.

### 14 — P1 — Runtime Docker não atende requisito de dependência

`backend/Dockerfile:1` e `:11` usam Node 20. `file-type@22.0.1`, presente no lockfile e importado pelas rotas de upload/screenshot, declara `engines.node >=22` em seu package.json. O build local passou, mas não certifica execução na imagem Node 20. Alinhar imagem e engines com uma versão suportada e executar smoke test do container e de upload real. Trata-se de incompatibilidade declarada; crash da imagem não foi reproduzido nesta revisão.

### 15 — P1/P2 — Dependências com alertas do npm audit

O audit retornou `qs`, `express` e `body-parser` moderados no backend; `vite` e `nanoid` altos e `esbuild` moderado em cada frontend. Os avisos dos frontends concentram-se no ferramental e não demonstram vulnerabilidade equivalente no bundle estático servido por Nginx. O audit sugere correções e, para Vite, uma atualização major. Planejar atualização dos lockfiles com validação; não executar `audit fix --force` indiscriminadamente. Para a avaliação atual, a evidência é a resposta do registry obtida por `npm audit`, sem exploração dos avisos.

## Player web, reprodução e comandos

### 16 — P1 — Atualizações do backend não chegam à programação do simulador

`backend/src/lib/websocket.ts:384` envia `MANIFEST_UPDATED`; `player/src/App.tsx:193` só trata `CONTENT_UPDATED` e mensagens de pareamento para programação. Não há GET de manifesto no simulador. Editar playlist/layout ou enviar SYNC não atualiza o conteúdo naquela conexão. A arquitetura reserva o consumo de manifesto ao Android; a correção coerente é restabelecer/adaptar o protocolo legado do simulador ou rever explicitamente essa decisão, com versão de protocolo e teste de contrato.

### 17 — P1 — Screenshot e confirmações não carregam commandId

`player/src/App.tsx:219` envia `SCREENSHOT_RESULT` sem `commandId`; o backend exige esse campo em `websocket.ts:279`. As respostas de erro e de SYNC também omitem o identificador, SET_VOLUME não confirma e REBOOT recarrega sem confirmar. O painel fica aguardando, screenshots são ignorados e REBOOT ainda pode ser reenviado após reconectar por continuar SENT. Propagar commandId, confirmar execução e deduplicar comandos localmente. Recursos Android de quiosque/UPDATE_APP são pendências declaradas, não funções disponíveis no navegador.

### 18 — P1 — Fila offline acima de 500 eventos deixa de sincronizar

`player/src/App.tsx:293` lê todos os logs e envia de uma vez; `proofOfPlayRoutes.ts` aceita no máximo 500. Depois de uma desconexão suficientemente longa, todos os próximos envios continuam recebendo 400 enquanto a fila cresce. Enviar lotes limitados, com worker exclusivo, retry/backoff e progresso persistido.

### 19 — P1 — Confirmação de lote apaga eventos não enviados ou rejeitados

`player/src/App.tsx:308` chama `clearProofLogs()` quando `received > 0`, limpando a loja inteira. Eventos adicionados enquanto o POST estava em andamento também somem; itens rejeitados são apagados junto com os aceitos. Excluir por `eventIds` confirmados e colocar rejeitados em quarentena com diagnóstico.

### 20 — P1 — Proof-of-play registra conclusão antes da reprodução

`LayoutRenderer.tsx:50` chama o callback no começo; `player/src/App.tsx:285` fixa duração em 10 segundos e `completed: true`. Imagens quebradas, vídeo interrompido ou conteúdo encoberto por alerta podem aparecer como reprodução completa. Medir início/fim real, duração efetiva, motivo de interrupção e erros; registrar por mídia/instância/versão.

### 21 — P1 — Em multizona, telemetria e provas não representam o conteúdo mostrado

O efeito do `LayoutRenderer.tsx` continua registrando a playlist mesmo quando o retorno em `:69` mostra `MultiZoneLayout`. As zonas não recebem callback de comprovação, e não exibem `MediaQrCta`. O heartbeat do simulador só envia nome, sem mediaId. Implementar eventos por zona, selecionar explicitamente qual mídia atende NFC e passar CTA/identificação ao renderer de zona.

### 22 — P1 — Repetição de playlist com um item deixa de gerar provas recorrentes

Com um único item, `advance()` em `LayoutRenderer.tsx` retorna novamente índice zero. O efeito não reinicia apenas por essa chamada; um vídeo pode permanecer em loop e contabilizar somente a reprodução inicial. Usar identificador de ciclo e eventos reais de fim/reinício, com tratamento definido para imagem contínua.

### 23 — P1 — Tipos aceitos pela API não são renderizados corretamente

`mediaRoutes.ts` aceita AUDIO/PDF; o player trata somente VIDEO/WEB_PAGE e usa `<img>` para o restante. `playlistRoutes.ts` permite itens com layoutId, mas `LayoutRenderer.tsx:31` lê apenas `currentItem.media`. `MultiZoneLayout.tsx:32` usa itens da playlist como fallback, porém ZonePlayer espera `item.url/type`, enquanto o DTO entrega `item.media.url/type`. Normalizar um contrato discriminado de itens e implementar/restringir os tipos suportados.

### 24 — P1 — Vídeo com erro pode travar uma zona indefinidamente

`MultiZoneLayout.tsx:142` não arma timer para VIDEO; `MediaVideo.tsx` não trata `onError`, stall ou timeout. Se o vídeo não terminar, a zona não avança. Adicionar watchdog de carregamento/reprodução, evento de falha, fallback e política de tentativa.

### 25 — P2 — Rotação usa contêiner com dimensões trocadas, mas filhos continuam em viewport original

`player/src/App.tsx` usa largura 100vh/altura 100vw para 90°/270°. Os renderers mantêm `100vw/100vh`, por exemplo `LayoutRenderer.tsx:74` e `MultiZoneLayout.tsx:29`. Em telas não quadradas, o conteúdo pode ficar cortado após rotação. Usar dimensões relativas ao contêiner e validar visualmente 0°/90°/180°/270°.

### 26 — P2 — Estado antigo sobrevive a respostas sem playlist/alerta e a novo pareamento

Em `player/src/App.tsx:180`, playlist só é aplicada se truthy; alerta ativo também só é substituído se existir. Uma resposta nula não limpa o estado antigo. Revogação limpa token/tela, mas não cache de conteúdo nem todos os estados. Isso permite conteúdo anterior reaparecer, inclusive após novo pareamento. Versionar/particionar cache por dispositivo/tenant e aplicar null explicitamente.

### 27 — P1 — Alertas não cumprem duração nem se reconciliam após perda de conexão

`emergencyRoutes.ts:28` salva durationSeconds, mas não há expiração correspondente no backend ou simulador. O manifesto não inclui estado de alerta; um cliente que perde o comando clear pode manter o alerta, e a reconexão não limpa `activeAlert` quando o servidor envia null. Definir validade absoluta, persistir estado autoritativo e reconciliar na conexão/consulta periódica.

## Programação, relatórios e dados

### 28 — P1 — Edição/exclusão de playlist usada por campanha não invalida todas as telas

`backend/src/routes/playlistRoutes.ts:138`, `:142` e `:160` atualizam versões apenas de telas diretamente vinculadas à playlist. Entretanto, `manifest.ts` inclui campanhas ativas do tenant em todas as telas. Uma tela com outra playlist principal pode continuar com o snapshot antigo da campanha indefinidamente. Calcular dependências diretas e por campanha na invalidação.

### 29 — P2 — Atualização RSS cobre somente layout ativo direto

`backend/src/lib/rssJob.ts` procura apenas `activeLayoutId` para telas afetadas. Layouts em playlists/campanhas ficam fora. A carga inicial em `layoutRoutes.ts` é fire-and-forget; pode publicar manifesto sem notícias e preencher o cache depois sem notificar, especialmente se o tick seguinte observar conteúdo já igual. Atualizar/publicar após a carga e rastrear todas as dependências.

### 30 — P1 — Layouts conservam cópias desatualizadas de mídias

`layoutRoutes.ts:109` materializa nome, tipo, URL e duração dentro de canvasConfigJson. `mediaRoutes.ts:224` atualiza PlaylistItem, mas não essas cópias. `playerLayoutDto` apenas lê o JSON. Renomear ou mudar duração da mídia não atualiza as zonas, mesmo incrementando manifesto. Resolver mídias por ID ao construir DTO/manifesto ou atualizar referências de maneira transacional.

### 31 — P1 — Relatórios e limites de campanha usam nomes, não identidade da mídia

`publicReportRoutes.ts`, `manifest.ts` e `proofOfPlayRoutes.ts:74` consultam provas por mediaName. Nomes duplicados misturam resultados, renomeações fragmentam histórico e a mesma mídia em múltiplas campanhas consome limites de campanhas distintas. ProofOfPlay não possui mediaId/campaignId. Registrar identificadores estáveis e snapshots de nome, versão, zona e campanha para atribuição auditável.

### 32 — P1 — Limite de impressões não é aplicado de forma consistente

O endpoint `/log` não chama `checkAndExpireCampaigns`, mas `/log-batch` chama de forma assíncrona e silencia falhas. `currentImpressions` é retornado no DTO, porém não é incrementado. `buildScreenManifest` retorna snapshot já publicado antes de recontar limites. Há contagem desde createdAt, sem exigir completed ou limitar à janela da campanha. Centralizar agregação e expiração idempotente, com semântica explícita para eventos offline e tolerância a ultrapassagem.

### 33 — P2 — Campanhas aceitam datas, horários e estados inconsistentes

`backend/src/routes/campaignRoutes.ts` não valida intervalo início/fim, HH:mm, dias válidos, prioridade positiva, limite positivo ou enum de status. Datas de formulário são forçadas a UTC, sem timezone da tela/tenant. O painel oferece INACTIVE, o schema comenta PAUSED/COMPLETED e a lógica grava EXPIRED. Definir timezone, enums e schema de validação; testar virada do dia e horários que cruzam meia-noite. A execução de agenda comercial pertence ao Android ainda ausente deste workspace.

### 34 — P2 — Criar campanha pausada ignora o status; limpar limite não remove valor

`CampaignsTab.tsx:92` envia status na criação, mas `campaignRoutes.ts` força ACTIVE. Ao apagar o campo maxImpressions na edição, o frontend envia undefined, omitido no JSON; o backend interpreta como manter o valor anterior. Respeitar status validado e enviar null explicitamente para remover limite.

### 35 — P1 — Chamadas simultâneas podem emitir a mesma senha

`queueRoutes.ts:77` calcula currentNum + 1 antes da transação. Duas chamadas leem o mesmo número e ambas escrevem o mesmo próximo valor. A transação atual não protege a leitura original. **Reproduzido em interleaving simulado.** Incrementar atomicamente dentro de transação e usar o valor retornado para criar a senha; definir interação com reset e idempotência de retries.

### 36 — P1 — Cotas e pareamento não são atômicos

`screenRoutes.ts:58` lê contagem e depois cria tela/atualiza sessão separadamente. `mediaRoutes.ts:107` soma espaço antes de gravar o upload. Requisições concorrentes podem exceder cotas; falha entre criação de tela e claim deixa estado parcial. Bloquear/reservar cota por tenant, fazer claim condicional de sessão e incluir mutações relacionadas na transação. Consultar sessão por código normalizado em índice, sem carregar todas as sessões pendentes.

### 37 — P1 — CSV e tabela declaram 100% mesmo para registros incompletos

`admin/src/components/ProofOfPlayTab.tsx:40` e `:252` mostram “Completa (100%)” incondicionalmente, ignorando completed. O CSV concatena texto sem escapar aspas e sem neutralizar fórmulas, permitindo arquivos malformados e interpretação de células perigosas conforme o aplicativo. Exibir status real e usar serialização CSV com tratamento de campos iniciados por =, +, - e @.

### 38 — P1 — Exclusão remove histórico de comprovação/conversão

Em `backend/prisma/schema.prisma:274`, ProofOfPlay pertence à Screen com onDelete Cascade; apagar tela apaga provas. QrScan pertence à Media com Cascade; apagar mídia elimina scans. Isso altera números históricos e prejudica auditoria. Preferir arquivamento, snapshots e retenção explícita para entidades com histórico comercial.

### 39 — P2 — eventId inválido recebe novo UUID e perde idempotência

`proofOfPlayRoutes.ts:104` gera UUID para eventos sem identificador válido, embora a resposta de validação diga que UUID é obrigatório. Reenviar o mesmo evento inválido gera outra linha. Timestamp futuro e conteúdo sem vínculo com a programação também não são restringidos. Exigir eventId de origem, validar intervalo temporal e conferir a mídia/manifesto esperado.

### 40 — P2 — NFC e QR atribuem conversões sem evidência suficiente

Em `qrRoutes.ts`, ausência de tela no QR escolhe a primeira compatível; NFC pode cair na primeira mídia da playlist ou qualquer mídia com CTA do tenant. Não há garantia de que era o anúncio visível ou de que a tela estava online. O simulador informa nome apenas a cada 10 segundos. Registrar contexto de reprodução ao trocar mídia, exigir frescor e reportar atribuição desconhecida em vez de inventar uma associação.

## Armazenamento, painel e manutenção

### 41 — P1 — Upload/exclusão podem deixar objetos órfãos

`mediaRoutes.ts:131` salva arquivo antes de criar registro; se Prisma falhar, só o temporário é removido. Na exclusão (`:416`), remove registro e silencia falha de DeleteObject/purge, perdendo a referência necessária à limpeza. Implementar estado de upload, compensação e fila persistente de exclusão com retry e reconciliação periódica.

### 42 — P1 — Storage local pode colidir entre clientes; seleção de driver é ambígua

`storage.ts:40` gera nome local por Date.now + nome original, sem tenant/mediaId/UUID. Uploads simultâneos com mesmo nome podem sobrescrever o mesmo caminho. Além disso, operações preferem R2 sempre que o cliente está configurado, mesmo com STORAGE_DRIVER=local; trocar driver torna ambígua a exclusão de arquivos antigos. Usar namespace tenant/mediaId, nome único e armazenar driver/bucket/chave por objeto.

### 43 — P2 — Uploads consomem RAM e bloqueiam o event loop desnecessariamente

`mediaRoutes.ts:135` lê vídeo/áudio inteiro de até 256 MB em memória para duração; dois uploads elevam o pico. `storage.ts:77` copia arquivo de forma síncrona. A concorrência é global ao processo, não por cliente. Extrair metadados em worker/stream/processo limitado e usar I/O assíncrono com cotas por tenant.

### 44 — P2 — PINs, screenshots, logs e sessões têm retenção insuficiente

`deviceRoutes.ts` deixa screenshots anteriores deliberadamente armazenados; não há job de limpeza correspondente neste repositório. PairingSession, QueueTicket, ProofOfPlay, QrScan e RemoteCommand também não têm retenção automatizada. ScreenManifest já tem limite de 30 versões, um ponto positivo. Definir retenção por classe, particionar grandes tabelas e medir armazenamento incluindo screenshots, hoje fora da cota somada de Media.

### 45 — P2 — Painel aceita senha de 8 caracteres, backend exige 12

`admin/src/components/TenantsTab.tsx:167` e handleCreate aceitam 8; `backend/src/routes/tenantRoutes.ts` exige 12. O modal fecha e limpa parcialmente o formulário antes de aguardar o resultado, e `App.tsx` não apresenta o erro de criação nesse fluxo. Compartilhar a validação, aguardar sucesso e preservar formulário em falha.

### 46 — P2 — Várias ações falham silenciosamente e formulários fecham antes da confirmação

Em `admin/src/App.tsx`, criação de widget/campanha, exclusões e alertas têm caminhos que não verificam response.ok ou só escrevem no console. `CampaignsTab.tsx` dispara callbacks sem await e fecha o modal. `loadTenantData` limpa tudo e falha como grupo se uma API falhar. Padronizar resultado tipado, feedback visível, loading/erro por recurso e bloqueio de envio duplicado. Relatórios exportam apenas os 50 registros recentes recebidos; isso deve ser explícito e separado de exportação completa.

### 47 — P2 — Configuração de desenvolvimento/deploy está divergente

`backend/.env.example` define CORS para os domínios públicos, não para localhost, e omite ADMIN_ORIGINS/ADMIN_JWT_SECRET. A checagem de origem das mutações de sessão cai em PUBLIC_BASE_URL da API, diferente do domínio do painel. `docker-compose.yml` tem defaults localhost, mas o gateway aceita apenas domínios fixos, Cloudflare e certificados. Além disso, o HTML NFC WhatsApp usa script inline, bloqueado por `script-src 'self'` de `gateway/security-headers.conf`; o link manual continua disponível. Criar exemplos coerentes de local/homologação/produção e mover script para recurso próprio ou nonce. DEPLOY_VPS.md ainda declara ausentes recursos já presentes, como manifesto imutável e restrição da origem.

### 48 — P2 — Auditoria de isolamento pode passar pelo motivo errado

`backend/src/scripts/auditIsolation.ts:72` envia layout estrangeiro sem version/preset obrigatórios; recebe 400 pela estrutura antes de testar propriedade da mídia. O teste masterCross aceita qualquer !ok, inclusive 500; com o problema async pode sequer receber resposta. O script deixa fixtures suspensas e não exercita clear de emergência, QR, filas ou WebSocket. Usar payload válido exceto pela propriedade estrangeira, status exatos, timeout, asserts de ausência de efeitos e banco descartável com limpeza.

## Melhorias estruturais propostas

1. **Testes de contrato backend/player.** Validar mensagens, commandId, manifesto, DTO de zona, nulidade e compatibilidade de versões. É a cobertura com maior retorno imediato.
2. **Testes de integração com PostgreSQL descartável.** Cobrir RBAC por papel, dois tenants, concorrência em cotas/senhas, retries e exclusão com histórico. Não depender apenas do auditIsolation atual.
3. **CI obrigatória.** Executar build, validação Prisma/migrations, testes e audit com triagem de exposição. Hoje não há suíte test/lint declarada nos package.json nem pipeline versionado encontrado.
4. **Contratos TypeScript compartilhados e validação de entrada.** Remover any dos objetos de domínio, ativar strict gradualmente nos frontends, validar corpo/query com schemas e enums; reforçar invariantes de tenant no banco quando possível.
5. **Publicação consistente de conteúdo.** Mutação, incremento de versão e evento de publicação devem usar transação/outbox. Hoje falha depois do commit pode devolver erro apesar de já salvar, deixando telas desatualizadas.
6. **Entrega confiável de comandos.** Transições condicionais evitam sobrescrever SUCCEEDED com SENT quando ACK chega rápido. Entregar em páginas e drenar backlog além dos 50 comandos lidos no registro. Eventos de fila precisam indicar entregue/pendente, pois hoje resposta success não comprova exibição.
7. **Observabilidade operacional.** Logs estruturados com requestId/tenantId/commandId, métricas de atraso de manifesto, sincronização de provas, falha de mídia, filas e storage. Não registrar tokens/PINs.
8. **Backup externo automatizado e restauração ensaiada.** Há instrução de pg_dump local, mas não fluxo automatizado de backup externo/restauração verificada. Definir RPO/RTO e verificar PostgreSQL e arquivos de maneira consistente.
9. **Escala e paginação.** Listagens de mídias/telas/playlists/tenants sem paginação crescem com todo o dataset; atualizações invalidam muitas telas e reconstroem manifestos em série. Mapear dependências, paginar e agregar métricas. Redis/PubSub só é necessário ao introduzir múltiplas instâncias; o Set WebSocket atual é local ao processo.
10. **Encerramento e recuperação.** Fechar WebSockets e intervalos explicitamente, aplicar timeout de shutdown e reconciliar ONLINE pelo lastPing após reinício. Healthcheck deve separar liveness/readiness e sinalizar dependências relevantes sem expor segredos.
11. **UX e acessibilidade.** Feedback consistente de sucesso/falha, navegação por teclado, rótulos de campos, foco/restauração em modais, estados vazios e tabelas responsivas. Validar visualmente no navegador antes de considerar o painel homologado.
12. **Fechar o escopo comercial Android.** Implementar e homologar cache físico, ativação atômica, checksum, playback offline, agendamento/timezone, quiosque, boot, watchdog e atualização assinada no repositório Android. O cache web atual armazena JSON, não garante arquivos offline; não vender essa capacidade como concluída. Manter matriz única de recurso implementado/validado/pendente e atualizar a documentação de deploy.

## Ordem de execução recomendada

1. Corrigir 01–06, 11 e validar runtime/dependências (14–15). Adicionar testes negativos de isolamento e captura de erro.
2. Restaurar integração do simulador e confirmações (16–17), corrigir fila offline e evidência de reprodução (18–24, 31–32, 37–39).
3. Corrigir consistência de publicação, pareamento/cotas, senhas concorrentes e ciclo de storage (28–30, 35–36, 41–44).
4. Consolidar sessões, relatórios compartilhados, UX/configuração, CI, backup e homologação Android conforme o escopo comercial.

## Como conferir as reproduções

Após compilar, executar `node auditoria/reproduzir-achados.cjs`. O script confirma o comportamento atual dos achados 01, 02, 03, 06 e 35 sem conectar em PostgreSQL, sem chamar URLs privadas e sem enviar WebSocket real. Depois das correções, suas assertivas devem ser convertidas para exigir rejeição/isolamento; ele não deve ser usado como selo de segurança do sistema.
