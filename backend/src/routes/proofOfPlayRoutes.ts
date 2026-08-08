import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, tenantScope } from '../middleware/auth.js';

export const proofOfPlayRoutes = Router();

// Log a proof of play event from Player
proofOfPlayRoutes.post('/log', async (req: Request, res: Response): Promise<any> => {
  const { screenId, mediaName, durationSeconds, completed } = req.body;

  if (!screenId || !mediaName) {
    return res.status(400).json({ error: 'TenantId, screenId e mediaName são obrigatórios.' });
  }

  const screenExists = await prisma.screen.findUnique({ where: { id: screenId } });
  if (!screenExists) {
    return res.json({ success: false, message: 'Tela não encontrada' });
  }

  const log = await prisma.proofOfPlay.create({
    data: {
      tenantId: screenExists.tenantId,
      screenId,
      mediaName,
      durationSeconds: durationSeconds || 10,
      completed: completed !== undefined ? !!completed : true
    }
  });

  return res.json(log);
});

// Batch log proof of play events (offline queue sync)
proofOfPlayRoutes.post('/log-batch', async (req: Request, res: Response): Promise<any> => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Array de itens é obrigatório.' });
  }

  try {
    const validItems = [];
    for (const item of items) {
      if (!item.screenId) continue;
      const screenExists = await prisma.screen.findUnique({ where: { id: item.screenId } });
      if (screenExists) {
        validItems.push({
          tenantId: screenExists.tenantId,
          screenId: item.screenId,
          mediaName: item.mediaName || 'Mídia',
          playedAt: item.playedAt ? new Date(item.playedAt) : new Date(),
          durationSeconds: item.durationSeconds || 10,
          completed: item.completed !== undefined ? !!item.completed : true
        });
      }
    }

    if (validItems.length > 0) {
      const created = await prisma.proofOfPlay.createMany({ data: validItems });
      return res.json({ count: created.count });
    }
    return res.json({ count: 0 });
  } catch (err) {
    console.error('Error logging proof of play batch:', err);
    return res.json({ count: 0 });
  }
});

// Analytics dashboard summary
proofOfPlayRoutes.get('/stats', authenticate, async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);

  const totalPlays = await prisma.proofOfPlay.count({
    where: tenantId ? { tenantId } : {}
  });

  const totalScreens = await prisma.screen.count({
    where: tenantId ? { tenantId } : {}
  });

  const onlineScreens = await prisma.screen.count({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: 'ONLINE'
    }
  });

  const offlineScreens = await prisma.screen.count({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: 'OFFLINE'
    }
  });

  const recentLogs = await prisma.proofOfPlay.findMany({
    where: tenantId ? { tenantId } : {},
    include: { screen: true },
    orderBy: { playedAt: 'desc' },
    take: 20
  });
  const [storage, tenant] = await Promise.all([
    prisma.media.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { maxScreens: true, maxStorageMb: true } })
  ]);

  return res.json({
    totalPlays,
    totalScreens,
    onlineScreens,
    offlineScreens,
    recentLogs,
    storageUsedBytes: Number(storage._sum.sizeBytes || 0),
    maxStorageMb: tenant?.maxStorageMb || 0,
    maxScreens: tenant?.maxScreens || 0
  });
});
