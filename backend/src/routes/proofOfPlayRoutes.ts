import { randomUUID } from 'crypto';
import { campaignIsActive } from '../lib/schedule.js';
import { Router } from '../lib/router.js';
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, tenantScope } from '../middleware/auth.js';
import { authenticateDevice } from '../middleware/deviceAuth.js';
import { bumpOwnerManifestVersions } from '../lib/manifest.js';
import { sendManifestToScreen } from '../lib/websocket.js';

export const proofOfPlayRoutes = Router();

export function normalizeProofEvent(value: any) {
  if (!isUuid(value?.screenId)) return null;
  if (value.eventId != null && !isUuid(value.eventId)) return null;
  if (value.mediaId != null && !isUuid(value.mediaId)) return null;
  if (value.campaignId != null && !isUuid(value.campaignId)) return null;
  if (value.manifestVersion != null && (!Number.isInteger(value.manifestVersion) || value.manifestVersion < 1)) return null;
  if (value.mediaVersion != null && (!Number.isInteger(value.mediaVersion) || value.mediaVersion < 1)) return null;
  const durationSeconds = Number(value.durationSeconds ?? 10);
  const playedAt = value.playedAt == null ? new Date() : new Date(value.playedAt);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 86400 || !Number.isFinite(playedAt.getTime()) || playedAt.getTime() > Date.now() + 300_000) return null;
  if ((value.completed != null && typeof value.completed !== 'boolean') || typeof value.mediaName !== 'string' || !value.mediaName.trim()) return null;
  return { eventId: value.eventId?.toLowerCase() ?? randomUUID(), screenId: value.screenId, mediaId: value.mediaId ?? null as string | null, mediaName: value.mediaName.trim().slice(0, 255), mediaVersion: value.mediaVersion ?? null, campaignId: value.campaignId ?? null, zoneId: typeof value.zoneId === 'string' ? value.zoneId.slice(0, 50) : null, manifestVersion: value.manifestVersion ?? null, reason: typeof value.reason === 'string' ? value.reason.slice(0, 80) : null, playedAt, durationSeconds: Math.round(durationSeconds), completed: value.completed !== false };
}
function isUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

function mediaInPlaylist(playlist: any, mediaId: string): boolean {
  return (playlist?.items || []).some((item: any) => item.mediaId === mediaId || item.layout?.canvasConfig?.zones?.some((z: any) => z.items?.some((m: any) => m.mediaId === mediaId)));
}

async function ingest(items: any[], screenId: string, tenantId: string) {
  const versions = new Map<number, any>();
  const accepted: NonNullable<ReturnType<typeof normalizeProofEvent>>[] = [];
  const rejectedEventIds: string[] = [];
  for (const raw of items) {
    const item = normalizeProofEvent(raw);
    let valid = !!item && item.screenId === screenId;
    if (item && valid && item.mediaId && item.manifestVersion) {
      if (!versions.has(item.manifestVersion)) {
        const published = await prisma.screenManifest.findUnique({ where: { screenId_version: { screenId, version: item.manifestVersion } } });
        versions.set(item.manifestVersion, published ? JSON.parse(published.payload) : null);
      }
      const manifest = versions.get(item.manifestVersion);
      const asset = manifest?.assets?.find((m: any) => m.id === item.mediaId);
      valid = !!asset && (item.mediaVersion == null || asset.version === item.mediaVersion);
      if (valid) { item.mediaName = asset.name; item.mediaVersion = asset.version; }
      if (item.campaignId) {
        const campaign = manifest?.campaigns?.find((c: any) => c.id === item.campaignId);
        valid = valid && !!campaign && mediaInPlaylist(campaign.playlist, item.mediaId) && campaignIsActive(campaign, item.playedAt);
      }
    }
    // The original player contract supplies mediaName only. Optional new fields
    // must not become a prerequisite for existing Android/offline installations.
    if (item && valid && !(item.mediaId && item.manifestVersion)) {
      const matches = await prisma.media.findMany({ where: { tenantId, ...(item.mediaId ? { id: item.mediaId } : { name: item.mediaName }) }, take: 2 });
      if (item.mediaId && matches.length !== 1) valid = false;
      if (matches.length === 1) { item.mediaId = matches[0].id; item.mediaName = matches[0].name; }
      item.campaignId = null;
    }
    if (valid && item) accepted.push(item);
    else if (typeof raw?.eventId === 'string') rejectedEventIds.push(raw.eventId);
  }
  const uniqueItems = [...new Map(accepted.map(item => [item.eventId, item])).values()];
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;
    const created = await tx.proofOfPlay.createMany({ data: uniqueItems.map(item => ({ ...item, tenantId })), skipDuplicates: true });
    const campaigns = await tx.campaign.findMany({ where: { tenantId }, include: { playlist: { include: { items: { include: { media: true } } } } } });
    let changed = false;
    for (const campaign of campaigns) {
      const mediaIds = (campaign.playlist?.items || []).flatMap(i => i.mediaId ? [i.mediaId] : []);
      const mediaNames = (campaign.playlist?.items || []).flatMap(i => i.media ? [i.media.name] : []);
      const count = await tx.proofOfPlay.count({ where: { tenantId, completed: true, OR: [
        { campaignId: campaign.id },
        { campaignId: null, playedAt: { gte: campaign.createdAt }, OR: [{ mediaId: { in: mediaIds } }, { mediaId: null, mediaName: { in: mediaNames } }] }
      ] } });
      const expired = campaign.status === 'ACTIVE' && campaign.maxImpressions != null && count >= campaign.maxImpressions;
      await tx.campaign.update({ where: { id: campaign.id }, data: { currentImpressions: count, ...(expired ? { status: 'EXPIRED' } : {}) } });
      changed ||= expired;
    }
    if (changed) await tx.screen.updateMany({ where: { tenantId, archivedAt: null }, data: { manifestVersion: { increment: 1 } } });
    return { created, changed };
  });
  if (result.changed) {
    const screens = await prisma.screen.findMany({ where: { tenantId, archivedAt: null }, select: { id: true } });
    for (const screen of screens) await sendManifestToScreen(screen.id, true).catch(() => console.error('Campaign publish deferred', screen.id));
  }
  return { received: items.length, accepted: result.created.count, duplicates: accepted.length - result.created.count, rejected: items.length - accepted.length, eventIds: uniqueItems.map(item => item.eventId), rejectedEventIds };
}
proofOfPlayRoutes.post('/log', authenticateDevice, async (req, res) => {
  const result = await ingest([req.body], req.deviceAuth!.screenId, req.deviceAuth!.tenantId);
  if (result.rejected) return res.status(400).json({ error: 'Evento inválido ou mídia fora do manifesto.', ...result });
  return res.status(result.accepted ? 201 : 200).json({ ...result, eventId: result.eventIds[0], duplicate: result.duplicates > 0 });
});
proofOfPlayRoutes.post('/log-batch', authenticateDevice, async (req, res) => {
  if (!Array.isArray(req.body.items) || !req.body.items.length || req.body.items.length > 500) return res.status(400).json({ error: 'Envie entre 1 e 500 eventos.' });
  return res.json(await ingest(req.body.items, req.deviceAuth!.screenId, req.deviceAuth!.tenantId));
});

// Analytics dashboard summary
proofOfPlayRoutes.get('/stats', authenticate, async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);

  const totalPlays = await prisma.proofOfPlay.count({
    where: { tenantId }
  });

  const totalScreens = await prisma.screen.count({
    where: { tenantId, archivedAt: null }
  });

  const onlineScreens = await prisma.screen.count({
    where: {
      tenantId,
      archivedAt: null, lastPing: { gt: new Date(Date.now() - 60000) }, status: 'ONLINE'
    }
  });

  const offlineScreens = await prisma.screen.count({
    where: {
      tenantId,
      archivedAt: null, OR: [{ status: 'OFFLINE' }, { lastPing: null }, { lastPing: { lte: new Date(Date.now() - 60000) } }]
    }
  });

  const recentLogs = await prisma.proofOfPlay.findMany({
    where: { tenantId },
    include: { screen: { select: { id: true, name: true } } },
    orderBy: { playedAt: 'desc' },
    take: 50
  });
  const [storage, tenant] = await Promise.all([
    prisma.media.aggregate({ where: { tenantId, archivedAt: null }, _sum: { sizeBytes: true } }),
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
