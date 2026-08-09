import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, tenantScope } from '../middleware/auth.js';
import { authenticateDevice } from '../middleware/deviceAuth.js';

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

function normalizeProofEvent(value: any) {
  const eventId = typeof value?.eventId === 'string' ? value.eventId.trim().toLowerCase() : '';
  const screenId = typeof value?.screenId === 'string' ? value.screenId.trim() : '';
  const mediaName = typeof value?.mediaName === 'string' ? value.mediaName.trim().slice(0, 255) : '';
  const durationSeconds = Number(value?.durationSeconds);
  const playedAt = new Date(value?.playedAt);
  if (!isUuid(eventId) || !screenId || !mediaName || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86400 || Number.isNaN(playedAt.getTime())) return null;
  return { eventId, screenId, mediaName, playedAt, durationSeconds, completed: value?.completed !== false };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Analytics dashboard summary
proofOfPlayRoutes.get('/stats', authenticate, async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const ownerId = req.auth!.userId;

  const totalPlays = await prisma.proofOfPlay.count({
    where: { tenantId, screen: { createdById: ownerId } }
  });

  const totalScreens = await prisma.screen.count({
    where: { tenantId, createdById: ownerId }
  });

  const onlineScreens = await prisma.screen.count({
    where: {
      tenantId, createdById: ownerId,
      status: 'ONLINE'
    }
  });

  const offlineScreens = await prisma.screen.count({
    where: {
      tenantId, createdById: ownerId,
      status: 'OFFLINE'
    }
  });

  const recentLogs = await prisma.proofOfPlay.findMany({
    where: { tenantId, screen: { createdById: ownerId } },
    include: { screen: { select: { id: true, name: true } } },
    orderBy: { playedAt: 'desc' },
    take: 20
  });
  const [storage, tenant] = await Promise.all([
    prisma.media.aggregate({ where: { tenantId, createdById: ownerId }, _sum: { sizeBytes: true } }),
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
