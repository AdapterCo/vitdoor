# VitDoor Player Android — especificação para projeto Flutter separado

> Documento de criação e implementação do aplicativo oficial para TV Box, Android TV e totens Android.
>
> Repositório sugerido: `vitdoor-player-flutter`. O painel web e o backend permanecem no repositório `vitdoor`.

**Versão:** 2.0  
**Data:** 13/08/2026  
**Estado:** especificação oficial; solução para captura de tela (screenshot sem tela escura em vídeo), NFC, Chamador de Senhas, Alertas, QR Code, Proof-of-Play e Relatórios do Anunciante concluídos no web/backend; aplicação Flutter em integração

## 1. Objetivo

Criar e manter o player comercial exclusivo do VitDoor como aplicativo Flutter para Android (`br.com.vitdoor.player`), capaz de:

- parear uma TV Box por código de uso único;
- receber programação exclusiva da tela autenticada via manifesto versionado;
- baixar e validar todas as mídias fisicamente antes da publicação;
- reproduzir vídeo, imagem, áudio, páginas permitidas e layouts multizona;
- reproduzir integralmente offline e após reinicialização;
- executar loop contínuo por padrão;
- respeitar áudio, volume e enquadramento por zona;
- exibir chamadas de senhas em tempo real (`TICKET_CALLED`) com som de Chime e síntese de voz (TTS);
- exibir alertas emergenciais sobrepostos com as 3 cores dinâmicas (Vermelho, Laranja, Azul);
- receber sincronização, volume, alerta, screenshot e reinicialização remotos;
- registrar proof-of-play offline com ID único idempotente e sincronizar posteriormente;
- operar em tela cheia, iniciar automaticamente no boot e oferecer modo quiosque/Lock Task;
- preservar a última programação válida quando uma atualização falhar (rollback atômico).

O aplicativo não possui funções administrativas. Todo o gerenciamento de mídias, clientes, telas, playlists, chamador de senhas e relatórios é realizado via painel web/API.

## 2. Decisão tecnológica

### 2.1 Camada Flutter

Flutter será usado para:

- tela de pareamento e estados de erro;
- renderização e coordenação das zonas;
- regras de playlist/layout;
- comunicação HTTP e WebSocket;
- banco local, fila de eventos e estado da aplicação;
- telemetria e diagnóstico;
- atualização visual e experiência para controle remoto.

### 2.2 Camada Android nativa obrigatória

Kotlin + AndroidX Media3 serão usados por meio de plugin local, Pigeon ou Platform Channels para:

- ExoPlayer/Media3 e superfícies de vídeo;
- `DownloadService`/`DownloadManager` para downloads persistentes;
- cache e índice nativo de mídia quando aplicável;
- inicialização após `BOOT_COMPLETED`;
- foreground service e watchdog;
- modo imersivo e quiosque/Lock Task;
- controle de volume do dispositivo;
- informações reais de armazenamento e memória;
- screenshot que inclua superfícies nativas de vídeo, quando suportado;
- reinicialização controlada do processo/aplicativo.

Não implementar um player de produção baseado apenas em WebView ou em streaming remoto. Flutter permite integração nativa por Platform Channels, e Media3 fornece download persistente e reprodução offline no Android.

## 3. Requisitos de plataforma

- Flutter stable vigente na criação do projeto, fixado no CI.
- Dart compatível com essa versão do Flutter.
- Android mínimo: API 24, salvo decisão posterior baseada nas TV Boxes compradas.
- Arquiteturas iniciais: `arm64-v8a` e `armeabi-v7a`; adicionar `x86_64` somente para emuladores.
- Orientações: landscape e portrait definidas pela tela cadastrada.
- Interface utilizável com D-pad, setas, Enter, Back e controle remoto.
- APK/AAB assinado; builds debug nunca devem ser instalados em clientes.

Antes de comprar lotes de TV Box, homologar chipset, decodificação H.264/H.265, resolução, versão Android, boot receiver, Ethernet/Wi-Fi, armazenamento real e suporte a modo quiosque.

## 4. Criação do projeto

Nome sugerido:

```text
vitdoor_player
```

Application ID sugerido:

```text
br.com.vitdoor.player
```

Comando inicial, executado na raiz vazia do novo repositório:

```bash
flutter create --platforms=android --org br.com.vitdoor --project-name vitdoor_player .
```

Criar três ambientes:

- `dev`: API local/homologação;
- `staging`: VPS de homologação;
- `production`: infraestrutura comercial.

Configuração de produção:

```text
API_BASE_URL=https://api.vitdoor.com.br/api
WS_URL=wss://api.vitdoor.com.br/ws
MEDIA_HOST=https://media.vitdoor.com.br
```

Endpoints nunca devem ficar espalhados em widgets. Usar configuração tipada por flavor e `--dart-define` ou arquivo gerado fora do Git.

## 5. Estrutura recomendada

```text
lib/
  app/
    app.dart
    bootstrap.dart
    router.dart
  core/
    config/
    database/
    errors/
    logging/
    network/
    security/
    telemetry/
  features/
    activation/
      data/
      domain/
      presentation/
    manifest/
      data/
      domain/
      application/
    downloads/
    playback/
      layout/
      playlist/
      zones/
    emergency/
    proof_of_play/
    remote_commands/
    diagnostics/
  native_bridge/
    media3_bridge.dart
    device_bridge.dart
android/app/src/main/kotlin/br/com/vitdoor/player/
  MainActivity.kt
  boot/BootReceiver.kt
  kiosk/KioskController.kt
  media/Media3PlayerPlugin.kt
  media/VitDoorDownloadService.kt
  device/DeviceInfoPlugin.kt
  screenshot/ScreenCapturePlugin.kt
test/
integration_test/
```

Usar arquitetura por features e separar:

- `data`: DTOs, HTTP, WebSocket e persistência;
- `domain`: entidades e regras puras;
- `application`: casos de uso e máquinas de estado;
- `presentation`: widgets e controladores de UI.

Evitar regras de negócio diretamente nos widgets.

## 6. Dependências sugeridas

Selecionar versões estáveis compatíveis no momento da criação e fixá-las no `pubspec.lock`.

- gerenciamento de estado: Riverpod ou Bloc; escolher apenas um;
- HTTP: Dio ou cliente equivalente com interceptors e timeouts;
- WebSocket: `web_socket_channel` ou cliente equivalente;
- banco relacional: Drift/SQLite;
- segredo/token: `flutter_secure_storage`, validando suporte do dispositivo;
- conectividade: `connectivity_plus`, sem tratá-la como prova de acesso à internet;
- caminhos e disco: `path_provider`;
- hash: pacote de criptografia SHA-256 com processamento em isolate;
- serialização: `json_serializable` + modelos imutáveis;
- logs: logger estruturado com redação de segredos;
- identificação de pacote/versão e dispositivo: plugins mantidos e compatíveis com Android TV.

Para vídeo offline e multizona, preferir um plugin próprio fino sobre Media3 em vez de depender de um plugin genérico incapaz de controlar `DownloadService`, superfícies múltiplas, cache e eventos necessários.

## 7. Contrato atual de ativação

### 7.1 Solicitar código

```http
POST /api/device/pairing
```

Autenticação: nenhuma. Limites atuais: 30 criações por IP/hora, além do limite global da API de 300 requisições por IP/minuto. Respostas: `201` criado e `429` excesso de solicitações.

Resposta atual:

```json
{
  "pairingId": "uuid",
  "pairingCode": "123-456",
  "pairingSecret": "segredo-temporario",
  "expiresAt": "2026-08-09T12:00:00.000Z"
}
```

Exibir apenas `pairingCode`. `pairingSecret` nunca aparece na UI ou logs.

### 7.2 Consultar ativação

```http
POST /api/device/pairing/{pairingId}/status
Authorization: Pairing {pairingSecret}
```

Limites atuais: 600 consultas por IP a cada 5 minutos, além do limite global. Respostas: `200` para `PENDING`/`PAIRED`, `401` para sessão ou segredo inválido, `410` para expiração e `429` por excesso.

Estados:

- `PENDING`: continuar polling com intervalo aproximado de 2,5 segundos;
- `EXPIRED` ou HTTP 410: limpar a sessão e gerar código novo;
- `PAIRED`: armazenar token e identificação com segurança.

Resposta pareada:

```json
{
  "status": "PAIRED",
  "deviceToken": "jwt-do-dispositivo",
  "screenId": "uuid",
  "screenName": "Totem Entrada"
}
```

O token é diferente do token de usuário, é revogável por versão e atualmente expira em 365 dias. Nunca armazenar em preferências comuns, logs, analytics ou backups Android.

## 8. WebSocket atual

Ao conectar em `wss://api.vitdoor.com.br/ws`, enviar:

```json
{
  "type": "REGISTER_PLAYER",
  "deviceToken": "token",
  "os": "Android TV",
  "appVersion": "1.0.0"
}
```

O aplicativo Flutter deve concluir o pareamento por HTTPS antes de abrir seu WebSocket operacional. Depois do pareamento, somente o token é a identidade oficial; não usar o código como autenticação permanente.

Implementar reconexão com backoff exponencial e jitter, por exemplo de 1 segundo até 60 segundos. Ao reconectar, registrar novamente o player e reconciliar o manifesto via HTTPS; não assumir que mensagens WebSocket antigas serão reenviadas.

Aviso atual de programação:

```json
{
  "type": "MANIFEST_UPDATED",
  "manifestVersion": 18,
  "manifestChecksum": "sha256-hexadecimal",
  "forceReload": false
}
```

### 8.1 Mensagens recebidas existentes

- `PAIRING_SUCCESS` / `PAIRING_CONFIRMED`: identidade, volume, orientação, conteúdo de compatibilidade do simulador e `manifestVersion`/`manifestChecksum` disponíveis;
- `PAIRING_PENDING`: ativação ainda não confirmada;
- `DEVICE_AUTH_FAILED`: apagar credencial inválida e voltar à ativação;
- `MANIFEST_UPDATED`: existe nova programação; contém somente `manifestVersion`, `manifestChecksum` e `forceReload`, exigindo busca autenticada por HTTPS;
- `CONTENT_UPDATED`: mensagem legada exclusiva do simulador web; não usar como fonte de programação no aplicativo Flutter;
- `SET_VOLUME`: aplicar volume indicado;
- `REBOOT`: reiniciar o aplicativo de forma controlada;
- `TAKE_SCREENSHOT`: capturar e responder, quando suportado;
- `TICKET_CALLED`: chamada de senha em tempo real; exibir overlay, tocar chime e pronunciar síntese de voz (TTS) — ver seção 27;
- `EMERGENCY_ALERT_TRIGGERED`: sobrepor alerta destinado à tela;
- `EMERGENCY_ALERT_CLEARED`: remover alerta;
- `TENANT_SUSPENDED`: parar a programação comercial e exibir estado bloqueado.

### 8.2 Mensagens enviadas existentes

Heartbeat a cada 10–30 segundos:

```json
{
  "type": "HEARTBEAT",
  "ramUsagePercent": 35,
  "cpuUsagePercent": 18,
  "storageFreeMb": 4096,
  "currentMediaName": "Oferta de sábado",
  "manifestVersion": 18
}
```

Confirmação de comando:

```json
{
  "type": "COMMAND_RESULT",
  "commandId": "uuid-do-comando",
  "action": "SYNC",
  "success": true,
  "message": "Manifesto 18 validado e ativado."
}
```

Nunca confirmar sincronização apenas porque recebeu a mensagem. Confirmar somente depois de baixar, validar e ativar a versão.

## 9. Manifesto versionado — contrato implementado no backend

O aplicativo Flutter deve tratar o endpoint abaixo como única fonte oficial da programação. O WebSocket apenas sinaliza que existe uma nova versão.

Endpoint:

```http
GET /api/device/manifest
Authorization: Bearer {deviceToken}
If-None-Match: "manifest-18-{checksum}"
```

Limite atual: 300 requisições por IP/minuto. Respostas: `200`, `304`, `401`, `404` e `429`. A autenticação deriva `screenId` e `tenantId` exclusivamente do token revogável do dispositivo.

Resposta atual:

```json
{
  "schemaVersion": 1,
  "version": 18,
  "screen": {
    "id": "uuid",
    "orientation": "HORIZONTAL",
    "volume": 80
  },
  "activePlaylist": null,
  "activeLayout": null,
  "assets": [
    {
      "id": "media-id",
      "version": 1,
      "url": "https://media.vitdoor.com.br/tenants/.../arquivo.mp4",
      "mimeType": "video/mp4",
      "sizeBytes": 5818290,
      "checksum": "sha256-hexadecimal",
      "durationSeconds": 8
    }
  ],
  "checksumAlgorithm": "SHA-256",
  "checksum": "sha256-do-manifesto"
}
```

Regras:

- versão cresce de forma monotônica por tela;
- manifesto publicado é imutável;
- cada combinação `screen.id + version` é persistida pelo backend em `ScreenManifest`; novas leituras da mesma versão devolvem exatamente o JSON e checksum publicados originalmente;
- todos os assets têm URL imutável, tamanho e SHA-256;
- resposta usa ETag e retorna HTTP 304 quando `If-None-Match` corresponde;
- uma tela recebe somente seu manifesto;
- a publicação falha de forma fechada se tela, playlist, layout ou mídia não pertencerem ao mesmo `tenantId` e proprietário da credencial;
- o app rejeita manifesto cujo `screen.id` não corresponde à credencial;
- o checksum do manifesto é calculado sobre `schemaVersion`, `version`, `screen`, `activePlaylist`, `activeLayout` e `assets`, nesta ordem;
- o app rejeita versão menor que a ativa ou a mesma versão acompanhada por outro checksum;
- conteúdo atual continua tocando durante download da próxima versão.

### 9.1 Schema canônico de `activePlaylist`

**Estado:** `BACKEND_PRONTO` — integração Flutter pendente.

```json
{
  "id": "uuid",
  "name": "Ofertas da semana",
  "description": "Programação principal",
  "category": "Geral",
  "isLoop": true,
  "createdAt": "2026-08-09T12:00:00.000Z",
  "updatedAt": "2026-08-09T12:10:00.000Z",
  "items": [
    {
      "id": "uuid",
      "mediaId": "uuid-ou-null",
      "layoutId": null,
      "orderIndex": 0,
      "durationSeconds": 8,
      "media": {
        "id": "uuid",
        "name": "Oferta.mp4",
        "type": "VIDEO",
        "url": "https://media.vitdoor.com.br/tenants/.../arquivo.mp4",
        "thumbnailUrl": null,
        "durationSeconds": 8,
        "sizeBytes": 5818290,
        "checksum": "sha256-hexadecimal",
        "mimeType": "video/mp4",
        "version": 1
      },
      "layout": null
    }
  ]
}
```

Regras:

- `activePlaylist` pode ser `null`;
- `activePlaylist` e `activeLayout` são mutuamente exclusivos no nível da tela; o backend rejeita atribuição simultânea e escolher um limpa o outro;
- `isLoop` é sempre `true` no produto atual;
- cada item possui exatamente um entre `mediaId` e `layoutId`;
- `orderIndex` começa em zero e define a ordem;
- `durationSeconds` é inteiro entre 1 e 86400;
- para item de mídia, `media` é preenchido e `layout` é `null`; para item de layout ocorre o inverso;
- tipos binários atuais: `VIDEO`, `IMAGE`, `AUDIO` e `PDF`; tipos dinâmicos aceitos: `RSS` e `WEB_PAGE`;
- `assets` do manifesto é a fonte canônica de URL, tamanho, MIME, versão e checksum; referências repetidas dentro de playlist/layout devem ser resolvidas por `mediaId`.
- cada mídia pode conter um campo `cta` (Call-to-Action) com configuração de QR Code — ver seção 26.

#### Campo `cta` em itens de mídia

**Estado:** `BACKEND_PRONTO` — integração Flutter pendente.

Quando uma mídia possui QR Code configurado, o campo `cta` é incluído no objeto `media` dentro de `activePlaylist.items[].media` e também nos assets do manifesto. Estrutura:

```json
{
  "id": "uuid",
  "name": "Oferta.mp4",
  "type": "VIDEO",
  "url": "https://media.vitdoor.com.br/tenants/.../arquivo.mp4",
  "durationSeconds": 8,
  "sizeBytes": 5818290,
  "checksum": "sha256-hexadecimal",
  "mimeType": "video/mp4",
  "version": 1,
  "cta": {
    "enabled": true,
    "type": "WHATSAPP",
    "target": "https://wa.me/5511999999999",
    "position": "BOTTOM_RIGHT",
    "size": 160,
    "label": "Fale conosco!"
  }
}
```

Campos do objeto `cta`:

| Campo | Tipo | Valores | Descrição |
|---|---|---|---|
| `enabled` | boolean | `true` | Sempre `true` quando presente e ativo |
| `type` | string | `WHATSAPP`, `INSTAGRAM` | Canal de destino |
| `target` | string | URL | URL direta do destino (`wa.me/...` ou `instagram.com/...`) — **não usar diretamente no QR Code** |
| `position` | string | `TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT` | Posição do QR Code na tela |
| `size` | integer | 96–320 | Tamanho em pixels do QR Code |
| `label` | string | max 80 chars | Texto exibido abaixo do QR Code |

> **IMPORTANTE:** o campo `target` contém a URL de destino final (WhatsApp ou Instagram). O player Flutter **não deve gerar o QR Code apontando diretamente para `target`**. Em vez disso, deve construir a URL de rastreamento via o endpoint `/r/:mediaId` — ver seção 26. Usar `target` diretamente ignora todo o rastreamento de conversão.

Quando `cta` é `null` ou `cta.enabled` é `false`, nenhum QR Code é exibido. Respeitar a posição exata informada pelo manifesto e nunca inventar posição padrão.


### 9.2 Schema canônico de `activeLayout`

**Estado:** `BACKEND_PRONTO` — integração Flutter pendente.

```json
{
  "id": "uuid",
  "name": "Mercado 70/30",
  "description": null,
  "orientation": "HORIZONTAL",
  "updatedAt": "2026-08-09T12:10:00.000Z",
  "canvasConfig": {
    "version": 2,
    "preset": "70_30",
    "zones": [
      {
        "id": "main",
        "name": "Área principal",
        "widthPercent": 70,
        "fit": "CONTAIN",
        "loop": true,
        "audioEnabled": true,
        "items": [
          {
            "mediaId": "uuid",
            "name": "Vídeo do produto",
            "type": "VIDEO",
            "url": "https://media.vitdoor.com.br/tenants/.../arquivo.mp4",
            "durationSeconds": 5
          }
        ]
      },
      {
        "id": "side",
        "name": "Área lateral",
        "widthPercent": 30,
        "fit": "COVER",
        "loop": true,
        "audioEnabled": false,
        "items": [
          {
            "mediaId": "uuid",
            "name": "Encarte do produto",
            "type": "IMAGE",
            "url": "https://media.vitdoor.com.br/tenants/.../encarte.png",
            "durationSeconds": 5
          }
        ]
      }
    ],
    "ticker": {
      "enabled": true,
      "text": "Ofertas válidas enquanto durarem os estoques"
    },
    "clock": {
      "enabled": true,
      "position": "FOOTER"
    }
  }
}
```

Contrato de layout v2:

- `activeLayout` pode ser `null`;
- quando `activeLayout` estiver preenchido, `activePlaylist` será `null`; layouts usados como itens continuam dentro de `activePlaylist.items[].layout`;
- orientação suportada nesta versão: `HORIZONTAL`;
- `preset`: `FULL`, `HALF` ou `70_30`;
- `FULL`: zona `main` com 100%; `HALF`: `main` 50% e `side` 50%; `70_30`: `main` 70% e `side` 30%;
- `fit`: `CONTAIN` (inteira, sem corte), `COVER` (preenche e pode cortar) ou `FILL` (estica);
- cada zona deve possuir ao menos um item quando criada/publicada pelo painel;
- `loop` é sempre `true`;
- no máximo uma zona pode ter `audioEnabled: true`; as demais devem ficar mudas;
- os itens rodam independentemente dentro da própria zona, na ordem recebida;
- vídeos avançam pelo término real; imagens e conteúdos estáticos usam `durationSeconds`;
- `ticker.enabled` é opcional; quando ativo, `text` é obrigatório e limitado a 500 caracteres;
- `clock.position`: `TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT` ou `FOOTER`;
- `FOOTER` só é válido quando o ticker está ativo;
- data/hora vêm do relógio real do Android;
- dentro de playlists, o campo `layout` usa este mesmo objeto com `canvasConfig` estruturado.

### 9.3 Validação de compatibilidade

O Flutter deve rejeitar `schemaVersion` ou `canvasConfig.version` desconhecida, manter a última versão ativa e registrar diagnóstico. Não tentar inferir presets, zonas, enumerações ou valores ausentes.

## 10. Banco e arquivos locais

Tabelas/entidades mínimas:

- `device_identity`: screenId, nome e metadados não secretos;
- `manifests`: versão, JSON, estado (`downloading`, `ready`, `active`, `failed`), datas;
- `assets`: id, versão, URL, caminho local, tamanho, SHA-256, status, último acesso;
- `download_jobs`: tentativas, bytes, erro e próxima execução;
- `proof_events`: evento, horário, duração, conclusão e estado de envio;
- `command_results`: commandId, resultado e estado de envio;
- `app_state`: versão ativa e anterior;
- `diagnostics`: falhas recentes com retenção limitada.

The token fica no Android Keystore via armazenamento seguro, não no banco comum.

Diretórios sugeridos:

```text
files/media/{assetId}/{version}/asset.bin
files/manifests/{version}/manifest.json
cache/downloads/*.part
```

Downloads usam arquivo `.part`; somente após tamanho e SHA-256 válidos ocorre rename atômico para o destino final.

## 11. Algoritmo de sincronização atômica

1. Receber aviso de atualização pelo WebSocket.
2. Buscar manifesto autenticado por HTTPS.
3. Validar schema, screenId e versão.
4. Comparar assets com o índice local.
5. Verificar espaço antes de baixar.
6. Baixar assets ausentes com retomada e limites de concorrência.
7. Validar `sizeBytes` e SHA-256 em isolate/thread de trabalho.
8. Marcar manifesto como `ready` somente quando todos os assets estiverem válidos.
9. Trocar a versão ativa em transação única.
10. Iniciar a nova programação.
11. Enviar `COMMAND_RESULT` com sucesso e versão ativa.
12. Manter ao menos a versão anterior válida para rollback.
13. Remover assets sem referência somente após a ativação e respeitando a política de espaço.

Em qualquer falha, registrar diagnóstico, informar falha ao servidor e continuar reproduzindo a versão anterior.

## 12. Reprodução

### 12.1 Tipos

- `IMAGE`: duração do manifesto e enquadramento configurado;
- `VIDEO`: duração real do arquivo; não cortar por duração artificial;
- `AUDIO`: quando usado como item ou trilha autorizada;
- `WEB_PAGE`/`HTML`: somente fontes explicitamente permitidas e com política de segurança;
- PDF não entra no MVP do player até definir renderização e paginação.

### 12.2 Loop

- loop é ativo por padrão e não configurável pelo cliente no MVP;
- playlist reinicia após o último item;
- zona reinicia sua sequência de forma independente;
- vídeo único em uma zona reinicia sem tela parada;
- falha em um item pula para o próximo, sem derrubar outras zonas.

### 12.3 Layouts e zonas

- suportar tela inteira, 50/50 e 70/30 inicialmente;
- cada zona possui sequência, fit e estado independente;
- `CONTAIN`: mídia inteira, podendo sobrar bordas;
- `COVER`: preenche e pode cortar;
- `FILL`: estica para ocupar;
- rodapé e relógio são opcionais;
- relógio pode ocupar cantos ou rodapé conforme manifesto;
- alerta emergencial sobrepõe a programação sem destruir o estado atual.

### 12.4 Áudio

- somente uma zona pode emitir áudio ao mesmo tempo;
- `audioEnabled` do manifesto define a zona sonora;
- volume do player respeita o valor remoto e a política do dispositivo;
- não iniciar vídeos permanentemente mudos por conveniência de autoplay;
- em TV Box dedicada, configurar áudio nativamente e registrar falhas de saída/codec;
- ao mudar de item ou layout, liberar o player anterior para evitar áudio fantasma.

## 13. Proof-of-play

**Estado:** `BACKEND_E_PAINEL_PRONTOS` — O backend (`/api/proof-of-play/log` e `/log-batch`) e o Painel Web Admin estão 100% implementados e aguardando as requisições HTTP enviadas pelo aplicativo Flutter Android ao término de cada exibição de mídia.

> **Observação sobre a mensagem "Aguardando recepção dos primeiros logs de Proof-of-Play dos Players...":**  
> Essa mensagem é exibida no Painel Web Admin na aba **Proof of Play & Relatórios** quando a tela pareada ainda não enviou nenhum evento de reprodução auditado via API HTTP. Assim que o aplicativo Flutter realizar o primeiro `POST /api/proof-of-play/log` ou `POST /api/proof-of-play/log-batch`, o histórico em tempo real do painel será atualizado automaticamente com o nome da mídia, horário e duração exibida!

---

### 13.1 Schema do Evento de Reprodução

Registrar no dispositivo Android ao finalizar ou interromper cada mídia exibida:

```json
{
  "eventId": "uuid-v4-gerado-uma-vez-no-dispositivo",
  "screenId": "uuid-da-tela-pareada",
  "mediaName": "Oferta de Sábado - Hambúrguer.mp4",
  "playedAt": "2026-08-13T12:00:00.000Z",
  "durationSeconds": 15,
  "completed": true
}
```

---

### 13.2 Endpoints de Envio HTTP

#### Opção A: Envio em Lote (Recomendado para fila offline)

```http
POST /api/proof-of-play/log-batch
Authorization: Bearer {deviceToken}
Content-Type: application/json

{
  "items": [
    {
      "eventId": "123e4567-e89b-12d3-a456-426614174000",
      "screenId": "98f12a34-1122-3344-5566-778899aabbcc",
      "mediaName": "Oferta de Sábado - Hambúrguer.mp4",
      "playedAt": "2026-08-13T12:00:00.000Z",
      "durationSeconds": 15,
      "completed": true
    }
  ]
}
```

Resposta `200 OK`:
```json
{
  "received": 1,
  "accepted": 1,
  "duplicates": 0,
  "rejected": 0,
  "eventIds": ["123e4567-e89b-12d3-a456-426614174000"]
}
```

#### Opção B: Envio Individual (Evento a evento)

```http
POST /api/proof-of-play/log
Authorization: Bearer {deviceToken}
Content-Type: application/json

{
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "screenId": "98f12a34-1122-3344-5566-778899aabbcc",
  "mediaName": "Oferta de Sábado - Hambúrguer.mp4",
  "playedAt": "2026-08-13T12:00:00.000Z",
  "durationSeconds": 15,
  "completed": true
}
```

Resposta `201 Created`:
```json
{
  "accepted": true,
  "duplicate": false,
  "eventId": "123e4567-e89b-12d3-a456-426614174000",
  "id": "cldx..."
}
```

---

### 13.3 Regras de Implementação no Flutter

- **Fila Persistente Offline**: Sempre salvar o evento num banco local (ex.: SQLite / Hive / Isar) antes de tentar o envio via rede. Se a TV Box estiver sem internet, os eventos são acumulados localmente e sincronizados em lote (`log-batch`) quando a conexão restabelecer.
- **UUID Idempotente Único (`eventId`)**: Cada exibição ganha um `eventId` UUID v4 único gerado **UMA ÚNICA VEZ** no dispositivo. Nunca troque o `eventId` ao fazer retries ou reinicializar o app! O backend usa este ID para descartar duplicatas sem gerar erros.
- **`mediaName`**: Deve ser o nome exatamente igual ao nome do arquivo de mídia retornado no manifesto JSON (ex: `"logo.png"` ou `"VideoPromocional.mp4"`).
- **`durationSeconds`**: Inteiro de 1 a 86400 segundos.
- **`playedAt`**: String formatada em ISO-8601 UTC (ex: `DateTime.now().toUtc().toIso8601String()`).

---

### 13.4 Código de Exemplo em Dart/Flutter (`ProofOfPlayService`)

O código a seguir pode ser utilizado diretamente no aplicativo Flutter para gerenciar a fila e enviar os logs de reprodução:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

class ProofOfPlayEvent {
  final String eventId;
  final String screenId;
  final String mediaName;
  final String playedAt;
  final int durationSeconds;
  final bool completed;

  ProofOfPlayEvent({
    required this.eventId,
    required this.screenId,
    required this.mediaName,
    required this.playedAt,
    required this.durationSeconds,
    this.completed = true,
  });

  Map<String, dynamic> toJson() => {
        'eventId': eventId,
        'screenId': screenId,
        'mediaName': mediaName,
        'playedAt': playedAt,
        'durationSeconds': durationSeconds,
        'completed': completed,
      };
}

class ProofOfPlayService {
  final String apiBaseUrl; // ex: https://api.vitdoor.com.br
  final String deviceToken;
  final String screenId;
  final _uuid = const Uuid();

  // Fila local de eventos em memória (recomendado persistir no SQLite/Hive)
  final List<ProofOfPlayEvent> _queue = [];

  ProofOfPlayService({
    required this.apiBaseUrl,
    required this.deviceToken,
    required this.screenId,
  });

  /// Chamado pelo player do Flutter imediatamente após uma mídia terminar de ser exibida
  void recordPlay({
    required String mediaName,
    required int durationSeconds,
    bool completed = true,
  }) {
    final event = ProofOfPlayEvent(
      eventId: _uuid.v4(),
      screenId: screenId,
      mediaName: mediaName,
      playedAt: DateTime.now().toUtc().toIso8601String(),
      durationSeconds: durationSeconds,
      completed: completed,
    );

    _queue.add(event);
    syncQueue(); // Tenta enviar imediatamente
  }

  /// Sincroniza a fila acumulada com o backend VitDoor
  Future<void> syncQueue() async {
    if (_queue.isEmpty) return;

    final itemsToSend = List<ProofOfPlayEvent>.from(_queue.take(100));
    final url = Uri.parse('$apiBaseUrl/api/proof-of-play/log-batch');

    try {
      final response = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $deviceToken',
        },
        body: jsonEncode({
          'items': itemsToSend.map((e) => e.toJson()).toList(),
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List<dynamic> eventIds = data['eventIds'] ?? [];
        
        // Remove os eventos aceitos ou duplicados da fila
        _queue.removeWhere((item) => eventIds.contains(item.eventId));
        print('Proof-of-play sincronizado com sucesso: ${eventIds.length} eventos.');
      } else {
        print('Erro ao enviar Proof-of-play. Status: ${response.statusCode}');
      }
    } catch (e) {
      print('Falha na conexão ao enviar Proof-of-play (será tentado novamente): $e');
    }
  }
}
```

## 14. Inicialização, quiosque e recuperação

- registrar `BOOT_COMPLETED` e iniciar conforme restrições da versão Android;
- usar foreground service quando necessário;
- entrar em modo imersivo e esconder barras do sistema;
- bloquear Back/Home somente quando o equipamento estiver provisionado como Device Owner/Lock Task;
- fornecer saída administrativa protegida por PIN local ou comando autorizado;
- manter tela ligada durante reprodução;
- watchdog detecta travamento do pipeline, não reinicia em loop infinito;
- após crash ou falta de energia, abrir versão ativa do banco antes de tentar rede;
- registrar contagem de crashes e última causa conhecida.

Modo quiosque completo depende de provisionamento/MDM ou Device Owner. Não prometer bloqueio absoluto em uma TV Box comum sem validar o firmware.

## 15. Comandos remotos

**Estado:** `BACKEND_PRONTO` para `SYNC`, `SET_VOLUME`, `TAKE_SCREENSHOT` e `REBOOT`; integração Flutter pendente.

Criação pelo painel:

```http
POST /api/screens/{screenId}/remote-command
Content-Type: application/json
Cookie: vitdoor_session={sessão HttpOnly do painel}

{
  "tenantId": "uuid",
  "action": "SET_VOLUME",
  "payload": { "volume": 70 }
}
```

Este endpoint pertence ao painel, não ao Flutter. O backend usa o usuário autenticado para fixar `tenantId` e proprietário; tela externa ao workspace retorna `404`. Limite atual: 300 requisições por IP/minuto. Erros previstos: `400` ação/payload inválido, `401` sessão inválida, `404` tela sem acesso e `429` excesso.

Resposta `202`:

```json
{
  "commandId": "uuid-v4-gerado-pelo-backend",
  "action": "SET_VOLUME",
  "status": "SENT",
  "delivered": true,
  "createdAt": "2026-08-09T12:00:00.000Z",
  "expiresAt": "2026-08-10T12:00:00.000Z",
  "message": "Comando SET_VOLUME entregue ao dispositivo; aguardando confirmação."
}
```

Se a tela estiver offline, `status` será `PENDING` e `delivered` será `false`. O backend persiste e entrega na reconexão. Estados: `PENDING`, `SENT`, `SUCCEEDED`, `FAILED` e `EXPIRED`. Comandos pendentes expiram após 24 horas. Consultar estado em `GET /api/screens/{screenId}/commands/{commandId}?tenantId={tenantId}`.

Payloads recebidos pelo dispositivo:

```json
{ "type": "SET_VOLUME", "commandId": "uuid", "deviceId": "uuid-da-tela", "createdAt": "ISO-8601", "expiresAt": "ISO-8601", "payload": { "volume": 70 } }
{ "type": "TAKE_SCREENSHOT", "commandId": "uuid", "deviceId": "uuid-da-tela", "createdAt": "ISO-8601", "expiresAt": "ISO-8601" }
{ "type": "REBOOT", "commandId": "uuid", "deviceId": "uuid-da-tela", "createdAt": "ISO-8601", "expiresAt": "ISO-8601" }
{
  "type": "MANIFEST_UPDATED",
  "commandId": "uuid-do-comando-sync",
  "deviceId": "uuid-da-tela",
  "createdAt": "2026-08-09T12:00:00.000Z",
  "expiresAt": "2026-08-10T12:00:00.000Z",
  "manifestVersion": 19,
  "manifestChecksum": "sha256-hexadecimal",
  "forceReload": true
}
```

Confirmação do dispositivo:

```json
{
  "type": "COMMAND_RESULT",
  "commandId": "uuid",
  "action": "SET_VOLUME",
  "success": true,
  "message": "Volume aplicado em 70%."
}
```

Regras idempotentes:

- persistir `commandId` e o resultado antes de executar uma ação irreversível;
- ao receber novamente o mesmo ID, não executar outra vez; devolver o resultado persistido;
- rejeitar sem executar comandos cujo `deviceId` seja diferente da identidade local ou cujo `expiresAt` já tenha passado;
- confirmar `SYNC` apenas depois de validar e ativar o manifesto;
- em `REBOOT`, persistir o sucesso antes de reiniciar para impedir ciclo de reboot;
- `SET_VOLUME` aceita somente inteiro entre 0 e 100;
- ação ou payload desconhecido deve retornar `success: false`, sem tentativa de inferência;
- o backend pode reenviar até 50 comandos `PENDING`/`SENT` recentes após reconexão.

### 15.1 Upload e resposta de screenshot

O Flutter não envia imagem Base64 pelo WebSocket. Após receber `TAKE_SCREENSHOT`, captura JPEG ou PNG por PixelCopy/camada nativa e envia:

```http
POST /api/device/screenshots/{commandId}
Authorization: Bearer {deviceToken}
Content-Type: multipart/form-data

file=@screenshot.jpg
```

Limite: 2 MB, um arquivo por requisição e 30 uploads por IP por hora. Tipos aceitos após validação binária: `image/jpeg` e `image/png`.

Resposta `201`:

```json
{
  "commandId": "uuid",
  "status": "SUCCEEDED",
  "capturedAt": "2026-08-09T12:00:00.000Z",
  "mimeType": "image/jpeg",
  "sizeBytes": 345678,
  "duplicate": false
}
```

Retry de comando já concluído retorna `200` e `duplicate: true`. Erros: `400` campo ausente, `401` token inválido, `404` comando não pertence à tela, `409` comando finalizado com falha/expirado, `413` acima de 2 MB e `415` tipo binário inválido. Se a captura falhar, enviar `COMMAND_RESULT` com o mesmo `commandId`, `action: TAKE_SCREENSHOT` e a razão curta.

---

### 15.2 Solução para Captura de Tela sem Ficar Escura / Preta (`SurfaceView` vs `PixelCopy` / `TextureView`)

> **Por que o Screenshot fica 100% Preto/Escuro durante a exibição de Vídeos no Android?**  
> No Android, os reprodutores de vídeo nativos (como ExoPlayer, `video_player` ou `media_kit`) renderizam os frames de vídeo em uma camada separada acelerada por hardware chamada **`SurfaceView`**. Quando a aplicação tenta tirar um print da tela com métodos convencionais de View (`view.getDrawingCache()` ou `RepaintBoundary` do Flutter), o sistema captura a hierarquia de interface gráfica (textos, QR Code, rodapé), mas a área do vídeo é renderizada como um **buraco preto transparente/escuro**, pois o hardware de vídeo ignora o buffer comum de UI.

#### Como o desenvolvedor Flutter DEVE resolver a imagem preta no Screenshot:

1. **Uso da API Nativa `PixelCopy` (Recomendado para Android 8.0+ / API 26+)**:
   Em vez de usar `RepaintBoundary` do Flutter no widget raiz, o plugin nativo Android (Kotlin/Java) deve utilizar a API oficial `PixelCopy.request()`, que solicita diretamente à GPU os buffers da janela (`Window`) contendo a fusão da camada gráfica com a camada do vídeo:

   ```kotlin
   import android.view.PixelCopy
   import android.graphics.Bitmap
   import android.os.Handler
   import android.os.Looper

   fun captureScreenWithVideo(window: Window, callback: (Bitmap?) -> Unit) {
       val bitmap = Bitmap.createBitmap(window.decorView.width, window.decorView.height, Bitmap.Config.ARGB_8888)
       PixelCopy.request(
           window,
           bitmap,
           { copyResult ->
               if (copyResult == PixelCopy.SUCCESS) {
                   callback(bitmap)
               } else {
                   callback(null)
               }
           },
           Handler(Looper.getMainLooper())
       )
   }
   ```

2. **Modo Textura (`TextureView`) no Reprodutor de Vídeo**:
   Se a captura for realizada dentro do motor do Flutter, o player de vídeo (`video_player` ou `chewie`) deve ser inicializado configurando a renderização via memória de textura (`useTexture: true` ou `TextureView`). Isso disponibiliza o buffer de frames para a pipeline de rasterização do Flutter, permitindo que a imagem seja capturada sem fundo preto.

3. **Compactação e Redimensionamento Antes do Envio**:
   - Redimensionar o Bitmap capturado para no máximo **1280x720** pixels.
   - Salvar em formato **JPEG com qualidade 80%**.
   - Garantir que o tamanho do arquivo não ultrapasse **2 MB** antes de disparar o `POST /api/device/screenshots/{commandId}`.

---

- `SYNC`: implementado;
- `SET_VOLUME`: implementado;
- `TAKE_SCREENSHOT`: implementado no backend;
- `REBOOT`: reinicia o aplicativo; implementado no contrato;
- `REBOOT_DEVICE`: não implementado; exige Device Owner/firmware autorizado;
- `CLEAR_CACHE`: não implementado; quando existir, nunca removerá assets da versão ativa;
- alertas: aplicar somente à tela destinatária;
- suspensão: interromper transmissão, preservar dados locais e aguardar reativação.

Screenshot de Flutter não captura necessariamente uma superfície Media3/PlatformView. Implementar PixelCopy ou solução nativa compatível e retornar falha explícita quando o hardware impedir.

## 16. Segurança

- aceitar somente HTTPS/WSS;
- token no Android Keystore;
- não desabilitar validação TLS;
- não registrar token, segredo de pareamento ou URL assinada;
- validar host de mídia esperado e redirects;
- validar tamanho, MIME e SHA-256 antes de ativar;
- impedir path traversal ao criar caminhos locais;
- usar banco e arquivos privados do app;
- APK assinado e ofuscado conforme estratégia de distribuição;
- mecanismo de revogação volta à tela de ativação;
- conta suspensa não apaga dados, mas bloqueia reprodução comercial;
- nenhuma tela pode receber conteúdo, alerta ou relatório de outra identidade.

Certificate pinning não é requisito inicial porque aumenta risco operacional de rotação. Reavaliar com política formal de chaves.

## 17. Telemetria

Enviar dados reais, nunca valores aleatórios:

- versão do app e Android;
- fabricante/modelo;
- orientação e resolução;
- espaço livre e total;
- versão do manifesto ativa;
- mídia atual;
- estado do download;
- conexão Wi-Fi/Ethernet quando disponível;
- memória do processo/dispositivo conforme APIs permitidas;
- último erro resumido sem dados pessoais ou segredos.

CPU e RAM podem variar por limitações do Android; quando não houver medição confiável, enviar `null`, não inventar número.

## 18. Estados visuais

- `Unpaired`: logo, código grande, validade e indicador de conexão;
- `Pairing`: aguardando confirmação;
- `Downloading`: progresso discreto mantendo conteúdo antigo;
- `Playing`: sem elementos administrativos;
- `Offline`: continua tocando, indicador opcional apenas em diagnóstico;
- `NoContent`: mensagem neutra;
- `Suspended`: conta temporariamente indisponível;
- `FatalError`: código de diagnóstico e tentativa automática controlada.

Todos os elementos interativos devem ter foco visível para D-pad.

## 19. Testes obrigatórios

### Unitários

- parser e validação de manifesto;
- ordem, loop e duração de playlist;
- cálculo de assets necessários;
- transição atômica de versões;
- política de limpeza de cache;
- fila e retry de proof-of-play;
- seleção de áudio por zona.

### Integração

- pareamento pendente, expirado, usado e confirmado;
- token revogado e cliente suspenso;
- WebSocket desconectado/reconectado;
- download interrompido e retomado;
- checksum incorreto;
- falta de espaço;
- ativação e rollback;
- alerta destinado apenas à tela correta;
- comando com confirmação de sucesso/falha.

### Dispositivo real

- boot sem internet;
- perda de rede durante vídeo;
- desligamento durante download;
- reprodução contínua por no mínimo 24–72 horas;
- áudio HDMI;
- vídeos H.264 e demais codecs homologados;
- layouts simultâneos 50/50 e 70/30;
- landscape/portrait;
- controle remoto e quiosque;
- aquecimento, memória e armazenamento;
- atualização de APK preservando identidade e conteúdo.

Testar com master e dois clientes, comprovando que nenhuma tela recebe conteúdo ou alerta cruzado.

## 20. CI/CD e distribuição

**Estado:** política aprovada; integração CI e homologação ainda pendentes.

Pipeline mínimo:

1. `flutter analyze`;
2. testes unitários;
3. testes de widgets;
4. build APK por flavor;
5. assinatura apenas em ambiente protegido;
6. geração de hashes e artefatos;
7. release notes e versão semântica;
8. instalação automática em dispositivo de homologação quando possível.

### 20.1 Assinatura release

Decisão para `br.com.vitdoor.player`:

- usar Play App Signing para proteger a chave final de assinatura;
- manter uma upload key exclusiva do VitDoor para envio de AAB;
- armazenar o keystore da upload key no cofre de segredos do CI, codificado para transporte somente dentro do job protegido;
- fornecer ao job `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_STORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS` e `ANDROID_UPLOAD_KEY_PASSWORD` como segredos mascarados;
- o job decodifica o `.jks` em diretório temporário do runner, compila e elimina o arquivo ao terminar;
- Gradle lê os valores diretamente de variáveis de ambiente; não criar `android/key.properties` persistente no CI;
- para build release local excepcional, aceitar somente caminho externo indicado por `VITDOOR_KEY_PROPERTIES`, apontando para arquivo fora do repositório e com permissão restrita;
- `.jks`, `.keystore`, `key.properties`, APK e AAB privados permanecem no `.gitignore`;
- registrar em cofre separado o certificado público SHA-256, alias, data de criação, responsável e procedimento de rotação;
- builds debug não podem ser instalados em clientes nem acessar produção.

O repositório Flutter deve falhar o build `release` se qualquer segredo estiver ausente. Não assinar automaticamente com debug e não incluir senha literal em Gradle, YAML, Dart ou logs.

### 20.2 Distribuição e MDM

Canal inicial comercial aprovado:

1. dispositivos certificados compatíveis com Android Enterprise/Managed Google Play;
2. aplicativo privado no Managed Google Play;
3. EMM com provisionamento Fully Managed/Dedicated Device;
4. instalação obrigatória e atualização controlada do app;
5. política Kiosk/Lock Task, bloqueio de configurações e reinicialização controlada;
6. rollout em anéis: laboratório, piloto interno, clientes piloto e produção;
7. rollback pela faixa anterior da loja/EMM, preservando banco, token e cache compatível.

Não distribuir produção por link público, WhatsApp, e-mail, USB ou APK debug. TV Boxes AOSP sem serviços Google não entram no primeiro piloto comercial. Se forem adotadas depois, usar outro `applicationId` (sugestão `br.com.vitdoor.player.enterprise`), outra chave de assinatura e MDM próprio; esse canal não pode atualizar nem ser atualizado pelo pacote do Managed Google Play.

### 20.3 Hardware e homologação

**Estado:** `HOMOLOGAÇÃO PENDENTE`. Nenhum modelo está homologado nesta data. “Compatível no papel” não significa homologado.

Antes do piloto, adquirir ao menos:

- um modelo Google TV/Android TV certificado de entrada;
- um modelo certificado com Ethernet e USB para uso contínuo;
- um equipamento industrial candidato fornecido com suporte formal a Device Owner, boot automático e watchdog, somente se houver intenção de canal AOSP.

Critérios mínimos do modelo comercial:

- Android API 24 ou superior, 64 bits preferencialmente;
- 2 GB de RAM no mínimo, 4 GB recomendados para multizona;
- 16 GB úteis no mínimo, 32 GB recomendados para cache;
- HDMI estável em 1080p60 e 2160p60 conforme oferta;
- decodificação por hardware H.264 AVC e H.265 HEVC; AV1 é requisito para a classe 4K futura;
- AAC-LC obrigatório; Dolby/DTS somente se licenciado e validado;
- Wi-Fi 5 GHz e Ethernet nativa para instalações comerciais sempre que possível;
- armazenamento privado persistente após reboot e falta de energia;
- suporte comprovado a boot receiver, foreground service, modo imersivo e Lock Task/Device Owner;
- firmware com atualização e identificação de versão controláveis.

Bateria de homologação por modelo/firmware:

1. 100 ciclos de corte e retorno de energia, confirmando boot, identidade e retomada offline;
2. 168 horas contínuas com playlist simples e multizona, sem crescimento contínuo de RAM/disco;
3. H.264 Baseline/Main/High em 720p, 1080p e 4K quando aplicável;
4. H.265 Main/Main10, VP9 e AV1 somente quando declarados pelo fornecedor;
5. imagens JPEG/PNG/WebP nos três modos de fit;
6. AAC estéreo, mute por zona, volume remoto e troca de HDMI;
7. HDMI hotplug, troca de resolução/EDID, tela desligada/ligada e CEC quando usado;
8. Ethernet, Wi-Fi, perda total de rede e reconexão prolongada;
9. download interrompido, falta de espaço, checksum inválido e rollback;
10. kiosk/Lock Task, tentativa de Home/Back/Recentes, reboot remoto e saída administrativa;
11. screenshot incluindo superfície Media3;
12. medição de travamentos, frames perdidos e integridade do armazenamento;
13. atualização e downgrade controlado preservando identidade, manifesto ativo e proof-of-play.

Registrar por unidade: fabricante, modelo, SoC, RAM, armazenamento, versão Android, build/firmware, codecs reportados pelo `MediaCodecList`, portas, resultado de cada teste e restrições. Uma atualização de firmware exige regressão reduzida antes de continuar homologada.

## 21. Fases do projeto Flutter

### Fase A — Fundação e compatibilidade atual

- projeto, flavors, logs e banco;
- ativação real;
- token seguro;
- WebSocket, heartbeat e suspensão;
- reprodução básica online de playlist/layout atual;
- proof-of-play persistente.

### Fase B — Manifesto e offline

- integrar endpoint de manifesto;
- download Media3/HTTP;
- tamanho e SHA-256;
- ativação atômica e rollback;
- cache físico e limpeza segura;
- boot reproduzindo offline.

### Fase C — Player profissional

- multizona robusta;
- áudio por zona;
- alertas;
- screenshot nativo;
- comandos idempotentes;
- quiosque, boot e watchdog;
- telemetria real;
- QR Code de rastreamento de conversão (seção 26).

### Fase D — Homologação e distribuição

- matriz de TV Boxes;
- teste prolongado;
- assinatura release;
- MDM/distribuição;
- atualização e rollback de APK;
- piloto controlado.

## 22. Dependências do backend

O projeto Flutter pode começar pela Fase A agora. Dependências atuais:

1. ~~manifesto imutável e versionado por tela;~~ concluído;
2. ~~`version`, `sizeBytes`, MIME e SHA-256 por asset;~~ concluído;
3. ~~endpoint autenticado de manifesto com ETag/304;~~ concluído;
4. ~~publicação atômica e aviso WebSocket contendo a versão;~~ concluído;
5. ~~confirmação idempotente de comandos;~~ contrato, validade explícita e persistência backend concluídos, execução Flutter pendente;
- Publicação de aplicativos privados no Managed Google Play: https://support.google.com/googleplay/android-developer/answer/9874937

---

## 27. Módulo Chamador de Senhas (Ticket Queue Overlay & TTS)

**Estado:** `BACKEND_PRONTO` — integração Flutter pendente.

### 27.1 Objetivo

Permitir que a TV exiba avisos de senhas chamadas em tempo real (ex.: por médicos em consultórios, recepcionistas ou atendentes de balcão). Quando o operador clica em **"Chamar Próximo"** no aplicativo do chamador (`/chamar`), o backend envia uma mensagem WebSocket `TICKET_CALLED` para a TV correspondente.

O player Flutter deve:
1. Exibir uma sobreposição visual (*overlay*) em destaque com animação de entrada.
2. Tocar um sinal sonoro de alerta (*Chime* / *Ding-Dong*).
3. Pronunciar a frase sintetizada via Text-to-Speech (TTS) em português.
4. Manter o aviso visível por 12 segundos (ou até uma nova senha ser chamada) e retornar suavemente à reprodução.

---

### 27.2 Mensagem WebSocket Recebida (`TICKET_CALLED`)

```json
{
  "type": "TICKET_CALLED",
  "ticketNumber": "A043",
  "deskName": "Consultório 03",
  "audioText": "Senha A 0 4 3, Consultório 0 3",
  "calledAt": "2026-08-11T21:04:00.000Z"
}
```

Campos da mensagem:

| Campo | Tipo | Exemplo | Descrição |
|---|---|---|---|
| `type` | string | `TICKET_CALLED` | Identificador do evento |
| `ticketNumber` | string | `A043` ou `043` | Número da senha formatado com prefixo |
| `deskName` | string | `Consultório 03` | Nome do local/guichê destinatário |
| `audioText` | string | `Senha A 0 4 3, Consultório 0 3` | Frase espaçada pronta para o leitor de voz |
| `calledAt` | string | `2026-08-11T21:04:00.000Z` | Data e hora em formato ISO-8601 |

---

### 27.3 Comportamento Visual no Flutter

- **Camada Visual**: Renderizar o `QueueTicketOverlay` como camada `Stack` de alta prioridade (zIndex superior ao player de vídeo/imagem, porém inferior aos alertas de emergência).
- **Animação**: Aplicar efeito de escala e opacidade (*zoom-in/fade-in*) na entrada (duração de 350-400 ms).
- **Design do Card**:
  - Fundo escuro semi-transparente com efeito desfoque de vidro (*backdrop blur*).
  - Badge superior indicando **"SENHA CHAMADA"** com ícone de alto-falante.
  - **Número da Senha em Destaque Gigante**: fonte monoespaçada, tamanho de fonte de pelo menos 80–120 sp, cor branca brilhante.
  - **Local/Consultório**: texto abaixo da senha em tom azul/destaque.
- **Duração**: Permanecer visível por **12 segundos** após o término da síntese de voz, esmaecendo suavemente (*fade-out*).
- **Substituição**: Se uma nova senha for chamada enquanto a anterior estiver na tela, cancelar o temporizador antigo, atualizar imediatamente o número e reiniciar o som/áudio.

---

### 27.4 Sinal Sonoro (*Chime* / *Ding-Dong*)

- Tocar um efeito sonoro de 2 tons (ex.: tom 1: ~659 Hz por 300 ms; tom 2: ~523 Hz por 500 ms) antes do início da voz.
- O som pode ser gerado nativamente (via sintetizador de frequência ou `AudioPlayer`/`just_audio` reproduzindo um arquivo MP3 local de chime).
- Aguardar um pequeno intervalo (~500-700 ms) entre o chime e a entrada do áudio TTS para evitar sobreposição sonora.

---

### 27.5 Síntese de Voz (Text-to-Speech / TTS)

- Utilizar o plugin `flutter_tts` ou a API nativa do Android `TextToSpeech`.
- Configurações obrigatórias:
  - **Idioma**: `pt-BR` (Português do Brasil).
  - **Velocidade de Fala (*speech rate*)**: `0.85` a `0.90` (fala pausada e bem articulada para ambientes comerciais/hospitalares).
  - **Tom (*pitch*)**: `1.0`.
- Texto a pronunciar: passar exatamente a string recebida em `msg.audioText` (o backend já envia o número espaçado "A 0 4 3" para que o sintetizador leia dígito por dígito em vez de ler como valor numérico corrido).

---

### 27.6 Hierarquia e Prioridades de Sobreposição

1. **Alerta Emergencial (`EMERGENCY_ALERT_TRIGGERED`)**: Prioridade máxima. Se houver um alerta ativo na tela, a chamada de senha deve ter seu áudio/visual **suprimido**.
2. **Chamada de Senha (`TICKET_CALLED`)**: Prioridade média. Sobrepõe a reprodução comercial (vídeo/imagem/layout).
3. **Mídias e Playlists**: Continuam rodando no fundo ou pausadas conforme o tipo de mídia.

---

### 27.7 Checklist de Entrega — Chamador de Senhas no Flutter

- [x] Backend gerencia filas, guichês, PINs e evento WebSocket `TICKET_CALLED`;
- [x] Aplicação web do chamador (`/chamar`) operacional para o operador;
- [ ] Player Flutter registra callback para a mensagem `TICKET_CALLED` no WebSocket;
- [ ] Player Flutter inclui o plugin `flutter_tts` configurado em `pt-BR`;
- [ ] Player Flutter inclui áudio/sintetizador de *Chime*;
- [ ] Widget `QueueTicketOverlay` implementado com animação e card de senha gigante;
- [ ] Teste de integração: clique em "Chamar Próximo" no celular toca a TV instantaneamente.

---

## 28. Alertas Emergenciais (Tonalidades de Cor por Nível de Severidade)

**Estado:** `BACKEND_PRONTO` — integração Flutter pendente.

### 28.1 Objetivo

Permitir que o administrador da plataforma ou do cliente transmita mensagens de alerta de alta prioridade que sobrepõem a programação em exibição na TV. O sistema suporta **3 níveis de severidade visual**, cada um associado a uma cor de fundo específica.

---

### 28.2 Mensagens WebSocket Recebidas

#### A. Disparo de Alerta (`EMERGENCY_ALERT_TRIGGERED`)

```json
{
  "type": "EMERGENCY_ALERT_TRIGGERED",
  "alert": {
    "id": "uuid",
    "title": "EVACUAÇÃO IMEDIATA",
    "message": "Incêndio detectado no Bloco B. Utilize as saídas de emergência.",
    "alertType": "EVACUATION",
    "active": true,
    "durationSeconds": 120,
    "createdAt": "2026-08-11T21:15:00.000Z"
  }
}
```

#### B. Remoção de Alerta (`EMERGENCY_ALERT_CLEARED`)

```json
{
  "type": "EMERGENCY_ALERT_CLEARED"
}
```

---

### 28.3 Especificação das 3 Tonalidades de Cor (`alertType`)

O player Flutter deve selecionar a cor de fundo do modal de sobreposição em tela cheia com base no campo `alert.alertType`:

| Nível de Severidade | Valores de `alertType` | Cor HEX | Cor RGBA (Transparência 95%) | Uso Recomendado |
|---|---|---|---|---|
| 🔴 **VERMELHO (Crítico / Perigo)** | `EVACUATION`, `DANGER`, `CRITICAL` | `#b91c1c` | `rgba(185, 28, 28, 0.95)` | Evacuação imediata, incêndio, ameaça à segurança, emergência médica crítica |
| 🟠 **LARANJA (Urgente / Atenção)** | `WARNING`, `URGENT` | `#b45309` | `rgba(180, 83, 9, 0.95)` | Alerta de manutenção urgente, queda de energia iminente, tempestade, atenção |
| 🔵 **AZUL (Informativo / Geral)** | `INFO`, `NOTICE` | `#1d4ed8` | `rgba(29, 78, 216, 0.95)` | Comunicado oficial importante, avisos gerais de utilidade pública |

> **Regra de Fallback**: Caso o campo `alertType` venha com um valor desconhecido ou nulo, o player deve utilizar a cor **Laranja (`rgba(180, 83, 9, 0.95)`)** como padrão.

---

### 28.4 Regras de Renderização Visual no Flutter

- **Camada e zIndex**: Renderizar em tela cheia (`inset: 0`) como o widget de **maior prioridade visual** de toda a aplicação (acima de mídias, playlists, relógios e chamadas de senhas).
- **Tipografia**:
  - Título (`title`): fonte em caixa alta, tamanho de pelo menos 48–64 sp, peso 900 (ultra bold), cor branca (`#ffffff`).
  - Mensagem (`message`): fonte em tamanho 24–36 sp, peso 600, cor branca (`#ffffff`), alinhada ao centro com quebras de linha respeitadas.
- **Ícone**: Exibir o ícone de alerta/sirene (`AlertTriangle` / `Siren`) em tamanho gigante (120 sp) centralizado acima do título.
- **Animação**: Aplicar efeito de pulso contínuo de escala/opacidade (*pulse animation*) a cada 1,5 segundo para capturar a atenção de todos no ambiente.

---

### 28.5 Hierarquia e Prioridades de Áudio e Tela

1. O **Alerta Emergencial** cancela a reprodução de áudio da mídia ativa e suprime o som do chamador de senhas.
2. Quando a mensagem `EMERGENCY_ALERT_CLEARED` for recebida, o modal deve ser removido instantaneamente e o player deve retomar a programação normal.

---

### 28.6 Checklist de Entrega — Alertas Emergenciais no Flutter

- [x] Backend gerencia criação, ativação, expiração e broadcast de alertas por tela;
- [x] Painel admin exibe prévia em tempo real com as 3 cores (Vermelho, Laranja, Azul);
- [x] Player Web atualizado para aplicar cores dinâmicas conforme `alertType`;
- [ ] Player Flutter implementa overlay de alerta com as 3 cores conforme tabela acima;
- [ ] Player Flutter escuta mensagens `EMERGENCY_ALERT_TRIGGERED` e `EMERGENCY_ALERT_CLEARED`;
- [ ] Teste de integração: disparo de alerta no admin muda a cor da TV instantaneamente.

---

## 29. Suporte ao Módulo de NFC Dinâmico (Envio de `currentMediaId` no Heartbeat)

**Estado:** `BACKEND_PRONTO` — integração Flutter recomendada.

### 29.1 Objetivo

Permitir que o backend saiba **em tempo real** qual mídia exata está sendo reproduzida na TV a cada segundo, alimentando o endpoint de toque por aproximação NFC (`/r/nfc/:screenId`).

Quando um cliente encosta o celular na etiqueta NFC colada na moldura do Totem, o celular do cliente chama o backend. O backend consulta qual mídia está no ar naquela tela e redireciona o cliente instantaneamente para o WhatsApp/Instagram daquela promoção.

---

### 29.2 Atualização do Payload `HEARTBEAT` no Flutter

Ao enviar a mensagem periódica de `HEARTBEAT` via WebSocket (a cada 10 a 30 segundos) ou **sempre que uma mídia trocar de exibição**, o Player Flutter deve incluir o campo `currentMediaId`:

```json
{
  "type": "HEARTBEAT",
  "ramUsagePercent": 32,
  "cpuUsagePercent": 18,
  "storageFreeMb": 4500,
  "currentMediaName": "Promoção Hambúrguer Duplo.mp4",
  "currentMediaId": "32e8e550-d9dc-4459-a51c-2b70f3d36169"
}
```

Campos adicionados:

| Campo | Tipo | Exemplo | Descrição |
|---|---|---|---|
| `currentMediaId` | string | `32e8e550-d9dc-4459-a51c-2b70f3d36169` | ID único (UUID) da mídia em exibição no momento |
| `currentMediaName` | string | `Promoção Hambúrguer Duplo.mp4` | Nome amigável do arquivo para a telemetria |

---

### 29.3 Checklist de Entrega — NFC Dinâmico no Flutter

- [x] Backend responde ao endpoint `/r/nfc/:screenId` com redirect dinâmico 302;
- [x] Painel admin gera link do adesivo NFC para cada tela (`/r/nfc/<screenId>`);
- [x] Painel admin contabiliza scans por QR Code vs Aproximações NFC separadamente;
- [ ] Player Flutter envia `currentMediaId` e `currentMediaName` ao trocar de mídia e no `HEARTBEAT`.

---

## 30. Especificação do Módulo de CTA e QR Code (WhatsApp, Instagram, Link e Cartão Digital)

**Estado:** `WEB_E_BACKEND_PRONTOS` — integração Flutter documentada abaixo.

### 30.1 Estrutura do objeto `cta` no Manifesto JSON

Cada mídia dentro do manifesto JSON pode carregar um objeto `cta` configurado pelo anunciante no painel admin:

```json
{
  "id": "32e8e550-d9dc-4459-a51c-2b70f3d36169",
  "name": "Promoção Hambúrguer Duplo.mp4",
  "durationSeconds": 15,
  "cta": {
    "enabled": true,
    "mode": "DIRECT",
    "type": "WHATSAPP",
    "target": "https://wa.me/5521985080634",
    "text": "Olá! Vi a promoção no Totem",
    "position": "BOTTOM_RIGHT",
    "size": 160,
    "label": "Fale conosco no WhatsApp"
  }
}
```

Ou no **Modo Cartão Digital / Perfil Multi-links** (`mode: "PROFILE"`):

```json
{
  "id": "32e8e550-d9dc-4459-a51c-2b70f3d36169",
  "name": "Campanha Institucional.mp4",
  "durationSeconds": 15,
  "cta": {
    "enabled": true,
    "mode": "PROFILE",
    "type": "URL",
    "target": "https://wa.me/5521985080634",
    "profile": {
      "title": "Restaurante Sabor & Arte",
      "subtitle": "Confira nossas ofertas e redes sociais",
      "links": [
        { "id": "1", "type": "WHATSAPP", "target": "https://wa.me/5521985080634", "label": "Fale no WhatsApp" },
        { "id": "2", "type": "INSTAGRAM", "target": "https://instagram.com/sabor", "label": "Siga no Instagram" }
      ]
    },
    "position": "BOTTOM_RIGHT",
    "size": 160,
    "label": "Escaneie para ver mais"
  }
}
```

### 30.2 Especificação dos Campos

| Campo | Tipo | Valores Válidos | Descrição |
|---|---|---|---|
| `enabled` | `bool` | `true` / `false` | Se `false` ou nulo, **não renderizar** o QR Code na tela. |
| `mode` | `String?` | `"DIRECT"` / `"PROFILE"` | Modo do CTA. Se omitido, assume `"DIRECT"`. |
| `type` | `String?` | `"WHATSAPP"` / `"INSTAGRAM"` / `"URL"` | Tipo principal do canal de destino. |
| `position` | `String?` | `"BOTTOM_RIGHT"`, `"BOTTOM_LEFT"`, `"TOP_RIGHT"`, `"TOP_LEFT"` | Canto da tela onde o QR Code deve ser fixado. Padrão: `"BOTTOM_RIGHT"`. |
| `size` | `int?` | `96` a `320` | Largura/altura em pixels do QR Code. Padrão: `160`. |
| `label` | `String?` | `String` ou `""` | Texto exibido abaixo do QR Code. **Se vazio ou nulo, omitir a caixa de texto**. |

---

### 30.3 Construção da URL do QR Code no Flutter

O QR Code renderizado na tela **NUNCA deve apontar direto para a URL final do anunciante**. Ele **SEMPRE** deve apontar para o endpoint de rastreamento do VitDoor:

```text
https://<DOMAIN_SERVER>/r/<mediaId>?s=<screenId>
```

Exemplo:
```text
https://api.vitdoor.com.br/r/32e8e550-d9dc-4459-a51c-2b70f3d36169?s=98f12a34-1122-3344-5566-778899aabbcc
```

Dessa forma, o backend contabiliza as estatísticas de scan (data, hora, tela, tipo de dispositivo) e redireciona o cliente para o WhatsApp, Instagram, URL ou exibe o **Cartão Digital**.

---

### 30.4 Ícone Exibido no Rodapé do QR Code

| Condição | Ícone Renderizado |
|---|---|
| `mode == "PROFILE"` | 🎴 (Cartão Digital) |
| `type == "WHATSAPP"` | 💬 (WhatsApp) |
| `type == "INSTAGRAM"` | 📷 (Instagram) |
| `type == "URL"` ou default | 🌐 (Link / Site) |

---

### 30.5 Código Exemplo em Flutter (Dart)

O widget a seguir pode ser utilizado diretamente no projeto Flutter para sobrepor o QR Code na mídia em exibição:

```dart
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

class CtaModel {
  final bool enabled;
  final String mode; // 'DIRECT' | 'PROFILE'
  final String type; // 'WHATSAPP' | 'INSTAGRAM' | 'URL'
  final String? position;
  final int size;
  final String? label;

  CtaModel({
    required this.enabled,
    this.mode = 'DIRECT',
    this.type = 'URL',
    this.position,
    this.size = 160,
    this.label,
  });

  factory CtaModel.fromJson(Map<String, dynamic> json) {
    return CtaModel(
      enabled: json['enabled'] == true,
      mode: json['mode'] as String? ?? 'DIRECT',
      type: json['type'] as String? ?? 'URL',
      position: json['position'] as String?,
      size: (json['size'] as num?)?.toInt() ?? 160,
      label: json['label'] as String?,
    );
  }
}

class MediaQrCtaOverlay extends StatelessWidget {
  final CtaModel? cta;
  final String mediaId;
  final String screenId;
  final String apiBaseUrl; // ex: https://api.vitdoor.com.br

  const MediaQrCtaOverlay({
    Key? key,
    required this.cta,
    required this.mediaId,
    required this.screenId,
    required this.apiBaseUrl,
  }) : super(key: key);

  String get _typeIcon {
    if (cta?.mode == 'PROFILE') return '🎴';
    switch (cta?.type?.toUpperCase()) {
      case 'WHATSAPP':
        return '💬';
      case 'INSTAGRAM':
        return '📷';
      default:
        return '🌐';
    }
  }

  Alignment _getAlignment() {
    switch (cta?.position?.toUpperCase()) {
      case 'TOP_LEFT':
        return Alignment.topLeft;
      case 'TOP_RIGHT':
        return Alignment.topRight;
      case 'BOTTOM_LEFT':
        return Alignment.bottomLeft;
      case 'BOTTOM_RIGHT':
      default:
        return Alignment.bottomRight;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (cta == null || !cta!.enabled || mediaId.isEmpty) {
      return const SizedBox.shrink();
    }

    // URL de rastreamento oficial
    final domain = apiBaseUrl.replaceAll(RegExp(r'/api/?$'), '');
    final trackingUrl = '$domain/r/$mediaId?s=$screenId';
    final hasLabel = cta!.label != null && cta!.label!.trim().isNotEmpty;
    final qrSize = cta!.size.toDouble();

    return Align(
      alignment: _getAlignment(),
      child: Padding(
        padding: const EdgeInsets.all(28.0),
        child: Container(
          padding: const EdgeInsets.all(10.0),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            boxShadow: const [
              BoxShadow(
                color: Colors.black54,
                blurRadius: 20,
                offset: Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Imagem do QR Code
              QrImageView(
                data: trackingUrl,
                version: QrVersions.auto,
                size: qrSize,
                backgroundColor: Colors.white,
              ),

              // Legenda de texto abaixo (renderizar SOMENTE se label não for vazia)
              if (hasLabel) ...[
                const SizedBox(height: 6),
                ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: qrSize + 10),
                  child: Text(
                    '$_typeIcon ${cta!.label!.trim()}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Color(0xFF111827),
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
```

---

### 30.6 Checklist de Entrega do Flutter (Módulo CTA/QR Code)

- [x] Backend atualizado com gerador de Landing Page de Perfil Cartão Digital;
- [x] Backend atualizado para aceitar qualquer canal (WhatsApp, Instagram, Link, Youtube, TikTok);
- [x] Admin Web atualizado com Seletor de Modo (`Link Direto` vs `Cartão Digital`);
- [x] Player Web atualizado com suporte aos novos ícones e modos;
- [ ] Player Flutter implementa o widget `MediaQrCtaOverlay` sobreposto às mídias;
- [ ] Player Flutter respeita omissão do rótulo quando `label` for nulo ou string vazia `""`.


