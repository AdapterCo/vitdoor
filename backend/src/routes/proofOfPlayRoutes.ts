import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, tenantScope } from '../middleware/auth.js';
import { authenticateDevice } from '../middleware/deviceAuth.js';
import { bumpOwnerManifestVersions } from '../lib/manifest.js';
import { sendManifestToScreen } from '../lib/websocket.js';

export const proofOfPlayRoutes = Router();

// Log a proof of play event from Player
proofOfPlayRoutes.post('/log', authenticateDevice, async (req: Request, res: Response): Promise<any> => {
  const item = normalizeProofEvent(req.body);

  if (!item) return res.status(400).json({ error: 'Evento inválido. eventId UUID, screenId, mediaName, playedAt e durationSeconds são obrigatórios.' });
  if (item.screenId !== req.deviceAuth!.screenId) return res.status(403).json({ error: 'A tela não pode registrar reprodução para outro dispositivo.' });

  const existing = await prisma.proofOfPlay.findUnique({ where: { screenId_eventId: { screenId: item.screenId, eventId: item.eventId } }, select: { id: true } });
  if (existing) return res.json({ accepted: true, duplicate: true, eventId: item.eventId, id: existing.id });
  try {
    const log = await prisma.proofOfPlay.create({ data: { ...item, tenantId: req.deviceAuth!.tenantId } });
    return res.status(201).json({ accepted: true, duplicate: false, eventId: item.eventId, id: log.id });
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;
    const duplicate = await prisma.proofOfPlay.findUnique({ where: { screenId_eventId: { screenId: item.screenId, eventId: item.eventId } }, select: { id: true } });
    return res.json({ accepted: true, duplicate: true, eventId: item.eventId, id: duplicate?.id });
  }
});

// Batch log proof of play events (offline queue sync)
proofOfPlayRoutes.post('/log-batch', authenticateDevice, async (req: Request, res: Response): Promise<any> => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length < 1 || items.length > 500) {
    return res.status(400).json({ error: 'Envie entre 1 e 500 eventos por lote.' });
  }

  try {
    const validItems: ReturnType<typeof normalizeProofEvent>[] = [];
    for (const item of items) {
      const normalized = normalizeProofEvent(item);
      if (normalized && normalized.screenId === req.deviceAuth!.screenId) validItems.push(normalized);
    }

    const uniqueItems = [...new Map(validItems.filter(Boolean).map((item) => [item!.eventId, item!])).values()];
    const created = await prisma.proofOfPlay.createMany({
      data: uniqueItems.map((item) => ({ ...item, tenantId: req.deviceAuth!.tenantId })),
      skipDuplicates: true
    });
    
    // Check if any campaign reached its maxImpressions limit
    void checkAndExpireCampaigns(req.deviceAuth!.tenantId).catch(() => {});

    return res.json({
      received: items.length,
      accepted: created.count,
      duplicates: validItems.length - created.count,
      rejected: items.length - validItems.length,
      eventIds: uniqueItems.map((item) => item.eventId)
    });
  } catch (err) {
    console.error('Error logging proof of play batch:', err);
    return res.status(500).json({ error: 'Não foi possível persistir o lote de proof-of-play.' });
  }
});

async function checkAndExpireCampaigns(tenantId: string) {
  const activeCampaigns = await prisma.campaign.findMany({
    where: { tenantId, status: 'ACTIVE', maxImpressions: { not: null } },
    include: { playlist: { include: { items: { include: { media: true } } } } }
  });

  let expiredAny = false;
  for (const campaign of activeCampaigns) {
    if (!campaign.maxImpressions || campaign.maxImpressions <= 0) continue;
    const mediaNames = campaign.playlist?.items
      .map((i) => i.media?.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0) || [];

    if (mediaNames.length > 0) {
      const count = await prisma.proofOfPlay.count({
        where: { tenantId, mediaName: { in: mediaNames } }
      });
      if (count >= campaign.maxImpressions) {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'EXPIRED' } });
        expiredAny = true;
      }
    }
  }

  if (expiredAny) {
    const affectedIds = await bumpOwnerManifestVersions(tenantId);
    for (const screenId of affectedIds) {
      await sendManifestToScreen(screenId, true);
    }
  }
}

function normalizeProofEvent(value: any) {
  let eventId = typeof value?.eventId === 'string' ? value.eventId.trim().toLowerCase() : '';
  if (!isUuid(eventId)) {
    eventId = crypto.randomUUID();
  }
  const screenId = typeof value?.screenId === 'string' ? value.screenId.trim() : '';
  const mediaName = typeof value?.mediaName === 'string' ? value.mediaName.trim().slice(0, 255) : '';
  const durationSeconds = Math.max(1, Math.min(86400, Math.round(Number(value?.durationSeconds) || 10)));
  const playedAt = value?.playedAt ? new Date(value.playedAt) : new Date();
  if (!screenId || !mediaName || Number.isNaN(playedAt.getTime())) return null;
  return { eventId, screenId, mediaName, playedAt, durationSeconds, completed: value?.completed !== false };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Analytics dashboard summary
proofOfPlayRoutes.get('/stats', authenticate, async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);

  const totalPlays = await prisma.proofOfPlay.count({
    where: { tenantId }
  });

  const totalScreens = await prisma.screen.count({
    where: { tenantId }
  });

  const onlineScreens = await prisma.screen.count({
    where: {
      tenantId,
      status: 'ONLINE'
    }
  });

  const offlineScreens = await prisma.screen.count({
    where: {
      tenantId,
      status: 'OFFLINE'
    }
  });

  const recentLogs = await prisma.proofOfPlay.findMany({
    where: { tenantId },
    include: { screen: { select: { id: true, name: true } } },
    orderBy: { playedAt: 'desc' },
    take: 50
  });
  const [storage, tenant] = await Promise.all([
    prisma.media.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { maxScreens: true, maxStorageMb: true, unlimitedScreens: true } })
  ]);

  return res.json({
    totalPlays,
    totalScreens,
    onlineScreens,
    offlineScreens,
    recentLogs: recentLogs.map((log) => ({
      id: log.id,
      mediaName: log.mediaName,
      playedAt: log.playedAt,
      durationSeconds: log.durationSeconds,
      completed: log.completed,
      screen: log.screen
    })),
    storageUsedBytes: Number(storage._sum.sizeBytes || 0),
    maxStorageMb: tenant?.maxStorageMb || 0,
    maxScreens: tenant?.unlimitedScreens ? null : tenant?.maxScreens || 0,
    unlimitedScreens: tenant?.unlimitedScreens || false
  });
});
