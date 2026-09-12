# Correções e validação — 12/09/2026

As alterações estão no código deste workspace. Não foi realizado deploy nem alterado o banco configurado no ambiente. O diagnóstico original está em [AUDITORIA_PROJETO.md](AUDITORIA_PROJETO.md); este arquivo registra o estado posterior às correções.

## Complemento: imagem de screenshot quebrada

O painel agora busca a captura com a mesma origem de API e sessão usadas no login, e exibe um blob local. A URL pública persistida não determina mais o destino do pedido autenticado. Capturas antigas no R2, no armazenamento local ou em base64 podem ser lidas pelo endpoint autenticado, com validação de origem, prefixo do tenant/tela, formato e tamanho. Arquivo ausente resulta em mensagem e botão para tentar carregar novamente.

Não foram alterados `.env` reais ou endereços de produção. Na entrega anterior, **novos screenshots passaram a ser gravados no volume privado do backend (`private_data`)**, enquanto mídias continuam obedecendo `STORAGE_DRIVER`/R2. A ausência de um print novo no R2 é esperada nessa versão; conferir o volume privado na instalação. URLs antigas de screenshot não precisam ser expostas diretamente no navegador para permitir sua leitura pelo painel.

Validação deste complemento: 20 testes do backend e 2 testes específicos no Chrome passaram; backend e painel compilaram. Os testes de navegador usam APIs simuladas, sem acessar a produção. A correção ainda exige publicação do backend e painel. O `DATABASE_URL` mencionado abaixo é exclusivamente o do workspace local, não o ambiente de produção do usuário.

## Troca de senha

Todos os usuários autenticados, inclusive VIEWER, têm acesso a **Minha conta → Trocar senha**. O formulário exige senha atual, nova senha e confirmação. A política é de pelo menos 12 caracteres e no máximo 72 bytes UTF-8, evitando truncamento pelo bcrypt.

`POST /api/auth/change-password` valida a senha atual, rejeita reutilização da mesma senha e limita tentativas por usuário. A atualização do hash, incremento de versão, revogação das sessões anteriores e criação da nova sessão ocorrem na mesma transação. O navegador recebe um novo cookie HttpOnly; as conexões WebSocket das sessões anteriores são encerradas. O logout também revoga a sessão no banco. Papéis e situação da conta são consultados no banco durante a autenticação.

## Cobertura dos achados

“Implementado” descreve a mudança no código, não homologação em produção. Os testes abaixo têm limites explícitos.

| Achados | Alteração implementada |
| --- | --- |
| 01–03 | Isolamento no encerramento de alertas e no QR; wrapper de handlers assíncronos e middleware central de erros. |
| 04–05 | Filas administrativas com RBAC; PIN armazenado como bcrypt + índice HMAC, autenticação vinculada ao estabelecimento, tokens temporários e limites de tentativas. PIN exibido apenas ao criar/rotacionar. |
| 06 | RSS apenas HTTPS, bloqueio de endereços privados/reservados, verificação de todos os resultados DNS, conexão ao IP validado e revalidação de redirects, com timeout e limite de bytes. |
| 07–11 | Pareamento expira e é consumido por ACK; tokens vinculados à versão do dispositivo; sessões administrativas revogáveis; timeout para WebSockets anônimos e um único heartbeat. |
| 12 | Relatório por token aleatório, hash no banco, validade de 30 dias e revogação pelo painel. UUID da mídia sozinho não autoriza acesso. |
| 13 | Novos screenshots ficam em volume privado, com leitura autenticada por tenant. A rota pública local só serve arquivos referenciados por mídias ativas. **Objetos antigos no R2 exigem limpeza no ambiente implantado.** |
| 14–15 | Docker com Node 22 e ffprobe; Vite e dependências vulneráveis atualizados. |
| 16–17 | Simulador recebe programação compatível, consulta manifesto periodicamente, confirma comandos por ID e envia screenshot por upload autenticado. Comandos Android indisponíveis retornam falha explícita. |
| 18–19 | IndexedDB confirma a transação, separa eventos por dispositivo, envia lotes de até 500, apaga somente IDs confirmados e preserva rejeitados em quarentena. |
| 20–24 | Provas após reprodução efetiva, duração medida, status incompleto em interrupção/erro, identidade e versão da mídia, provas por zona, repetição com item único, renderização de imagem/vídeo/áudio/PDF/página/layout e avanço em falhas. |
| 25–27 | Dimensões relativas ao contêiner rotacionado; cache de conteúdo por tela; limpeza ao revogar pareamento; remoção explícita de programação nula; alertas com expiração e reconciliação, prioritários sobre chamadas de senha. |
| 28–30 | Invalidação das telas do tenant em mudanças de playlists/campanhas/layouts/RSS. Layouts do manifesto são hidratados com os dados atuais da mídia. |
| 31–34 | Provas e relatórios usam mediaId; campanhas usam campaignId e contagem deduplicada de conclusões; datas, dias, horários, prioridade, status, limites e timezone são validados. PAUSED e limite nulo são preservados. |
| 35–36 | Transações com bloqueio de linha para numeração de fila, cota de upload e pareamento; eventId idempotente nas chamadas. |
| 37 | CSV e tabelas mostram o status real; células escapam aspas, delimitadores e fórmulas. Exportações continuam limitadas ao histórico recente retornado pela API. |
| 38–40 | Exclusão lógica de mídias/telas preserva histórico; eventId inválido é rejeitado; QR sem tela não inventa atribuição; NFC exige telemetria recente de mídia pertencente ao cliente. |
| 41–43 | Objetos com namespace e UUID, driver registrado no caminho, compensação persistente antes do upload e fila de exclusão com retries; leitura em streaming e ffprobe fora do processo principal. |
| 44 | Limpeza de sessões/pareamentos expirados e screenshots substituídos; limite do cache RSS. **Retenção de históricos, quarentena e particionamento continuam como decisões operacionais pendentes; não foi habilitada exclusão automática de provas/conversões.** |
| 45–46 | Política de senha alinhada; erros de API visíveis; formulários de cliente, campanha, widget, QR e tela aguardam confirmação antes de fechar; alertas não exibem sucesso em erro HTTP. |
| 47 | Exemplos locais coerentes com portas 3000/3001/4000; exemplos de produção com segredo administrativo, HTTPS, origens e purge; volume privado no Compose. |
| 48 | Auditoria de isolamento usa layout válido e confirma presença do registro próprio, além da ausência do estrangeiro. Reprodutor antigo substituído pelo executor de regressões. |

## Testes executados

- Backend: 18 testes, incluindo handlers HTTP reais com banco substituído por fixtures, política/troca de senha, sessões, RBAC, isolamento, QR, acesso a relatórios, comandos, SSRF, campanhas, identidade das provas e confinamento de caminhos.
- Um desses testes executa **todas as migrations SQL no PostgreSQL em memória (PGlite)**, com dados anteriores à nova migration, conferindo preservação de prova incompleta e backfill por identidade não ambígua.
- Player: 2 testes com IndexedDB emulado, incluindo 1.001 eventos, chegada de evento durante envio, confirmação parcial, quarentena e isolamento por dispositivo.
- Navegador Chrome: 4 testes com API simulada — troca de senha bem-sucedida, confirmação divergente, rejeição do servidor, CSV e reprodução repetida de uma única imagem com provas distintas. A tela Minha conta também foi inspecionada visualmente.
- Compilação do backend, painel e player. Prisma schema validado com URL fictícia PostgreSQL, sem conexão.
- `npm audit`: zero vulnerabilidades nos três aplicativos na execução desta entrega.

Os testes com fixtures não comprovam concorrência entre conexões PostgreSQL reais. A CI adicionada executa migrations e auditoria de dois tenants contra PostgreSQL 16 descartável, além dos builds e testes. Essa execução remota ainda não ocorreu nesta sessão. Docker, R2/CDN, hardware Android, falhas elétricas, restauração de backups e carga de produção não foram homologados aqui.

Comandos para reproduzir:

```powershell
cd backend
npm.cmd ci
npm.cmd test
cd ../player
npm.cmd ci
npm.cmd test
npm.cmd run build
cd ../admin
npm.cmd ci
npm.cmd test
npm.cmd run build
```

Os testes do painel iniciam também o servidor local do player; instale as dependências de ambos. No Windows usam o Chrome instalado no caminho padrão. Na CI Linux é instalado Chromium pelo Playwright. Os testes usam portas 3100 e 3101 e interceptam as APIs.

## Atualização do ambiente

1. Providenciar backup recuperável de PostgreSQL e arquivos antes da atualização. Os backups devem incluir agora o volume `private_data`, além de `uploads_data` e objetos R2.
2. Configurar `backend/.env` para PostgreSQL. **O DATABASE_URL atual deste workspace não tem o protocolo PostgreSQL exigido pelo schema**, por isso o backend real não foi iniciado nem sua base migrada. Não basta trocar o prefixo de uma URL SQLite; é necessário um servidor PostgreSQL e uma migração de dados caso exista base antiga a preservar.
3. Usar Node 22.12 ou superior. Instalar dependências e gerar o Prisma Client (`npm run db:generate`). Configurar segredos distintos de pelo menos 32 caracteres, `ADMIN_ORIGINS`, `CORS_ORIGINS` e `PUBLIC_BASE_URL` conforme os exemplos. Em produção R2, configurar credenciais de purge da zona Cloudflare.
4. Aplicar migrations com `npm run db:migrate` no backend, ou pelo serviço `migrate` do Compose. A nova migration é `20260911210000_audit_and_password` e incrementa a versão das telas para publicar o contrato atualizado.
5. Publicar backend, painel e simulador compatíveis. Atualizar o cliente Android separadamente conforme [PLAYER_ANDROID_FLUTTER.md](PLAYER_ANDROID_FLUTTER.md) antes de depender dos novos campos obrigatórios das provas.
6. Todos os administradores deverão entrar novamente: JWTs anteriores não possuem sessão revogável. Os PINs existentes de filas são convertidos para hash na inicialização; os operadores devem usar o novo link vinculado ao estabelecimento. Rotacionar `ADMIN_JWT_SECRET` exige gerar novos PINs de filas, pois ele também protege o índice HMAC dos PINs.
7. Gerar novos links de relatórios e solicitar novas capturas de tela. URLs antigas de relatório deixam de funcionar. Limpar os screenshots antigos do R2 e caches públicos; o código local não revoga cópias já servidas por serviços externos.

## Melhorias estruturais ainda abertas

Não foram tratadas como concluídas as propostas maiores da auditoria: cliente Android ausente deste repositório, cache físico offline/checksum/quiosque/OTA, backend distribuído com PubSub, paginação completa, contratos de domínio sem `any`, cobertura exaustiva de concorrência/carga, retenção aprovada para históricos e backup externo com ensaio de restauração.

O player web preserva programação e provas em IndexedDB, mas o cache físico de todas as mídias não é garantido. Autoplay de áudio e incorporação de páginas/PDF dependem do navegador e dos cabeçalhos do destino. Uma prova informa o que o dispositivo reportou; não é comprovação independente contra um dispositivo adulterado. Limites de campanha podem ser ultrapassados por reproduções simultâneas/offline já em andamento; o servidor interrompe novas programações após receber as confirmações.

Há reconciliação de manifesto e versão persistida para recuperar notificações perdidas. Isso não substitui um outbox distribuído. Algumas listagens e notificações ainda percorrem todo o tenant e devem ser avaliadas antes de ampliar a escala.
