import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { rateLimit } from 'express-rate-limit';

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

function getNormalizedTargetUrl(cta: any): string {
  const rawTarget = String(cta?.target || '').trim();
  if (!rawTarget) return '';

  if (cta?.type === 'WHATSAPP') {
    if (rawTarget.startsWith('http://') || rawTarget.startsWith('https://')) {
      return rawTarget;
    }
    const phoneDigits = rawTarget.replace(/\D/g, '');
    if (phoneDigits.length >= 10) {
      return `https://wa.me/${phoneDigits}`;
    }
  }

  if (cta?.type === 'INSTAGRAM') {
    if (rawTarget.startsWith('http://') || rawTarget.startsWith('https://')) {
      return rawTarget;
    }
    const clean = rawTarget.replace(/^@/, '');
    return `https://instagram.com/${clean}`;
  }

  if (/^(https?:\/\/)/i.test(rawTarget)) {
    return rawTarget;
  }
  return `https://${rawTarget}`;
}

/**
 * GET /r/:mediaId?s=:screenId
 *
 * Endpoint público sem autenticação.
 * - Valida que a mídia pertence a um tenant ativo e tem CTA configurado.
 * - Registra o scan (tenantId, mediaId, screenId, ctaType, userAgent).
 * - Faz redirect 302 para a URL real (WhatsApp https://wa.me/ / Instagram).
 *
 * URL gerada pelo player: /r/<mediaId>?s=<screenId>
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

  if (!cta?.enabled || !cta?.target || !['WHATSAPP', 'INSTAGRAM', 'URL', 'CUSTOM_URL', 'WEBSITE'].includes(cta.type)) {
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
 * - Identifica qual mídia está rodando NAQUELE EXATO SEGUNDO na tela.
 * - Registra a conversão com scanSource = 'NFC_TAP'.
 * - Redireciona 302 para a URL de destino da mídia atual.
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

  // 1. Try screen.currentMediaId (reported by player in real-time)
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

  if (!cta?.enabled || !cta?.target || !['WHATSAPP', 'INSTAGRAM', 'URL', 'CUSTOM_URL', 'WEBSITE'].includes(cta.type)) {
    return res.status(404).send('CTA desativado para a mídia atual.');
  }

  // Record NFC Tap conversion
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

  const redirectUrl = getNormalizedTargetUrl(cta);

  // Redirect to WhatsApp / Instagram
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Pragma', 'no-cache');
  return res.redirect(302, redirectUrl);
});

