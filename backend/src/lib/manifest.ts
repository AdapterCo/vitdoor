import { createHash } from 'crypto';
import { prisma } from './prisma.js';
import { playerLayoutDto, playlistDto, playerMediaDto } from './dto.js';

export const MANIFEST_SCHEMA_VERSION = 1;

export async function buildScreenManifest(screenId: string) {
  const screen = await prisma.screen.findFirst({
    where: { id: screenId, archivedAt: null, paired: true, tenant: { status: 'ACTIVE' } },
    include: {
      activePlaylist: {
        include: {
          items: {
            include: { media: true, layout: true },
            orderBy: { orderIndex: 'asc' }
          }
        }
      },
      activeLayout: true
    }
  });
  if (!screen) return null;
  if (screen.activePlaylist && screen.activePlaylist.tenantId !== screen.tenantId) return null;
  if (screen.activeLayout && screen.activeLayout.tenantId !== screen.tenantId) return null;

  const published = await prisma.screenManifest.findUnique({
    where: { screenId_version: { screenId: screen.id, version: screen.manifestVersion } },
    select: { payload: true }
  });
  if (published) return JSON.parse(published.payload);

  const mediaIds = new Set<string>();
  const collectLayoutMedia = (layout: any) => {
    if (!layout?.canvasConfigJson) return;
    try {
      const config = JSON.parse(layout.canvasConfigJson);
      for (const zone of Array.isArray(config?.zones) ? config.zones : []) {
        for (const item of Array.isArray(zone?.items) ? zone.items : []) {
          if (typeof item?.mediaId === 'string') mediaIds.add(item.mediaId);
        }
      }
    } catch {
      // Layout validation prevents malformed JSON; ignore legacy invalid records.
    }
  };

  const rawCampaigns = await prisma.campaign.findMany({
    where: {
      tenantId: screen.tenantId,
      status: 'ACTIVE'
    },
    include: {
      playlist: {
        include: {
          items: {
            include: { media: true, layout: true },
            orderBy: { orderIndex: 'asc' }
          }
        }
      }
    }
  });

  const activeCampaigns = rawCampaigns.filter(c => c.playlist?.tenantId === screen.tenantId && (c.maxImpressions == null || c.currentImpressions < c.maxImpressions));

  for (const item of screen.activePlaylist?.items || []) {
    if (item.mediaId) mediaIds.add(item.mediaId);
    collectLayoutMedia(item.layout);
  }
  for (const campaign of activeCampaigns) {
    for (const item of campaign.playlist?.items || []) {
      if (item.mediaId) mediaIds.add(item.mediaId);
      collectLayoutMedia(item.layout);
    }
  }
  collectLayoutMedia(screen.activeLayout);

  const medias = mediaIds.size
    ? await prisma.media.findMany({
        where: {
          id: { in: [...mediaIds] },
          tenantId: screen.tenantId, archivedAt: null
        },
        orderBy: { id: 'asc' }
      })
    : [];
  const mediaMap = new Map(medias.map(media => [media.id, media]));
  const hydrateLayout = (layout: any) => {
    if (!layout) return null;
    const dto = playerLayoutDto(layout);
    if (dto?.canvasConfig?.zones) dto.canvasConfig.zones = dto.canvasConfig.zones.map((zone: any) => ({ ...zone, items: (zone.items || []).flatMap((item: any) => {
      const media = mediaMap.get(item.mediaId); return media ? [{ ...playerMediaDto(media), mediaId: media.id }] : [];
    }) }));
    return dto;
  };
  const hydratePlaylist = (playlist: any) => {
    if (!playlist) return null;
    const dto = playlistDto(playlist, true)!;
    dto.items = (playlist.items || []).flatMap((item: any) => item.mediaId && !mediaMap.has(item.mediaId) ? [] : [{ id: item.id, mediaId: item.mediaId, layoutId: item.layoutId, durationSeconds: item.durationSeconds, media: item.mediaId ? playerMediaDto(mediaMap.get(item.mediaId)) : null, layout: hydrateLayout(item.layout) }]);
    return dto;
  };

  const payload = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    version: screen.manifestVersion,
    screen: {
      id: screen.id,
      orientation: screen.orientation,
      volume: screen.volume,
      maintenancePin: screen.maintenancePin ?? null
    },
    activePlaylist: hydratePlaylist(screen.activePlaylist),
    activeLayout: hydrateLayout(screen.activeLayout),
    campaigns: activeCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      advertiserName: c.advertiserName,
      startDate: c.startDate.toISOString().slice(0, 10),
      endDate: c.endDate.toISOString().slice(0, 10),
      startDateIso: c.startDate.toISOString(),
      endDateIso: c.endDate.toISOString(),
      startTime: c.startTime,
      endTime: c.endTime,
      daysOfWeek: c.daysOfWeek,
      priority: c.priority,
      timezone: c.timezone,
      maxImpressions: c.maxImpressions,
      playlist: hydratePlaylist(c.playlist)
    })),
    assets: medias.map((media) => playerMediaDto(media))
  };

  const manifest = {
    ...payload,
    checksumAlgorithm: 'SHA-256',
    checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  };

  try {
    await prisma.screenManifest.create({
      data: {
        screenId: screen.id,
        version: screen.manifestVersion,
        checksum: manifest.checksum,
        payload: JSON.stringify(manifest)
      }
    });
    // Mantém histórico suficiente para rollback/diagnóstico sem crescimento
    // infinito do banco. A versão mais recente nunca é removida.
    const obsolete = await prisma.screenManifest.findMany({
      where: { screenId: screen.id, createdAt: { lt: new Date(Date.now() - 90 * 86400_000) } },
      orderBy: { version: 'desc' },
      skip: 30,
      select: { id: true }
    });
    if (obsolete.length) {
      await prisma.screenManifest.deleteMany({ where: { id: { in: obsolete.map((item) => item.id) } } });
    }
    return manifest;
  } catch (error: any) {
    if (error?.code !== 'P2002') throw error;
    const concurrent = await prisma.screenManifest.findUnique({
      where: { screenId_version: { screenId: screen.id, version: screen.manifestVersion } },
      select: { payload: true }
    });
    return concurrent ? JSON.parse(concurrent.payload) : null;
  }
}

export async function bumpScreenManifestVersions(screenIds: string[]): Promise<void> {
  const ids = [...new Set(screenIds.filter(Boolean))];
  if (!ids.length) return;
  await prisma.screen.updateMany({
    where: { id: { in: ids } },
    data: { manifestVersion: { increment: 1 } }
  });
}

export async function bumpOwnerManifestVersions(tenantId: string, ownerId?: string): Promise<string[]> {
  const screens = await prisma.screen.findMany({
    where: { tenantId, archivedAt: null, ...(ownerId ? { createdById: ownerId } : {}) },
    select: { id: true }
  });
  const ids = screens.map((screen) => screen.id);
  await bumpScreenManifestVersions(ids);
  return ids;
}
