# VitDoor Player Android — especificação para projeto Flutter separado

> Documento de criação e implementação do aplicativo oficial para TV Box, Android TV e totens Android.
>
> Repositório sugerido: `vitdoor-player-flutter`. O painel web e o backend permanecem no repositório `vitdoor`.

**Versão:** 1.0  
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
- não implementar temperatura sem fonte real;
- alerta emergencial sobrepõe a programação sem destruir o estado atual.

### 12.4 Áudio

- somente uma zona pode emitir áudio ao mesmo tempo;
- `audioEnabled` do manifesto define a zona sonora;
- volume do player respeita o valor remoto e a política do dispositivo;
- não iniciar vídeos permanentemente mudos por conveniência de autoplay;
- em TV Box dedicada, configurar áudio nativamente e registrar falhas de saída/codec;
- ao mudar de item ou layout, liberar o player anterior para evitar áudio fantasma.

## 13. Proof-of-play

Registrar ao finalizar ou interromper cada item:

```json
{
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
```

Regras:

- fila persistente offline;
- lotes limitados e reenvio com backoff;
- remover somente eventos confirmados;
- usar identificador idempotente quando o backend for evoluído;
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

Cada comando futuro deve possuir `commandId`, validade e confirmação idempotente.

- `SYNC`: buscar e ativar manifesto mais recente;
- `SET_VOLUME`: ajustar volume;
- `TAKE_SCREENSHOT`: capturar frame/tela quando permitido;
- `REBOOT_APP`: reiniciar somente o aplicativo;
- `REBOOT_DEVICE`: apenas em Device Owner/firmware autorizado;
- `CLEAR_CACHE`: nunca remover assets da versão ativa;
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
- temperatura somente se existir sensor e contrato real; caso contrário, omitir;
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

Pipeline mínimo:

1. `flutter analyze`;
2. testes unitários;
3. testes de widgets;
4. build APK por flavor;
5. assinatura apenas em ambiente protegido;
6. geração de hashes e artefatos;
7. release notes e versão semântica;
8. instalação automática em dispositivo de homologação quando possível.

Segredos de assinatura ficam em cofre do CI. Nunca versionar keystore, senhas, `.jks`, tokens ou arquivos de ambiente reais.

Definir distribuição antes do piloto:

- MDM/Device Owner para frota controlada;
- loja privada/Managed Google Play quando disponível;
- atualizador próprio apenas com manifesto assinado, HTTPS, hash e rollback.

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
5. confirmação idempotente de comandos;
6. IDs idempotentes em proof-of-play;
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
