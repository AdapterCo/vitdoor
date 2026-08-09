# VitDoor — Arquitetura oficial e plano de implementação

> Documento principal de arquitetura do projeto.
>
> Toda nova funcionalidade, correção ou decisão técnica deve ser comparada com este arquivo.
> Quando uma entrega for concluída, sua situação deve ser atualizada na matriz de acompanhamento.

**Versão do documento:** 1.3
**Última atualização:** 09/08/2026  
**Produto:** Plataforma SaaS de mídia indoor para totens e TV Boxes  
**Status geral:** MVP em evolução — ainda não pronto para produção comercial

---

## 1. Objetivo do produto

O VitDoor será uma plataforma SaaS para venda e gerenciamento de totens de mídia indoor.

A operação comercial será:

1. A VitDoor cadastra uma empresa cliente, sem catálogo fixo de planos.
2. A VitDoor informa diretamente a quantidade contratada de telas e o armazenamento; o workspace master possui telas ilimitadas.
3. A empresa recebe acesso ao painel web.
4. Cada TV Box executa o aplicativo VitDoor Player para Android TV.
5. A empresa ativa cada TV Box usando um código de pareamento.
6. A ativação consome uma licença de dispositivo.
7. A empresa envia suas mídias, cria playlists e layouts e escolhe em quais telas serão exibidos.
8. O aplicativo baixa antecipadamente a programação e continua funcionando sem internet.
9. A VitDoor acompanha clientes, dispositivos, armazenamento, falhas e contratos pelo painel master.

O sistema é compartilhado entre várias empresas, mas os dados e dispositivos de cada cliente devem ser completamente isolados.

---

## 2. Aplicações oficiais

O produto será composto por quatro aplicações/camadas principais.

### 2.1 Painel web

Aplicação usada em computadores e navegadores.

Responsabilidades:

- Login da VitDoor e dos clientes.
- Administração dos clientes SaaS.
- Gestão dos planos e limites contratados.
- Upload e biblioteca de mídias.
- Criação de playlists.
- Criação de layouts multizona.
- Escolha das telas de destino.
- Agendamentos e campanhas.
- Monitoramento dos dispositivos.
- Comandos remotos.
- Relatórios e proof-of-play.

Tecnologia atual:

- React.
- TypeScript.
- Vite.

O painel web não reproduz a programação no totem. Ele apenas configura e administra o sistema.

### 2.2 API e serviços de backend

Aplicação executada inicialmente em uma VPS.

Responsabilidades:

- Autenticação e autorização.
- Isolamento multiempresa.
- Controle de planos e licenças.
- Cadastro e pareamento dos dispositivos.
- Gestão de mídias, playlists, layouts e campanhas.
- Geração de manifestos de programação.
- Emissão de URLs autorizadas para upload.
- Recebimento de telemetria e proof-of-play.
- Envio de comandos em tempo real.
- Integração com PostgreSQL, Redis e Cloudflare R2.

Tecnologia atual:

- Node.js.
- Express.
- TypeScript.
- Prisma.
- WebSocket.

### 2.3 Aplicativo Android TV / TV Box

Esta é a aplicação oficial de reprodução instalada nos equipamentos vendidos aos clientes.

O player web atual não será considerado o player de produção.

Plataforma inicial:

- Android TV.
- TV Boxes Android.
- Tablets Android usados como totens.

Tecnologia recomendada:

- Kotlin.
- Android SDK.
- Jetpack Compose para telas de configuração e pareamento.
- AndroidX Media3 / ExoPlayer para vídeos e áudios.
- Room para banco local.
- WorkManager para downloads, sincronização e reenvio de eventos.
- OkHttp para HTTP e WebSocket.
- Armazenamento interno do aplicativo para as mídias.

Motivos para usar aplicativo Android nativo:

- Inicialização automática após ligar o equipamento.
- Melhor suporte a Android TV e controle remoto.
- Modo quiosque e tela cheia real.
- Reprodução estável com ExoPlayer.
- Cache físico de vídeos e imagens.
- Controle de armazenamento.
- Downloads retomáveis.
- Operação offline.
- Watchdog e recuperação após travamento.
- Controle de orientação e volume.
- Atualização controlada do aplicativo.
- Coleta real de informações do dispositivo.

Responsabilidades do aplicativo:

- Gerar e exibir código de pareamento.
- Manter identidade e token individual do dispositivo.
- Abrir automaticamente após reinicialização.
- Executar em modo quiosque e tela cheia.
- Consultar o manifesto da programação.
- Baixar todas as mídias antes de ativar uma nova versão.
- Validar checksum e tamanho dos arquivos.
- Reproduzir imagens, vídeos, áudios e layouts multizona.
- Executar cada zona do layout de forma independente.
- Manter programação anterior se uma atualização falhar.
- Funcionar sem internet.
- Enviar heartbeat e telemetria.
- Armazenar proof-of-play offline.
- Sincronizar eventos quando a conexão retornar.
- Receber comandos remotos.
- Capturar screenshot quando suportado.
- Limpar mídias antigas sem apagar conteúdo em uso.

### 2.4 Player web de desenvolvimento

O diretório `player/` atual será mantido temporariamente como:

- Simulador visual.
- Ferramenta para testar playlists e layouts no navegador.
- Referência de comportamento para o aplicativo Android.
- Ambiente rápido para validar comunicação WebSocket.

Ele não deve ser entregue como player final das TV Boxes.

Funcionalidades implementadas apenas no player web não são consideradas concluídas no produto até existirem também no aplicativo Android TV.

---

## 3. Arquitetura de infraestrutura

```text
Usuário / Painel Web
        |
        v
Cloudflare DNS + TLS + WAF
        |
        +-----------------------> Painel web estático
        |
        +-----------------------> API HTTPS na VPS
        |
        +-----------------------> WebSocket WSS na VPS
        |
        +-----------------------> Domínio de mídia / Cloudflare CDN / R2

Aplicativo Android TV
        |
        +---- HTTPS -----------> API / manifestos / proof-of-play
        +---- WSS -------------> comandos e telemetria em tempo real
        +---- HTTPS/CDN -------> download das mídias
        +---- armazenamento ---> cache local físico

API na VPS
        |
        +---- PostgreSQL ------> dados transacionais
        +---- Redis -----------> presença, pub/sub, filas e comandos
        +---- Cloudflare R2 ---> arquivos originais e versões
```

### 3.1 VPS

A VPS executará inicialmente:

- API Node.js.
- Gateway WebSocket.
- PostgreSQL.
- Redis.
- Nginx ou Caddy.
- Serviço de processamento de mídia, quando necessário.

Requisitos:

- Containers Docker ou serviços gerenciados pelo systemd.
- Reinicialização automática.
- HTTPS entre Cloudflare e origem.
- Firewall permitindo somente portas necessárias.
- Backups externos.
- Logs com rotação.
- Monitoramento de CPU, memória, disco e disponibilidade.

### 3.2 Cloudflare

Responsabilidades:

- DNS.
- TLS.
- Proxy da API.
- WAF e rate limiting.
- Proxy de WebSocket.
- Domínio personalizado para o R2.
- CDN das mídias.
- Regras de cache.

Exemplo de domínios:

- `app.vitdoor.com.br` — painel.
- `api.vitdoor.com.br` — API.
- `ws.vitdoor.com.br` ou `api.vitdoor.com.br/ws` — WebSocket.
- `media.vitdoor.com.br` — R2 e CDN.

### 3.3 Cloudflare R2

O R2 armazenará:

- Imagens.
- Vídeos.
- Áudios.
- PDFs e outros conteúdos suportados.
- Miniaturas.
- Versões processadas.

Padrão recomendado de chave:

```text
tenants/{tenantId}/media/{mediaId}/v{version}/{filename}
```

Regras:

- Nunca sobrescrever um arquivo já publicado.
- Cada substituição gera nova versão e nova URL.
- Arquivos publicados devem usar URLs imutáveis.
- O banco guarda tamanho, MIME type, checksum e versão.
- Exclusão no painel deve ser lógica.
- Um job posterior remove objetos sem referência.
- Upload grande deve usar multipart upload.
- Em produção, falha no R2 não pode fazer fallback silencioso para disco local.

### 3.4 Banco de dados

Banco oficial de produção:

- PostgreSQL.

SQLite será permitido somente para desenvolvimento local.

O banco deverá armazenar:

- Clientes.
- Usuários e permissões.
- Planos e limites.
- Dispositivos.
- Mídias e versões.
- Playlists.
- Layouts.
- Agendamentos.
- Manifestos publicados.
- Comandos.
- Telemetria.
- Proof-of-play.
- Auditoria.

### 3.5 Redis

Será usado para:

- Presença online dos dispositivos.
- Pub/Sub entre instâncias do backend.
- Comandos remotos pendentes.
- Rate limiting.
- Cache de consultas.
- Jobs e filas.

---

## 4. Comunicação com os dispositivos

### 4.1 HTTPS

Será usado para:

- Login e ativação.
- Consulta do manifesto.
- Download das mídias pelo CDN.
- Envio em lote de proof-of-play.
- Upload de screenshot.
- Diagnósticos.

### 4.2 WebSocket

Será usado inicialmente para:

- Heartbeat.
- Alteração de status.
- Aviso de nova programação.
- Forçar sincronização.
- Alterar volume.
- Solicitar screenshot.
- Reiniciar player.
- Alertas emergenciais.

O WebSocket não deve transportar os arquivos de mídia.

Mensagens importantes devem ter:

- `commandId`.
- `deviceId`.
- `createdAt`.
- `expiresAt`.
- `type`.
- `payload`.
- Confirmação de recebimento.
- Confirmação de execução.

O aplicativo deve reconectar com atraso progressivo e variação aleatória.

### 4.3 MQTT

MQTT não será obrigatório na primeira versão.

O sistema começará com HTTPS + WebSocket.

MQTT será reavaliado quando houver:

- Grande quantidade de dispositivos.
- Necessidade de QoS.
- Mensagens retidas.
- Integração com sensores IoT.
- Broker dedicado.

Não devem existir WebSocket e MQTT duplicando a mesma responsabilidade sem uma decisão arquitetural registrada.

---

## 5. Manifesto e publicação

O painel não deve enviar diretamente uma playlist incompleta ao player.

Ao publicar, o backend gera um manifesto imutável e versionado.

Exemplo:

```json
{
  "manifestVersion": 18,
  "deviceId": "device-id",
  "publishedAt": "2026-08-07T12:00:00Z",
  "orientation": "LANDSCAPE",
  "layout": {
    "type": "SPLIT",
    "zones": []
  },
  "assets": [
    {
      "id": "media-id",
      "version": 3,
      "url": "https://media.vitdoor.com.br/...",
      "mimeType": "video/mp4",
      "sizeBytes": 12500000,
      "sha256": "..."
    }
  ]
}
```

Fluxo de publicação:

1. Cliente salva a programação.
2. Backend valida propriedade das mídias e telas.
3. Backend gera nova versão do manifesto.
4. Backend avisa o dispositivo pelo WebSocket.
5. Aplicativo consulta o manifesto por HTTPS.
6. Aplicativo compara a versão local.
7. Aplicativo baixa somente arquivos ausentes ou alterados.
8. Aplicativo valida checksum.
9. Aplicativo ativa a nova programação de forma atômica.
10. Aplicativo confirma a versão ativa.

Se qualquer download falhar, a programação anterior continua sendo executada.

---

## 6. Cache local e funcionamento offline

Cache local significa armazenar os arquivos físicos no Android, não apenas o JSON da playlist.

O aplicativo deve manter:

- Banco Room com manifestos e metadados.
- Diretório local de mídias.
- Versão ativa.
- Versão anterior válida.
- Fila de proof-of-play.
- Fila de comandos e confirmações.
- Estado de downloads.

Política de armazenamento:

- Reservar limite configurável.
- Nunca apagar arquivo usado pelo manifesto ativo.
- Remover primeiro arquivos sem referência.
- Manter conteúdo emergencial.
- Verificar espaço antes do download.
- Retomar download interrompido.
- Utilizar arquivo temporário durante download.
- Renomear para arquivo definitivo somente após checksum válido.

O player deve continuar reproduzindo durante:

- Falha de internet.
- Falha temporária da API.
- Indisponibilidade do WebSocket.
- Atualização incompleta.
- Reinicialização do equipamento.

---

## 7. Layouts e reprodução

Cada cliente controla sua própria realidade.

Nada pode ser fixo globalmente no player:

- Rodapé é opcional.
- Texto do rodapé é configurável.
- Relógio é opcional e possui posição configurável.
- Não existe temperatura falsa.
- Divisão de tela é configurável.
- Mídias de cada zona são selecionadas explicitamente.
- Enquadramento é configurado por zona.
- Áudio é configurado por zona e somente uma zona deve emitir som por vez.
- O loop de layouts e playlists é obrigatório e aplicado pelo backend.

Modos de enquadramento:

- `CONTAIN` — mostra a mídia inteira.
- `COVER` — preenche a área e pode cortar bordas.
- `FILL` — estica para ocupar a área.

Cada zona deve ter:

- Identificador.
- Posição.
- Largura e altura.
- Ordem de camadas.
- Modo de enquadramento.
- Sequência própria de mídias.
- Duração por item.
- Loop próprio, quando aplicável.
- Destinos pertencentes ao mesmo usuário que criou o layout.

As zonas devem reproduzir independentemente.

---

## 8. Segurança e isolamento

Requisitos obrigatórios:

- Toda entidade pertence a um `tenantId`.
- Cliente nunca escolhe livremente outro `tenantId`.
- Consultas sempre aplicam o tenant da sessão.
- Tokens de usuário e dispositivo são diferentes.
- Cada dispositivo possui credencial revogável.
- Código de pareamento possui validade e uso único.
- Senhas usam hash seguro.
- HTTPS e WSS obrigatórios.
- JWT secret forte.
- Rate limiting no login e pareamento.
- Auditoria das alterações.
- URLs de upload temporárias e limitadas.
- Validação de MIME type, tamanho e checksum.
- Proteção contra arquivos perigosos.
- Política de retenção e LGPD.

---

## 9. Matriz de acompanhamento

Estados:

- `CONCLUÍDO` — implementado e validado na aplicação correta.
- `PARCIAL` — existe, mas ainda não atende produção.
- `SIMULADOR` — existe somente no player web.
- `PENDENTE` — ainda não implementado.
- `SUBSTITUIR` — implementação atual não deve ir para produção.

| Área | Situação | Observação |
|---|---|---|
| Painel web React | CONCLUÍDO | Base funcional para administração |
| Login de usuários | CONCLUÍDO | Master e cliente |
| Isolamento por cliente | PARCIAL | Implementado, precisa auditoria completa de todas as rotas |
| Limite de dispositivos | CONCLUÍDO | Validado no pareamento |
| Upload de mídia | PARCIAL | Ainda passa pela memória da VPS |
| Cloudflare R2 | CONCLUÍDO | Bucket `vitdoor-media`, credencial restrita, domínio próprio, chaves imutáveis por tenant/mídia e fail-fast sem fallback local validados na VPS |
| Cloudflare CDN | CONCLUÍDO | `media.vitdoor.com.br`, CORS, Range, cache imutável e entrega `CF-Cache-Status: HIT` validados em arquivo MP4 real |
| TLS Cloudflare → origem | PREPARADO | Gateway expõe TLS 1.2/1.3 com Origin CA montado fora do Git; falta instalar o certificado na VPS e validar Full (strict) |
| Playlists | CONCLUÍDO | Criação, edição, loop, duração e telas |
| Layouts multizona | CONCLUÍDO | Editor web e simulador funcionando |
| Reprodução multizona web | SIMULADOR | Referência para implementação Android |
| WebSocket | PARCIAL | Funcional em uma instância, sem Redis |
| MQTT | PENDENTE | Não necessário para primeira versão |
| SQLite | CONCLUÍDO | Removido do ambiente de produção; Prisma opera com PostgreSQL |
| PostgreSQL | CONCLUÍDO | Migrações e healthcheck validados no container da VPS |
| Redis | PENDENTE | Necessário antes de escalar |
| Cache de JSON no navegador | SIMULADOR | Não representa cache offline final |
| Cache físico de mídias Android | PENDENTE | Requisito crítico |
| Manifesto versionado | PENDENTE | Requisito crítico |
| Checksum de download | PENDENTE | Requisito crítico |
| Proof-of-play offline web | SIMULADOR | Deve ser refeito com Room no Android |
| Aplicativo Android TV | PENDENTE | Próxima frente principal |
| Inicialização automática | PENDENTE | Android |
| Modo quiosque | PENDENTE | Android |
| ExoPlayer / Media3 | PENDENTE | Android |
| Atualização remota do app | PENDENTE | Definir estratégia |
| Assinatura e distribuição APK | PENDENTE | Play Store privada, MDM ou atualização própria |
| Deploy em VPS | CONCLUÍDO | Compose, gateway, migrações, volumes e healthchecks operando na VPS de homologação |
| Monitoramento e backups | PARCIAL | Healthcheck preparado; faltam métricas, alertas e backup externo automatizado |

### Auditoria funcional de 08/08/2026

| Entrega | Situação | Evidência no repositório |
|---|---|---|
| Workspace pessoal do master | CONCLUÍDO | Master administra clientes e também seus próprios conteúdos; telas ilimitadas apenas no tenant master |
| Propriedade individual | CONCLUÍDO | Telas, mídias, pastas, layouts, playlists e campanhas filtradas por `tenantId` e `createdById` |
| Relatórios individuais | CONCLUÍDO | Proof-of-play, telas e armazenamento são calculados somente sobre telas/mídias do usuário autenticado |
| Pastas de mídia | CONCLUÍDO | Criar, renomear, excluir sem apagar mídias e mover itens entre pastas |
| Autoria e destino de layout | CONCLUÍDO | Backend valida telas e reconstrói o JSON usando somente mídias canônicas do proprietário |
| Áudio por zona | SIMULADOR | Configurável no editor e respeitado no player web; falta portar ao Android |
| Loop obrigatório | SIMULADOR | Forçado no backend e no player web; falta portar ao Android |
| Proof-of-play do dispositivo | PARCIAL | Escrita exige token revogável e impede registrar evento em nome de outra tela; persistência offline final será Android/Room |
| Auditoria cruzada | PREPARADO | `npm --prefix backend run audit:isolation` valida master e dois clientes reais na VPS e suspende os tenants de auditoria ao terminar |

### Validação R2/CDN de 09/08/2026

- Bucket: `vitdoor-media`.
- Domínio público oficial: `https://media.vitdoor.com.br`.
- URL pública de desenvolvimento `r2.dev`: desativada.
- Objetos organizados em `tenants/{tenantId}/media/{mediaId}/{arquivo}`.
- Arquivo MP4 real retornou `HTTP/2 200`, `Content-Type: video/mp4` e `Accept-Ranges: bytes`.
- Origem retornou `Cache-Control: public, max-age=31536000, immutable`.
- Segunda requisição retornou `CF-Cache-Status: HIT` e `Age: 70`, confirmando entrega pelo CDN.
- Healthcheck da API retornou `storage: r2`.
- Upload direto/multipart permanece uma entrega separada: o armazenamento e o CDN estão concluídos, mas o upload atual ainda atravessa a memória da VPS.

---

## 10. Prioridades oficiais

### Fase 1 — Consolidar backend de produção

1. ~~Migrar Prisma de SQLite para PostgreSQL.~~ Concluído.
2. ~~Criar migrações versionadas.~~ Concluído.
3. ~~Configurar R2 real e CDN.~~ Concluído e validado com `HIT`.
4. Implementar versões, checksums e manifesto por dispositivo.
5. Implementar upload direto e multipart.
6. Migrar as mídias legadas do volume local para o R2.

### Fase 2 — Criar aplicativo Android TV

1. Criar projeto Kotlin.
2. Implementar tela de pareamento.
3. Implementar credencial do dispositivo.
4. Implementar API e WebSocket.
5. Implementar Room.
6. Implementar downloader.
7. Implementar cache físico.
8. Implementar Media3 / ExoPlayer.
9. Implementar imagens e layouts multizona.
10. Implementar inicialização automática e quiosque.
11. Implementar proof-of-play offline.
12. Implementar comandos remotos.

### Fase 3 — Infraestrutura e escala

1. Adicionar Redis.
2. Persistir comandos pendentes.
3. Configurar Cloudflare CDN.
4. Configurar backups.
5. Configurar logs e métricas.
6. Criar ambiente de homologação.
7. Automatizar deploy.

### Fase 4 — Comercialização

1. Cobrança e planos.
2. Renovação de licenças.
3. Suspensão por inadimplência.
4. Atualização segura do aplicativo.
5. Suporte e diagnóstico.
6. Termos, privacidade e LGPD.

---

## 11. Critério de conclusão

Uma funcionalidade de player só pode ser marcada como `CONCLUÍDO` quando:

1. Estiver implementada no aplicativo Android TV.
2. Funcionar online e offline, quando aplicável.
3. Tiver tratamento de falha.
4. Tiver sido testada em TV Box real.
5. Não depender de dados falsos.
6. Respeitar isolamento por cliente.
7. Produzir logs ou confirmação de execução.

Implementações existentes somente no diretório `player/` devem permanecer como `SIMULADOR`.

---

## 12. Registro de decisões

### ADR-001 — Player oficial Android nativo

**Decisão:** O player comercial será um aplicativo Android TV nativo em Kotlin.  
**Motivo:** Cache físico, quiosque, inicialização automática, estabilidade de vídeo e integração com TV Box.  
**Consequência:** O player React/Vite atual passa a ser apenas simulador.

### ADR-002 — WebSocket antes de MQTT

**Decisão:** A primeira versão usará HTTPS + WebSocket.  
**Motivo:** A implementação atual já atende comandos e telemetria do MVP.  
**Consequência:** MQTT será avaliado apenas quando escala ou IoT justificarem.

### ADR-003 — PostgreSQL em produção

**Decisão:** SQLite não será usado em produção.  
**Motivo:** Concorrência, confiabilidade, backups e crescimento SaaS.  
**Consequência:** A migração deve ocorrer antes da operação comercial.

### ADR-004 — R2 como armazenamento oficial

**Decisão:** Cloudflare R2 será a origem dos arquivos, servido por domínio personalizado e CDN.  
**Motivo:** Escala, custo de saída e integração com Cloudflare.  
**Consequência:** O fallback local deve ser desativado em produção.

### ADR-005 — Escopo individual dentro do tenant

**Decisão:** cada usuário administra apenas as telas, mídias, pastas, layouts, playlists, campanhas e relatórios que criou. O `tenantId` continua sendo a fronteira empresarial e o `createdById` define o workspace individual.
**Motivo:** impedir que usuários da mesma empresa ou o master alterem acidentalmente o material operacional de outro usuário.
**Consequência:** toda rota de leitura, escrita, publicação e relatório deve validar as duas fronteiras. O painel de clientes do master controla apenas cadastro, status e limites contratados.

### ADR-006 — Testes funcionais somente na VPS

**Decisão:** a validação integrada será executada contra a aplicação implantada na VPS, usando o script de auditoria cruzada.
**Motivo:** reproduzir proxy, TLS, PostgreSQL, containers e comunicação do ambiente real.
**Consequência:** builds e verificações estáticas rodam antes do push; a aprovação funcional integrada ocorre após um único deploy do pacote fechado.

---

## 13. Como manter este documento

Ao concluir uma entrega:

1. Atualizar a matriz de acompanhamento.
2. Registrar a data.
3. Informar se houve alteração arquitetural.
4. Adicionar uma ADR se a decisão for relevante.
5. Não marcar itens do simulador web como concluídos no Android.
6. Manter as prioridades alinhadas com o produto comercial.

Este arquivo deve permanecer no repositório e acompanhar todas as versões do sistema.
