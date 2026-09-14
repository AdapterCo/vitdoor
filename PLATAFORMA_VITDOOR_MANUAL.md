# MANUAL DE ARQUITETURA E FUNCIONAMENTO DA PLATAFORMA VITDOOR (SaaS MÍDIA INDOOR)

> **Documentação Técnica Oficial de Funcionamento e Especificação da Plataforma**  
> *Versão do Sistema: 2.0 (Pronto para Produção)*

---

## 📌 1. Visão Geral da Plataforma

A **VitDoor** é uma plataforma SaaS completa para gestão de **Mídia Indoor (Digital Signage)**, Totens Interativos, TV Corporate, Redes de Anunciantes Programáticas, Chamador de Senhas de Guichê e Auditoria de Veiculação em Tempo Real.

O sistema é composto por 4 módulos integrados:
1. **Backend API & Real-time Server (`backend/`)**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL, Cloudflare R2 / S3 Storage e Server-side WebSockets (`ws`).
2. **Painel Web Administrativo (`admin/`)**: Aplicação SPA desenvolvida em React, TypeScript, Vite, Tailwind/Glassmorphism CSS e Lucide Icons.
3. **Player Web & Simulador (`player/`)**: Player de exibição em React com suporte a execução 100% offline via **IndexedDB** (`VitDoorPlayerDB`), cache local de mídias e sincronização em lote.
4. **Player Nativo Android / Flutter (`PLAYER_ANDROID_FLUTTER.md`)**: Contrato completo de especificação técnica para execução em TVs Android, TV Boxes (Android TV) e Smart TVs (Samsung Tizen / LG webOS).

---

## 🏛️ 2. Arquitetura Multi-tenant e Isolamento de Dados

* **Isolamento Estrito por Tenant (`tenantId`)**:
  * Todo e qualquer recurso do sistema (Telas, Mídias, Pastas, Playlists, Layouts, Campanhas, Filas de Senhas, Relatórios de Exibição e Alertas Emergenciais) pertence obrigatoriamente a um `tenantId`.
  * **Regra Global de Segurança**: As consultas ao banco de dados usam apenas o `tenantId` da conta autenticada. Usuários do mesmo tenant compartilham o acesso à rede de telas e biblioteca de mídias da empresa.

* **Autenticação e Perfis de Acesso**:
  * **Painel Admin**: Autenticação via JWT no Header `Authorization: Bearer <token>` (`{ userId, tenantId, role }`).
  * **Dispositivos / Players**: Autenticação via JWT de dispositivo no Header `Authorization: Bearer <deviceToken>` (`{ type: 'DEVICE', screenId, tenantId, version }`). O token do dispositivo é revogável e possui validade de 365 dias.

---

## 📺 3. Pareamento, Gestão de Telas e Rotação de Hardware

### 3.1 Fluxo de Pareamento por Código de 6 Dígitos
1. Ao abrir o Player em uma nova TV, ele chama `POST /api/device/pairing` e recebe um código temporário de 6 dígitos (ex: `849-210`), um `pairingId` e um `pairingSecret`.
2. O player exibe o código na tela e faz chamadas periódicas em `POST /api/device/pairing/{pairingId}/status` enviando o `pairingSecret`.
3. No Painel Admin, o operador acessa a aba **Telas**, clica em **Parear Nova Tela** e digita o código `849-210`.
4. O backend valida o código, cria o registro da `Screen` vinculado ao `tenantId` e gera o `deviceToken`.
5. A TV recebe o status `PAIRED`, armazena o token no banco local (`IndexedDB`) e conecta automaticamente no WebSocket em `wss://api.vitdoor.com.br/ws`.

### 3.2 Suporte a Rotação de Tela (0°, 90°, 180°, 270°)
* **Rotação por Software**: Para não depender de suporte a rotação no sistema operacional da TV Box (Android OS), o Player VitDoor aplica a rotação gráfica via CSS (`transform: rotate(...)` com viewport calculada `width: 100vh` e `height: 100vw`).
* **Modos Suportados**:
  * `HORIZONTAL` / `0°`: Modo paisagem padrão (16:9).
  * `90°`: Girar 90° no sentido horário.
  * `180°`: Invertido (ponta-cabeça).
  * `VERTICAL` / `270°`: Modo totem vertical (9:16).
* **Edição Pós-Cadastro**: A orientação pode ser alterada a qualquer momento no Painel Admin diretamente na tabela ou pelo modal de edição (ícone do lápis ✏️), atualizando a TV em tempo real via WebSocket (`MANIFEST_UPDATED`).

### 3.3 Comandos Remotos em Tempo Real
* **`TAKE_SCREENSHOT`**: A TV captura o quadro atual do canvas e faz o upload da foto para o servidor R2. O painel exibe o print em tempo real.
* **`SYNC`**: Força a baixa imediata e a revalidação do manifesto e de todos os arquivos de mídia.
* **`REBOOT`**: Reinicia a aplicação do player na TV.
* **`SET_VOLUME`**: Ajusta o volume do som de 0 a 100%.

---

## 🎨 4. Motor de Layouts Multizona (Canvas v2)

* **Divisão Física de Zonas**:
  * Permite dividir a tela em múltiplos quadros independentes.
  * Presets: `FULL` (100%), `HALF` (50% / 50%) e `70_30` (70% área principal / 30% barra lateral).
  * Parâmetros por Zona: `widthPercent`, `heightPercent`, `fit` (`CONTAIN`, `COVER`, `FILL`), `loop` (boolean) e `audioEnabled`.
  * **Regra de Áudio**: Apenas uma zona por layout pode ter `audioEnabled: true` para evitar sobreposição de sons.

* **Herança Dinâmica de Programação**:
  * Se a zona tiver mídias específicas (`zone.items`), ela executa essas mídias.
  * Se a zona não tiver mídias específicas (`zone.items: []`), ela reproduz automaticamente a **`activePlaylist` comercial da tela**.

* **Widgets Integrados**:
  * **Rodapé com Texto Rolante (*Marquee*)**: Exibe mensagens personalizadas em movimento.
  * **Relógio Dinâmico**: Exibido em qualquer um dos 4 cantos (`TOP_LEFT`, `TOP_RIGHT`, `BOTTOM_LEFT`, `BOTTOM_RIGHT`) ou integrado no rodapé (`FOOTER`).

---

## 🎬 5. Mídias, Pastas e Chamada de Ação (QR Code / CTA)

* **Formatos de Mídia Aceitos**:
  * `VIDEO`: MP4 / WebM.
  * `IMAGE`: JPG / PNG / WebP / SVG.
  * `AUDIO`: MP3 / AAC.
  * `WEB_PAGE`: Sites, dashboards e portais exibidos via `<iframe>` sandbox.

* **Organização em Pastas (`MediaFolder`)**:
  * Organização de conteúdos por pastas exclusivas do tenant. A exclusão de uma pasta mantém as mídias salvas na raiz do sistema.

* **Upload Seguro e Armazenamento Cloud**:
  * Upload realizado por stream em arquivo temporário de disco (evitando estouro de memória RAM do servidor).
  * Exclusão atômica: remove primeiro o registro do banco PostgreSQL e depois apaga o arquivo físico no Cloudflare R2 / S3.

* **Interatividade via QR Code (CTA - Call to Action)**:
  * Cada mídia pode possuir um CTA configurado: WhatsApp (com mensagem personalizada), Instagram, Link de Site ou Cartão de Visitas Digital (vCard).
  * O player gera e exibe o QR Code dinamicamente no canto da tela durante a exibição daquela mídia.

---

## 📊 6. Motor de Campanhas Publicitárias Programáticas

### 6.1 Validação Temporal em Tempo Real (`isActiveNow()`)
O backend e o player validam a cada segundo:
* 📅 **Data**: Se o momento atual está entre `startDate` e `endDate` (`endDate` ajustado até `23:59:59.999Z`).
* ⏰ **Horário**: Se o horário atual (HH:mm) está entre `startTime` (ex: "08:00") e `endTime` (ex: "22:00").
* 📆 **Dias da Semana**: Se o dia atual (`daysOfWeek`, ex: "1,2,3,4,5") está ativo.

### 6.2 Níveis de Prioridade
* 🔴 **Prioridade 3 (Urgente / Exclusiva)**: Substitui 100% da programação comercial e exibe exclusivamente a playlist da campanha durante a janela agendada.
* 🟠 **Prioridade 2 (Alta)**: Intercala 1 mídia da campanha a cada 2 mídias comerciais.
* 🟡 **Prioridade 1 (Normal)**: Intercala 1 mídia da campanha ao final de cada ciclo comercial.

### 6.3 Limite de Impressões (`maxImpressions`) e Auto-Expiração
* A contagem de exibições no `ProofOfPlay` considera apenas exibições ocorridas **após a criação da campanha** (`playedAt >= campaign.createdAt`).
* Ao atingir o limite de `maxImpressions`, a campanha muda automaticamente seu status para `'EXPIRED'` e notifica os players via WebSocket.

---

## 🔔 7. Chamador de Senhas de Guichê (Ticket Queue & TTS) e Alertas

* **Chamador de Senhas**:
  * Módulo para operadores chamarem clientes por senha via App Chamador (`QueueCallerApp`).
  * Autenticação simplificada por PIN de 4 dígitos escopado pelo `tenantId`.
  * Ao chamar a senha, dispara o evento WebSocket `TICKET_CALLED`. O player abre um popup na TV com o número da senha, o guichê, sinal sonoro e leitura por síntese de voz (TTS - Text-to-Speech).

* **Alertas Emergenciais**:
  * Permite enviar mensagens de emergência em tempo real para telas específicas.
  * `EMERGENCY_ALERT_TRIGGERED`: Cobre a tela com um banner vermelho/laranja de aviso.
  * `EMERGENCY_ALERT_CLEARED`: Remove o aviso da tela de forma isolada.

---

## 📱 8. Totens Inteligentes com Tag NFC

* Cada tela possui um link único de aproximação: `https://vitdoor.app/r/nfc/:screenId`.
* Ao encostar o celular na Tag NFC do Totem, o sistema verifica via WebSocket/Heartbeat qual a mídia exata (`currentMediaId`) sendo exibida na TV naquele **exato segundo** e abre no celular do cliente a oferta, cupom ou WhatsApp do anunciante.

---

## 📑 9. Auditoria de Veiculação (Proof-of-Play) e Relatório do Anunciante

* **Armazenamento Offline e Envio em Lote**:
  * O player grava cada exibição concluída no banco de dados local `IndexedDB`.
  * Ao reconectar à internet, envia os logs em lote (`POST /api/proof-of-play/log-batch`).

* **Relatório Auditado Transparente (`/report/media/:mediaId`)**:
  * Link de auditoria pública que pode ser enviado diretamente aos anunciantes.
  * Exibe o total de exibições, tempo total em tela, gráfico diário de exibições e exportação em CSV auditado.

---

## 🚀 10. Procedimento de Atualização e Deploy na VPS

Para aplicar atualizações e melhorias na VPS:

```bash
# 1. Baixar as últimas alterações do repositório
git pull origin main

# 2. Reconstruir os containers sem cache
docker compose build --no-cache

# 3. Subir a aplicação em segundo plano
docker compose up -d
```

---

*Manual gerado e validado em 14/09/2026. Plataforma VitDoor 100% testada e pronta.*
