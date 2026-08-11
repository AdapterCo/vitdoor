import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { tenantScope } from '../middleware/auth.js';

export const qrStatsRoutes = Router();

/**
 * GET /api/qr-scans/stats?tenantId=:tenantId&days=7
 *
 * Retorna:
 * - total de scans no período
 * - breakdown por tipo (WHATSAPP / INSTAGRAM)
 * - top telas por scans
 * - top mídias por scans
 * - eventos recentes (últimos 50)
 * - série temporal agrupada por dia
 */
qrStatsRoutes.get('/stats', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 7));
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);

  const [
    totalScans,
    whatsappScans,
    instagramScans,
    recentScans,
    topMedias,
    topScreens
  ] = await Promise.all([
    prisma.qrScan.count({ where: { tenantId, scannedAt: { gte: since } } }),
    prisma.qrScan.count({ where: { tenantId, ctaType: 'WHATSAPP', scannedAt: { gte: since } } }),
    prisma.qrScan.count({ where: { tenantId, ctaType: 'INSTAGRAM', scannedAt: { gte: since } } }),
    // Recent 50 events
    prisma.qrScan.findMany({
      where: { tenantId, scannedAt: { gte: since } },
      include: {
        media: { select: { id: true, name: true, type: true } },
        screen: { select: { id: true, name: true, locationName: true } }
      },
      orderBy: { scannedAt: 'desc' },
      take: 50
    }),
    // Top 10 mídias
    prisma.qrScan.groupBy({
      by: ['mediaId'],
      where: { tenantId, scannedAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10
    }),
    // Top 10 telas
    prisma.qrScan.groupBy({
      by: ['screenId'],
      where: { tenantId, screenId: { not: null }, scannedAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10
    })
  ]);

  // Resolve media names for top mídias
  const mediaIds = topMedias.map((row) => row.mediaId);
  const mediaNames = await prisma.media.findMany({
    where: { id: { in: mediaIds }, tenantId },
    select: { id: true, name: true }
  });
  const mediaNameMap = new Map(mediaNames.map((m) => [m.id, m.name]));

  // Resolve screen names for top telas
  const screenIds = topScreens.map((row) => row.screenId).filter((id): id is string => !!id);
  const screenNames = await prisma.screen.findMany({
    where: { id: { in: screenIds }, tenantId },
    select: { id: true, name: true, locationName: true }
  });
  const screenNameMap = new Map(screenNames.map((s) => [s.id, { name: s.name, locationName: s.locationName }]));

  return res.json({
    period: { days, since },
    totalScans,
    whatsappScans,
    instagramScans,
    topMedias: topMedias.map((row) => ({
      mediaId: row.mediaId,
      mediaName: mediaNameMap.get(row.mediaId) ?? 'Mídia removida',
      scans: row._count.id
    })),
    topScreens: topScreens.map((row) => ({
      screenId: row.screenId,
      screenName: screenNameMap.get(row.screenId!)?.name ?? 'Tela removida',
      locationName: screenNameMap.get(row.screenId!)?.locationName ?? null,
      scans: row._count.id
    })),
    recentScans: recentScans.map((scan) => ({
      id: scan.id,
      ctaType: scan.ctaType,
      scannedAt: scan.scannedAt,
      media: scan.media,
      screen: scan.screen
    }))
  });
});
