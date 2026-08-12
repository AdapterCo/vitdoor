import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { rateLimit } from 'express-rate-limit';
import {
  getNormalizedTargetUrl,
  parseWhatsAppTarget,
  buildWhatsAppWebUrl,
  buildWhatsAppAppUrl,
  renderProfileHtml
} from '../lib/ctaHelpers.js';

export const qrRoutes = Router();

// Rate limit público: 120 scans por IP por minuto (proteção contra bots/flood)
const scanRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  validate: true,
  handler: (_req: Request, res: Response) => {
    res.status(429).send('Too many requests');
  }
});

/** Valid CTA types accepted by both routes. */
const VALID_CTA_TYPES = ['WHATSAPP', 'INSTAGRAM', 'URL', 'CUSTOM_URL', 'WEBSITE'];

/**
 * GET /r/:mediaId?s=:screenId
 *
 * Endpoint público sem autenticação.
 * - Valida que a mídia pertence a um tenant ativo e tem CTA configurado.
 * - Registra o scan (tenantId, mediaId, screenId, ctaType, userAgent).
 * - Se cta.mode === 'PROFILE': Renderiza a Landing Page do Perfil Cartão Digital.
 * - Se cta.mode === 'DIRECT': Faz redirect 302 para a URL real.
 */
qrRoutes.get('/:mediaId', scanRateLimit, async (req: Request, res: Response): Promise<any> => {
  const { mediaId } = req.params;
  const screenId = typeof req.query.s === 'string' ? req.query.s.trim() : undefined;

  if (!mediaId || typeof mediaId !== 'string' || !/^[0-9a-f-]{36}$/i.test(mediaId)) {
    return res.status(404).send('Not found');
  }

  const media = await prisma.media.findFirst({
    where: { id: mediaId, tenant: { status: 'ACTIVE' } },
    select: { id: true, name: true, tenantId: true, ctaJson: true }
  });

  if (!media || !media.ctaJson) {
    return res.status(404).send('Not found');
  }

  let cta: any;
  try {
    cta = JSON.parse(media.ctaJson);
  } catch {
    return res.status(404).send('Not found');
  }

  if (!cta?.enabled || (!cta?.target && cta?.mode !== 'PROFILE') || !VALID_CTA_TYPES.includes(cta.type)) {
    return res.status(404).send('Not found');
  }

  // Validate screenId if provided, or resolve automatically from media's active screens
  let validatedScreenId: string | null = null;
  if (screenId && screenId.length > 0) {
    const screen = await prisma.screen.findFirst({
      where: { id: screenId },
      select: { id: true }
    });
    validatedScreenId = screen?.id ?? null;
  }

  // Fallback: if screenId wasn't passed in query string, resolve which screen is currently playing this mediaId
  if (!validatedScreenId) {
    const activeScreen = await prisma.screen.findFirst({
      where: {
        tenantId: media.tenantId,
        OR: [
          { currentMediaId: media.id },
          { activePlaylist: { items: { some: { mediaId: media.id } } } }
        ]
      },
      select: { id: true }
    });
    validatedScreenId = activeScreen?.id ?? null;
  }

  // Register the scan asynchronously (do not block the redirect)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 512);
  prisma.qrScan.create({
    data: {
      tenantId: media.tenantId,
      mediaId: media.id,
      screenId: validatedScreenId,
      ctaType: cta.mode === 'PROFILE' ? 'PROFILE' : cta.type,
      scanSource: 'QR_CODE',
      userAgent: userAgent || null
    }
  }).catch(() => { /* Non-blocking: do not fail redirect if DB write fails */ });

  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Pragma', 'no-cache');

  // MODO PROFILE — Renderiza a Landing Page do Perfil
  if (cta.mode === 'PROFILE') {
    return res.status(200).send(renderProfileHtml(cta, media.name));
  }

  // MODO DIRECT — Redirect 302 para a URL final
  const redirectUrl = getNormalizedTargetUrl(cta);
  return res.redirect(302, redirectUrl);
});

/**
 * GET /r/nfc/:screenId
 *
 * Endpoint público para Toque NFC Dinâmico no Totem.
 * - Recebe a aproximação do celular no adesivo NFC fixado na moldura do Totem.
 * - Identifica qual mídia está rodando NAQUELE EXATO SEGUNDO na tela (5 camadas).
 * - Registra a conversão com scanSource = 'NFC_TAP'.
 * - Para WHATSAPP: entrega página HTML que tenta abrir o aplicativo via whatsapp://.
 * - Para outros tipos: redirect 302 direto.
 */
qrRoutes.get('/nfc/:screenId', scanRateLimit, async (req: Request, res: Response): Promise<any> => {
  const { screenId } = req.params;

  if (!screenId || typeof screenId !== 'string' || !/^[0-9a-f-]{36}$/i.test(screenId)) {
    return res.status(404).send('Tela não encontrada.');
  }

  // Find screen with active tenant and current media
  const screen = await prisma.screen.findFirst({
    where: { id: screenId, tenant: { status: 'ACTIVE' } },
    select: { id: true, tenantId: true, currentMediaId: true, currentMediaName: true, activePlaylistId: true, createdById: true }
  });

  if (!screen) {
    return res.status(404).send('Tela ou estabelecimento inativo.');
  }

  // --- 5-layer media resolution ---

  // 1. Try screen.currentMediaId (reported by player in real-time via heartbeat)
  let targetMediaId = screen.currentMediaId;

  // 2. Try matching screen.currentMediaName if reported
  if (!targetMediaId && screen.currentMediaName) {
    const mediaByName = await prisma.media.findFirst({
      where: { name: screen.currentMediaName, tenantId: screen.tenantId }
    });
    if (mediaByName) targetMediaId = mediaByName.id;
  }

  // 3. Try screen.activePlaylistId or default tenant playlist
  if (!targetMediaId) {
    const playlist = screen.activePlaylistId
      ? await prisma.playlist.findUnique({
          where: { id: screen.activePlaylistId, tenantId: screen.tenantId },
          include: { items: { include: { media: true }, orderBy: { orderIndex: 'asc' } } }
        })
      : await prisma.playlist.findFirst({
          where: { tenantId: screen.tenantId, createdById: screen.createdById || undefined },
          include: { items: { include: { media: true }, orderBy: { orderIndex: 'asc' } } }
        });

    if (playlist?.items) {
      // Prefer the first item in the playlist that has a valid CTA enabled
      for (const item of playlist.items) {
        if (item.media?.ctaJson) {
          try {
            const parsed = JSON.parse(item.media.ctaJson);
            if (parsed?.enabled && parsed?.target) {
              targetMediaId = item.media.id;
              break;
            }
          } catch {}
        }
      }
      if (!targetMediaId && playlist.items[0]?.mediaId) {
        targetMediaId = playlist.items[0].mediaId;
      }
    }
  }

  // 4. Fallback: Find ANY media in tenant with an active CTA
  if (!targetMediaId) {
    const anyCtaMedia = await prisma.media.findFirst({
      where: { tenantId: screen.tenantId, NOT: { ctaJson: null } },
      orderBy: { updatedAt: 'desc' }
    });
    if (anyCtaMedia) targetMediaId = anyCtaMedia.id;
  }

  if (!targetMediaId) {
    return res.status(404).send('Nenhuma mídia com QR/NFC configurada nesta tela.');
  }

  // Fetch media CTA configuration
  const media = await prisma.media.findFirst({
    where: { id: targetMediaId, tenantId: screen.tenantId },
    select: { id: true, name: true, ctaJson: true }
  });

  if (!media || !media.ctaJson) {
    return res.status(404).send('A mídia atual não possui CTA configurado.');
  }

  let cta: any;
  try {
    cta = JSON.parse(media.ctaJson);
  } catch {
    return res.status(404).send('CTA inválido.');
  }

  if (!cta?.enabled || (!cta?.target && cta?.mode !== 'PROFILE') || !VALID_CTA_TYPES.includes(cta.type)) {
    return res.status(404).send('CTA desativado para a mídia atual.');
  }

  // Record NFC Tap conversion (before response, non-blocking)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 512);
  prisma.qrScan.create({
    data: {
      tenantId: screen.tenantId,
      mediaId: media.id,
      screenId: screen.id,
      ctaType: cta.mode === 'PROFILE' ? 'PROFILE' : cta.type,
      scanSource: 'NFC_TAP',
      userAgent: userAgent || null
    }
  }).catch(() => { /* Non-blocking */ });

  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Pragma', 'no-cache');

  // MODO PROFILE — Renderiza a Landing Page do Perfil
  if (cta.mode === 'PROFILE') {
    return res.status(200).send(renderProfileHtml(cta, media.name));
  }

  // -------------------------------------------------------------------------
  // WhatsApp: entregar página HTML intermediária que tenta abrir o app nativo
  // via whatsapp:// e só faz fallback para wa.me se o app não abrir em 1.2s.
  // -------------------------------------------------------------------------
  if (cta.type === 'WHATSAPP') {
    const parsed = parseWhatsAppTarget(cta);

    if (!parsed) {
      // Dados inválidos — fallback seguro para wa.me via redirect simples
      const fallback = getNormalizedTargetUrl(cta);
      return res.redirect(302, fallback || '/');
    }

    const whatsappAppUrl = buildWhatsAppAppUrl(parsed.phone, parsed.text);
    const whatsappWebUrl = buildWhatsAppWebUrl(parsed.phone, parsed.text);

    const safeAppUrl  = JSON.stringify(whatsappAppUrl);
    const safeWebUrl  = JSON.stringify(whatsappWebUrl);
    const safeAppAttr = whatsappAppUrl.replace(/"/g, '&quot;');
    const safeWebAttr = whatsappWebUrl.replace(/"/g, '&quot;');

    return res.status(200).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>Abrir WhatsApp</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      background: #f0fdf4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #fff;
      border-radius: 24px;
      padding: 40px 28px 32px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.12);
      max-width: 340px;
      width: 90%;
      text-align: center;
    }
    .logo {
      width: 72px;
      height: 72px;
      background: #25D366;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 36px;
    }
    .title {
      font-size: 20px;
      font-weight: 800;
      color: #111827;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: #6b7280;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .btn-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 16px 24px;
      background: #25D366;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      border-radius: 14px;
      text-decoration: none;
      margin-bottom: 12px;
      transition: background 0.15s, transform 0.1s;
      border: none;
      cursor: pointer;
    }
    .btn-primary:active { background: #1ebe5d; transform: scale(0.98); }
    .btn-secondary {
      display: block;
      color: #6b7280;
      font-size: 13px;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">💬</div>
    <div class="title">Abrir no WhatsApp</div>
    <div class="subtitle">Toque no botão abaixo para<br>iniciar uma conversa.</div>

    <!--
      href = whatsapp://send?phone=...
      Este link é ativado pelo TAP do usuário (gesto), portanto o browser
      SEMPRE permite abrir o app, mesmo em Chrome com política restrita.
    -->
    <a class="btn-primary" href="${safeAppAttr}" id="open-btn">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      Abrir WhatsApp
    </a>

    <!-- Fallback: abre wa.me no navegador se o app não estiver instalado -->
    <a class="btn-secondary" href="${safeWebAttr}">Abrir no navegador</a>
  </div>

  <script>
    // Tenta abrir automaticamente via whatsapp:// ao carregar a página.
    // Em muitos browsers isso funciona. Se falhar silenciosamente, o botão
    // acima garante que o usuário consegue abrir com um tap.
    var _auto = false;
    try {
      window.location.href = ${safeAppUrl};
      _auto = true;
    } catch (e) {}
  </script>
</body>
</html>`);
  }

  // -------------------------------------------------------------------------
  // Outros tipos (INSTAGRAM, URL, CUSTOM_URL, WEBSITE): redirect 302 simples
  // -------------------------------------------------------------------------
  const redirectUrl = getNormalizedTargetUrl(cta);
  return res.redirect(302, redirectUrl);
});
