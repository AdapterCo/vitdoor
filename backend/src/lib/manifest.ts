import { createHash } from 'crypto';
import { prisma } from './prisma.js';
import { playerLayoutDto, playlistDto, playerMediaDto } from './dto.js';

export const MANIFEST_SCHEMA_VERSION = 1;

export async function buildScreenManifest(screenId: string) {
  const screen = await prisma.screen.findFirst({
    where: { id: screenId, paired: true, tenant: { status: 'ACTIVE' } },
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

  for (const item of screen.activePlaylist?.items || []) {
    if (item.mediaId) mediaIds.add(item.mediaId);
    collectLayoutMedia(item.layout);
  }
  collectLayoutMedia(screen.activeLayout);

  const medias = mediaIds.size
    ? await prisma.media.findMany({
        where: {
          id: { in: [...mediaIds] },
          tenantId: screen.tenantId,
          createdById: screen.createdById
        },
        orderBy: { id: 'asc' }
      })
    : [];
  if (medias.length !== mediaIds.size) return null;

  const payload = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    version: screen.manifestVersion,
    screen: {
      id: screen.id,
      orientation: screen.orientation,
      volume: screen.volume
    },
    activePlaylist: playlistDto(screen.activePlaylist, true),
    activeLayout: playerLayoutDto(screen.activeLayout),
    assets: medias.map((media) => playerMediaDto(media))
  };

  return {
    ...payload,
    checksumAlgorithm: 'SHA-256',
    checksum: createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  };
}

export async function bumpScreenManifestVersions(screenIds: string[]): Promise<void> {
  const ids = [...new Set(screenIds.filter(Boolean))];
  if (!ids.length) return;
  await prisma.screen.updateMany({
    where: { id: { in: ids } },
    data: { manifestVersion: { increment: 1 } }
  });
}

export async function bumpOwnerManifestVersions(tenantId: string, ownerId: string): Promise<string[]> {
  const screens = await prisma.screen.findMany({
    where: { tenantId, createdById: ownerId },
    select: { id: true }
  });
  const ids = screens.map((screen) => screen.id);
  await bumpScreenManifestVersions(ids);
  return ids;
}
