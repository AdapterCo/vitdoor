import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { rateLimit } from 'express-rate-limit';
import {
  getNormalizedTargetUrl,
  parseWhatsAppTarget,
  buildWhatsAppWebUrl,
  buildWhatsAppAppUrl
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
 * - Faz redirect 302 para a URL real (WhatsApp https://wa.me/ / Instagram / URL).
 *
 * URL gerada pelo player: /r/<mediaId>?s=<screenId>
 *
 * O QR Code aponta para wa.me e funciona corretamente em qualquer câmera.
 * O tratamento especial do aplicativo (whatsapp://) é exclusivo do fluxo NFC.
 */
qrRoutes.get('/:mediaId', scanRateLimit, async (req: Request, res: Response): Promise<any> => {
  const { mediaId } = req.params;
  const screenId = typeof req.query.s === 'string' ? req.query.s.trim() : undefined;

  if (!mediaId || typeof mediaId !== 'string' || !/^[0-9a-f-]{36}$/i.test(mediaId)) {
    return res.status(404).send('Not found');
  }

  const media = await prisma.media.findFirst({
    where: { id: mediaId, tenant: { status: 'ACTIVE' } },
    select: { id: true, tenantId: true, ctaJson: true }
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

  if (!cta?.enabled || !cta?.target || !VALID_CTA_TYPES.includes(cta.type)) {
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
      ctaType: cta.type,
      scanSource: 'QR_CODE',
      userAgent: userAgent || null
    }
  }).catch(() => { /* Non-blocking: do not fail redirect if DB write fails */ });

  const redirectUrl = getNormalizedTargetUrl(cta);

  // Cache-busting: redirect must not be cached by proxies
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Pragma', 'no-cache');
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
    select: { id: true, ctaJson: true }
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

  if (!cta?.enabled || !cta?.target || !VALID_CTA_TYPES.includes(cta.type)) {
    return res.status(404).send('CTA desativado para a mídia atual.');
  }

  // Record NFC Tap conversion (before response, non-blocking)
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 512);
  prisma.qrScan.create({
    data: {
      tenantId: screen.tenantId,
      mediaId: media.id,
      screenId: screen.id,
      ctaType: cta.type,
      scanSource: 'NFC_TAP',
      userAgent: userAgent || null
    }
  }).catch(() => { /* Non-blocking */ });

  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Pragma', 'no-cache');

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

    const whatsappWebUrl = buildWhatsAppWebUrl(parsed.phone, parsed.text);
    const whatsappAppUrl = buildWhatsAppAppUrl(parsed.phone, parsed.text);

    // JSON.stringify garante escape seguro das strings no contexto JS (evita XSS)
    const safeAppUrl     = JSON.stringify(whatsappAppUrl);
    const safeWebUrl     = JSON.stringify(whatsappWebUrl);
    const safeWebUrlAttr = whatsappWebUrl.replace(/"/g, '&quot;');

    return res.status(200).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>Abrindo WhatsApp...</title>
  <style>
    html, body {
      margin: 0; padding: 0;
      width: 100%; height: 100%;
      background: #f0fdf4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    }
    body { display: flex; align-items: center; justify-content: center; text-align: center; }
    .card {
      background: #ffffff;
      border-radius: 20px;
      padding: 36px 28px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.10);
      max-width: 340px;
      width: 90%;
    }
    .icon { font-size: 52px; margin-bottom: 12px; }
    .title { font-size: 19px; font-weight: 700; color: #1a1a1a; margin-bottom: 6px; }
    .subtitle { font-size: 13px; color: #6b7280; margin-bottom: 24px; line-height: 1.5; }
    .btn {
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 24px;
      background: #25D366;
      color: #ffffff;
      font-size: 15px;
      font-weight: 700;
      border-radius: 12px;
      text-decoration: none;
      width: 100%;
      box-sizing: border-box;
      transition: background 0.15s;
    }
    .btn.visible { display: inline-flex; }
    .btn:hover { background: #1ebe5d; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">💬</div>
    <div class="title">Abrindo o WhatsApp…</div>
    <div class="subtitle">Aguarde um instante.<br>Se não abrir automaticamente, toque no botão abaixo.</div>
    <a class="btn" href="${safeWebUrlAttr}" id="fallback-btn">
      Abrir WhatsApp
    </a>
  </div>
  <script>
    var appUrl      = ${safeAppUrl};
    var fallbackUrl = ${safeWebUrl};
    var redirected  = false;

    // Detect if the user left the page (app opened successfully)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) redirected = true;
    });

    // Trigger the native WhatsApp scheme immediately
    window.location.href = appUrl;

    // Always show the button after 1 second — regardless of whether the app opened
    setTimeout(function () {
      var btn = document.getElementById('fallback-btn');
      if (btn) btn.classList.add('visible');
    }, 1000);

    // Redirect to wa.me after 2.5 seconds ONLY if the user is still on this page
    setTimeout(function () {
      if (!redirected && !document.hidden) {
        window.location.href = fallbackUrl;
      }
    }, 2500);
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
