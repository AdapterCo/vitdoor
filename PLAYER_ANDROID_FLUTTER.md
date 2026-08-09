# VitDoor Player Android — especificação para projeto Flutter separado

> Documento de criação e implementação do aplicativo oficial para TV Box, Android TV e totens Android.
>
> Repositório sugerido: `vitdoor-player-flutter`. O painel web e o backend permanecem no repositório `vitdoor`.

**Versão:** 1.1
**Data:** 09/08/2026  
**Estado:** especificação aprovada; backend de manifesto disponível, projeto Flutter ainda não criado

## 1. Objetivo

Criar o player comercial do VitDoor como aplicativo Flutter para Android, capaz de:

- parear uma TV Box por código de uso único;
- receber programação exclusiva da tela autenticada;
- baixar e validar todas as mídias antes da publicação;
- reproduzir vídeo, imagem, áudio, páginas permitidas e layouts multizona;
- continuar reproduzindo sem internet e após reinicialização;
- executar loop contínuo por padrão;
- respeitar áudio, volume e enquadramento por zona;
- receber sincronização, volume, alerta, screenshot e reinicialização remotos;
- registrar proof-of-play offline e sincronizar posteriormente;
- operar em tela cheia, iniciar no boot e oferecer modo quiosque;
- preservar a última programação válida quando uma atualização falhar.

O aplicativo não terá funções administrativas. Uploads, clientes, telas, layouts e playlists continuam no painel web.

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
API_BASE_URL=https://app.vitdoor.com.br/api
WS_URL=wss://app.vitdoor.com.br/ws
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

Ao conectar em `wss://app.vitdoor.com.br/ws`, enviar:

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
- todos os assets têm URL imutável, tamanho e SHA-256;
- resposta usa ETag e retorna HTTP 304 quando `If-None-Match` corresponde;
- uma tela recebe somente seu manifesto;
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
- `isLoop` é sempre `true` no produto atual;
- cada item possui exatamente um entre `mediaId` e `layoutId`;
- `orderIndex` começa em zero e define a ordem;
- `durationSeconds` é inteiro entre 1 e 86400;
- para item de mídia, `media` é preenchido e `layout` é `null`; para item de layout ocorre o inverso;
- tipos binários atuais: `VIDEO`, `IMAGE`, `AUDIO` e `PDF`; tipos dinâmicos aceitos: `RSS` e `WEB_PAGE`;
- `assets` do manifesto é a fonte canônica de URL, tamanho, MIME, versão e checksum; referências repetidas dentro de playlist/layout devem ser resolvidas por `mediaId`.

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

O token fica no Android Keystore via armazenamento seguro, não no banco comum.

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

**Estado:** `BACKEND_PRONTO` — integração Flutter pendente.

Registrar ao finalizar ou interromper cada item:

```json
{
  "eventId": "uuid-v4-gerado-uma-vez-no-dispositivo",
  "screenId": "uuid",
  "mediaName": "Oferta de sábado",
  "playedAt": "2026-08-09T12:00:00.000Z",
  "durationSeconds": 8,
  "completed": true
}
```

Sincronização atual:

```http
POST /api/proof-of-play/log-batch
Authorization: Bearer {deviceToken}
Content-Type: application/json

{
  "items": ["até 500 eventos no schema acima"]
}
```

Resposta `200`:

```json
{
  "received": 3,
  "accepted": 2,
  "duplicates": 1,
  "rejected": 0,
  "eventIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

Também existe `POST /api/proof-of-play/log` para um único evento. Uma criação retorna `201` com `duplicate: false`; um reenvio retorna `200` com `duplicate: true` e o mesmo `eventId`.

Regras:

- fila persistente offline;
- lotes limitados e reenvio com backoff;
- `eventId` é UUID obrigatório, criado uma única vez e persistido junto ao evento antes da primeira tentativa;
- nunca gerar outro `eventId` durante retry, reinicialização ou reconexão;
- o banco possui índice único composto por `screenId + eventId` e o lote usa inserção com descarte de duplicatas;
- remover da fila os `eventIds` devolvidos; manter e diagnosticar os rejeitados;
- `durationSeconds` é inteiro de 1 a 86400 e `playedAt` é ISO-8601 válido;
- horário monotônico/local e horário de parede devem ser tratados com cuidado;
- nunca aceitar `screenId` diferente da credencial.

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

{
  "tenantId": "uuid",
  "action": "SET_VOLUME",
  "payload": { "volume": 70 }
}
```

Resposta `202`:

```json
{
  "commandId": "uuid-v4-gerado-pelo-backend",
  "action": "SET_VOLUME",
  "status": "SENT",
  "delivered": true,
  "message": "Comando SET_VOLUME entregue ao dispositivo; aguardando confirmação."
}
```

Se a tela estiver offline, `status` será `PENDING` e `delivered` será `false`. O backend persiste e entrega na reconexão. Estados: `PENDING`, `SENT`, `SUCCEEDED`, `FAILED` e `EXPIRED`. Comandos pendentes expiram após 24 horas. Consultar estado em `GET /api/screens/{screenId}/commands/{commandId}?tenantId={tenantId}`.

Payloads recebidos pelo dispositivo:

```json
{ "type": "SET_VOLUME", "commandId": "uuid", "payload": { "volume": 70 } }
{ "type": "TAKE_SCREENSHOT", "commandId": "uuid" }
{ "type": "REBOOT", "commandId": "uuid" }
{
  "type": "MANIFEST_UPDATED",
  "commandId": "uuid-do-comando-sync",
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
- telemetria real.

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
5. ~~confirmação idempotente de comandos;~~ contrato e persistência backend concluídos, execução Flutter pendente;
6. ~~IDs idempotentes em proof-of-play;~~ backend concluído, fila Flutter pendente;
7. URLs CDN estáveis e política de retenção.

Upload direto/multipart, backup externo e Redis podem evoluir em paralelo e não devem bloquear o protótipo Flutter. Redis só se torna obrigatório antes de executar múltiplas instâncias do gateway/backend ou quando a escala exigir presença e comandos compartilhados.

## 23. Critério de conclusão do aplicativo

O player Flutter só será considerado comercial quando:

- funcionar em TV Box real homologada;
- iniciar sozinho e recuperar-se após energia/rede;
- reproduzir integralmente offline;
- validar todos os arquivos;
- nunca ativar manifesto incompleto;
- manter versão anterior válida;
- respeitar isolamento, destino, loop, áudio e alertas;
- registrar proof-of-play offline;
- operar continuamente no teste prolongado;
- possuir APK release assinado, atualização e rollback definidos;
- não depender do player web nem de dados simulados.

## 24. Primeira tarefa no novo repositório

Ao iniciar uma nova conversa/projeto, fornecer este arquivo e solicitar:

```text
Crie o projeto Flutter Android VitDoor Player seguindo integralmente PLAYER_ANDROID_FLUTTER.md.
Implemente primeiro a Fase A, sem inventar endpoints que ainda não existem.
Mantenha contratos HTTP/WebSocket em modelos tipados, isole a integração Media3 em uma camada Android Kotlin e inclua testes para ativação, reconexão, persistência e isolamento.
Não implemente mocks na configuração de production.
```

## 25. Contrato vivo entre web/backend e Android

Este documento é o handoff oficial para o futuro repositório Flutter. Toda entrega feita no painel ou backend que afete telas/dispositivos deve atualizar este arquivo no mesmo commit, mesmo que o aplicativo Android ainda não exista.

Para cada recurso compartilhado, documentar obrigatoriamente:

1. objetivo e comportamento esperado na TV;
2. endpoint HTTP, método, autenticação, headers e rate limit;
3. request, response e códigos de erro com exemplos JSON reais;
4. mensagens WebSocket recebidas/enviadas e confirmação esperada;
5. modelos, campos obrigatórios, enumerações, versões e compatibilidade;
6. regra de isolamento por `tenantId`, proprietário e `screenId`;
7. comportamento online, offline, durante reconexão e após reinicialização;
8. política de download, cache, checksum, ativação atômica e rollback;
9. telemetria, proof-of-play, logs e diagnóstico necessários;
10. testes unitários, integrados e cenários em TV Box real;
11. estado da entrega: `BACKEND_PRONTO`, `FLUTTER_PENDENTE`, `EM_TESTE` ou `CONCLUÍDO`.

Regras de trabalho:

- o painel web administra clientes, usuários, telas, mídias, layouts, playlists, campanhas e relatórios;
- o backend concentra autorização, isolamento, contratos, versionamento, sincronização e persistência;
- o Flutter é o único player comercial e concentra download físico, validação dos arquivos, reprodução, offline, boot e quiosque;
- o simulador React não define arquitetura, persistência ou critério de conclusão do Android;
- nenhum endpoint, campo ou comportamento deve ser inventado durante a criação do Flutter: ausências devem ser implementadas primeiro no backend e registradas aqui;
- mudanças incompatíveis exigem nova versão de contrato e estratégia de migração, preservando dispositivos que ainda não atualizaram;
- credenciais, segredos e exemplos com dados reais nunca devem ser registrados neste arquivo.

Checklist obrigatório antes de encerrar uma entrega web/backend com impacto no Android:

- [ ] contrato implementado e protegido no backend;
- [ ] isolamento e autorização validados;
- [ ] payload mínimo e sem campos internos;
- [ ] falhas, timeouts e limites documentados;
- [ ] comportamento offline/rollback especificado;
- [ ] seção correspondente deste documento atualizada;
- [ ] pendência Flutter inserida na fase correta;
- [ ] comando ou roteiro de teste de integração registrado.

Referências técnicas principais:

- Flutter Platform Channels: https://docs.flutter.dev/platform-integration/platform-channels
- Arquitetura Flutter: https://docs.flutter.dev/resources/architectural-overview
- Android Media3 offline downloads: https://developer.android.com/media/media3/exoplayer/downloading-media
- Android `DownloadService`: https://developer.android.com/reference/androidx/media3/exoplayer/offline/DownloadService
- Android app signing e Play App Signing: https://developer.android.com/studio/publish/app-signing
- Android Management API para Dedicated Devices: https://developers.google.com/android/management/policies/dedicated-devices
- Publicação de aplicativos privados no Managed Google Play: https://support.google.com/googleplay/android-developer/answer/9874937
