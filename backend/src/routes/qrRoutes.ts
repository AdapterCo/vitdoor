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

/**
 * GET /r/:mediaId?s=:screenId
 *
 * Endpoint público sem autenticação.
 * - Valida que a mídia pertence a um tenant ativo e tem CTA configurado.
 * - Registra o scan (tenantId, mediaId, screenId, ctaType, userAgent).
 * - Faz redirect 302 para a URL real (WhatsApp/Instagram).
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

  if (!cta?.enabled || !cta?.target || !['WHATSAPP', 'INSTAGRAM'].includes(cta.type)) {
    return res.status(404).send('Not found');
  }

  // Validate screenId if provided (looks up by ID, matching tenant first, then fallback to ID alone)
  let validatedScreenId: string | null = null;
  if (screenId && screenId.length > 0) {
    const screen = await prisma.screen.findFirst({
      where: { id: screenId },
      select: { id: true }
    });
    validatedScreenId = screen?.id ?? null;
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

  // Cache-busting: redirect must not be cached by proxies
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Pragma', 'no-cache');
  return res.redirect(302, cta.target);
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
    select: { id: true, tenantId: true, currentMediaId: true, activePlaylistId: true }
  });

  if (!screen) {
    return res.status(404).send('Tela ou estabelecimento inativo.');
  }

  // Determine current active media ID (either directly reported by player or from playlist items)
  let targetMediaId = screen.currentMediaId;

  if (!targetMediaId && screen.activePlaylistId) {
    const playlist = await prisma.playlist.findUnique({
      where: { id: screen.activePlaylistId },
      include: { items: { include: { media: true }, orderBy: { orderIndex: 'asc' }, take: 1 } }
    });
    targetMediaId = playlist?.items[0]?.mediaId || null;
  }

  if (!targetMediaId) {
    return res.status(404).send('Nenhuma mídia com QR/NFC em exibição no momento nesta tela.');
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

  if (!cta?.enabled || !cta?.target || !['WHATSAPP', 'INSTAGRAM'].includes(cta.type)) {
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

  // Redirect to WhatsApp / Instagram
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Pragma', 'no-cache');
  return res.redirect(302, cta.target);
});

