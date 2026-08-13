import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const publicReportRoutes = Router();

/**
 * GET /api/public/report/media/:mediaId
 *
 * Endpoint público para relatório de auditoria e conversões de uma mídia específica.
 * Permite ao anunciante visualizar a comprovação de veiculação e engajamento sem login.
 */
publicReportRoutes.get('/media/:mediaId', async (req: Request, res: Response): Promise<any> => {
  const { mediaId } = req.params;

  if (!mediaId || typeof mediaId !== 'string' || !/^[0-9a-f-]{36}$/i.test(mediaId)) {
    return res.status(400).json({ error: 'ID de mídia inválido.' });
  }

  const media = await prisma.media.findUnique({
    where: { id: mediaId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      type: true,
      url: true,
      thumbnailUrl: true,
      durationSeconds: true,
      createdAt: true,
      ctaJson: true,
      tenant: { select: { name: true, logoUrl: true } }
    }
  });

  if (!media) {
    return res.status(404).json({ error: 'Mídia não encontrada.' });
  }

  const days = Math.max(1, Math.min(90, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);

  const [
    totalPlays,
    timeSum,
    recentPlays,
    screensGroup,
    totalScans,
    qrCodeScans,
    nfcTapScans,
    whatsappScans,
    instagramScans,
    urlScans,
    profileScans,
    recentScans
  ] = await Promise.all([
    // Total de reproduções da mídia no período (por mediaName)
    prisma.proofOfPlay.count({
      where: {
        tenantId: media.tenantId,
        mediaName: media.name,
        playedAt: { gte: since }
      }
    }),
    // Tempo total de tela acumulado
    prisma.proofOfPlay.aggregate({
      where: {
        tenantId: media.tenantId,
        mediaName: media.name,
        playedAt: { gte: since }
      },
      _sum: { durationSeconds: true }
    }),
    // Últimos 50 eventos de reprodução
    prisma.proofOfPlay.findMany({
      where: {
        tenantId: media.tenantId,
        mediaName: media.name,
        playedAt: { gte: since }
      },
      include: { screen: { select: { id: true, name: true, locationName: true } } },
      orderBy: { playedAt: 'desc' },
      take: 50
    }),
    // Agrupamento por telas exibidas
    prisma.proofOfPlay.groupBy({
      by: ['screenId'],
      where: {
        tenantId: media.tenantId,
        mediaName: media.name,
        playedAt: { gte: since }
      },
      _count: { _all: true },
      orderBy: { _count: { screenId: 'desc' } }
    }),
    // Conversões QR/NFC
    prisma.qrScan.count({ where: { mediaId: media.id, scannedAt: { gte: since } } }),
    prisma.qrScan.count({ where: { mediaId: media.id, scanSource: 'QR_CODE', scannedAt: { gte: since } } }),
    prisma.qrScan.count({ where: { mediaId: media.id, scanSource: 'NFC_TAP', scannedAt: { gte: since } } }),
    prisma.qrScan.count({ where: { mediaId: media.id, ctaType: 'WHATSAPP', scannedAt: { gte: since } } }),
    prisma.qrScan.count({ where: { mediaId: media.id, ctaType: 'INSTAGRAM', scannedAt: { gte: since } } }),
    prisma.qrScan.count({ where: { mediaId: media.id, ctaType: { in: ['URL', 'CUSTOM_URL', 'WEBSITE'] }, scannedAt: { gte: since } } }),
    prisma.qrScan.count({ where: { mediaId: media.id, ctaType: 'PROFILE', scannedAt: { gte: since } } }),
    // Últimas 50 conversões
    prisma.qrScan.findMany({
      where: { mediaId: media.id, scannedAt: { gte: since } },
      include: { screen: { select: { id: true, name: true, locationName: true } } },
      orderBy: { scannedAt: 'desc' },
      take: 50
    })
  ]);

  // Resolver nomes de telas exibidas
  const screenIds = screensGroup.map((row) => row.screenId).filter((id): id is string => !!id);
  const screens = screenIds.length
    ? await prisma.screen.findMany({
        where: { id: { in: screenIds } },
        select: { id: true, name: true, locationName: true }
      })
    : [];
  const screenMap = new Map(screens.map((s) => [s.id, { name: s.name, locationName: s.locationName }]));

  let cta: any = null;
  if (media.ctaJson) {
    try { cta = JSON.parse(media.ctaJson); } catch {}
  }

  return res.json({
    media: {
      id: media.id,
      name: media.name,
      type: media.type,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      durationSeconds: media.durationSeconds,
      createdAt: media.createdAt,
      cta,
      networkName: media.tenant?.name || 'VitDoor Mídia Indoor'
    },
    period: { days, since },
    summary: {
      totalPlays,
      totalDurationSeconds: Number(timeSum._sum.durationSeconds || 0),
      totalScreensCount: screensGroup.length,
      totalScans,
      qrCodeScans,
      nfcTapScans,
      whatsappScans,
      instagramScans,
      urlScans,
      profileScans
    },
    screensList: screensGroup.map((row) => ({
      screenId: row.screenId,
      screenName: screenMap.get(row.screenId!)?.name ?? 'Tela desvinculada',
      locationName: screenMap.get(row.screenId!)?.locationName ?? null,
      plays: row._count._all
    })),
    recentPlays: recentPlays.map((log) => ({
      id: log.id,
      playedAt: log.playedAt,
      durationSeconds: log.durationSeconds,
      completed: log.completed,
      screenName: log.screen?.name ?? 'Tela desvinculada',
      locationName: log.screen?.locationName ?? null
    })),
    recentScans: recentScans.map((scan) => ({
      id: scan.id,
      scannedAt: scan.scannedAt,
      scanSource: scan.scanSource || 'QR_CODE',
      ctaType: scan.ctaType,
      screenName: scan.screen?.name ?? 'Tela desvinculada',
      locationName: scan.screen?.locationName ?? null
    }))
  });
});
