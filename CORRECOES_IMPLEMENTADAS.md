# Revisão das correções — 12/09/2026

Base de comparação: `cf28f40`, anterior às alterações `d740130` e `58ba11c`. Esta revisão substitui as orientações anteriores de mudar o armazenamento e os contratos do sistema. Alterações locais; não houve deploy nem acesso ao banco ou R2 de produção.

## Regressões corrigidas e comportamentos restaurados

| Área | Mudança desfeita ou erro corrigido |
| --- | --- |
| Mídias e pastas | Novas exclusões voltam a remover o registro. A contagem exclui registros anteriormente arquivados. O painel aguarda a atualização e mostra erros de exclusão. |
| Telas | Exclusão física e relacionamentos originais do Prisma restaurados; conexão do dispositivo excluído é encerrada. |
| Capturas | Upload novamente no bucket/URL configurados, em `tenants/{tenantId}/screenshots/{screenId}/{arquivo}`. Sem R2 configurado, usa `uploads`, conforme o fluxo original. |
| WebSocket | Transporte `SCREENSHOT_RESULT` restaurado. A imagem é validada e salva antes de confirmar o comando. Upload HTTP continua disponível. |
| Storage | Novas operações voltam ao fluxo direto, sem criar tarefas em `StorageDeletion`. Erro de armazenamento não retorna sucesso; falha ao registrar upload no banco tenta remover o arquivo enviado. |
| Implantação | Compose, documentação de implantação e exemplos de endereços restaurados à base. Purge volta a ter credenciais opcionais. Nenhum `.env` real editado. |
| Login | Cookie JWT original, sem criar sessão no banco a cada login. Mantidos papel/conta atualizados e revogação por versão após troca de senha. |
| Senhas | Mínimo de **6 caracteres** no backend, cadastro, seed e Minha conta. Mantidos senha atual, confirmação e máximo de 72 bytes do bcrypt. |
| Relatório | URL pública e botões de abrir/copiar originais restaurados; removido ciclo obrigatório de geração/expiração/revogação de links. Histórico sem `mediaId` volta à consulta por nome no mesmo cliente. |
| Proof of play | Campos novos voltam a ser opcionais. Contrato original aceito com ACK de reenvios; campos adicionais enviados são validados. Impressões legadas voltam à contagem das campanhas. |
| Campanhas | `INACTIVE` novamente aceito; formulário também reconhece registros já convertidos para `PAUSED`. |
| Chamador | Interface e chamadas com PIN restauradas. Links incluem estabelecimento para desambiguar PINs repetidos. PINs já convertidos em hash continuam autenticando. Administrador pode substituir PIN que deixou de ser exibido. |
| Player | `isLoop=false` e `loop` das zonas novamente respeitados. Apresentação anterior dos alertas restaurada; simulador antigo reconhecido sem exigir `clientKind`. |
| Manutenção da TV | Edição/remoção originais do PIN restauradas para quem gerencia telas; perfis consultivos não recebem o PIN. |
| NFC | Aceita telemetria anterior por ID ou nome inequívoco, com heartbeat quando falta o timestamp novo. Mantidos isolamento e recusa de atribuição a uma mídia arbitrária. |

## Correções mantidas na revisão dos demais grupos do diff

- Express e permissões: propagação de erros assíncronos, validação, papel atual, conta ativa e isolamento entre clientes em alertas, QR e operações administrativas.
- RSS: bloqueio de endereços internos, limites de tamanho/tempo e atualização do conteúdo publicado.
- Comandos e pareamento: expiração, validação por dispositivo, confirmação condicional, heartbeat único e encerramento de conexões revogadas. Rotas auxiliares permanecem opcionais para os clientes anteriores.
- Playlists, layouts e manifestos: transações e invalidação da programação dependente para não continuar exibindo conteúdo removido ou desatualizado.
- Player: escrita confirmada no IndexedDB, lotes de até 500, remoção somente após ACK, avanço em falhas e registros de interrupção. Componentes de reprodução continuam internos ao player existente.
- Painel: formulários preservados em erro, CSV com escape e captura carregada pela API autenticada, com mensagem para arquivo ausente.
- Dependências, Docker e testes: mantidas atualizações de segurança, Node compatível, ffprobe e verificações locais/CI. Não foi criado outro serviço de produção.

## Dados já existentes em produção

Migrations já publicadas **não foram editadas, apagadas ou revertidas**. Colunas e tabelas adicionais permanecem para compatibilidade; isto não é uma restauração destrutiva do banco à versão antiga. Não houve exclusão em massa de registros arquivados, históricos, arquivos ou volumes.

`AdminSession` permite reconhecer sessões emitidas anteriormente até expiração/revogação. `StorageDeletion` continua sendo drenada para tarefas antigas; novos uploads/exclusões não criam tarefas. A versão do usuário continua invalidando credenciais após troca de senha. Campos opcionais permitem ler eventos/registros existentes.

O Compose volta aos volumes originais. Capturas exclusivas de `private_data` não são transferidas automaticamente para o R2, e o volume antigo não é apagado. Depois da publicação, solicitar nova captura gera o arquivo no R2. O leitor privado permanece compatível se o arquivo antigo ainda estiver montado em `/app/private`.

Relatórios públicos e PINs visíveis aos administradores voltam ao comportamento anterior solicitado. Eventos legados identificados somente por nome conservam a limitação original de atribuição entre mídias homônimas.

## Validação e limites

**Resultado final:** 30 testes de backend, 9 testes no Chrome e 2 testes offline passaram (41 no total). Os três builds e a validação do schema Prisma passaram.

- Backend: rotas com fixtures, SDK R2 simulado, WebSocket real local e migrations em PostgreSQL embarcado (PGlite).
- Chrome: senha de seis caracteres, rejeição da senha atual, contagem após exclusão, erro de exclusão, capturas, CSV e repetição ligada/desligada.
- Player: persistência offline, ACK e separação por dispositivo.
- Builds de backend, painel e player.

Os testes não acessam produção. O APK Android físico não está neste repositório e não foi executado; a compatibilidade foi verificada contra o contrato original do backend.
