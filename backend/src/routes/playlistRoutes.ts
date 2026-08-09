import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendManifestToScreen } from '../lib/websocket.js';
import { tenantScope } from '../middleware/auth.js';
import { playlistDto } from '../lib/dto.js';
import { bumpScreenManifestVersions } from '../lib/manifest.js';

export const playlistRoutes = Router();

playlistRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const playlists = await prisma.playlist.findMany({
    where: { tenantId, createdById: req.auth!.userId },
    include: {
      screens: { select: { id: true, name: true } },
      items: {
        include: { media: true, layout: true },
        orderBy: { orderIndex: 'asc' }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });
  return res.json(playlists.map((playlist) => playlistDto(playlist)));
});

playlistRoutes.post('/', async (req: Request, res: Response): Promise<any> => {
  const { tenantId: requestedTenantId, name, description, category, items, screenIds = [] } = req.body;
  const tenantId = tenantScope(req, requestedTenantId);
  const normalizedItems = normalizeItems(items);
  const targetScreenIds = normalizeIds(screenIds);

  if (!name) {
    return res.status(400).json({ error: 'TenantId e Nome da playlist são obrigatórios.' });
  }

  if (!normalizedItems || !await validateItems(tenantId, req.auth!.userId, normalizedItems)) {
    return res.status(400).json({ error: 'Uma ou mais mídias ou layouts não pertencem a este cliente.' });
  }

  const selectedScreens = await findOwnedScreens(tenantId, req.auth!.userId, targetScreenIds);
  if (selectedScreens.length !== targetScreenIds.length) {
    return res.status(400).json({ error: 'Uma ou mais telas selecionadas são inválidas.' });
  }

  const playlist = await prisma.playlist.create({
    data: {
      tenantId,
      createdById: req.auth!.userId,
      name,
      description,
      category: category || 'Geral',
      isLoop: true,
      items: {
        create: normalizedItems.map((item, idx) => ({
          mediaId: item.mediaId,
          layoutId: item.layoutId,
          orderIndex: idx,
          durationSeconds: item.durationSeconds
        }))
      }
    },
    include: {
      items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } }
    }
  });

  if (targetScreenIds.length > 0) {
    await prisma.screen.updateMany({
      where: { id: { in: targetScreenIds }, tenantId, createdById: req.auth!.userId },
      data: { activePlaylistId: playlist.id, manifestVersion: { increment: 1 } }
    });
    for (const screen of selectedScreens) {
      await sendManifestToScreen(screen.id);
    }
  }

  return res.json(playlistDto(playlist));
});

playlistRoutes.put('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { name, description, category, items, screenIds, tenantId: requestedTenantId } = req.body;
  const tenantId = tenantScope(req, requestedTenantId);
  const normalizedItems = normalizeItems(items);
  const targetScreenIds = Array.isArray(screenIds) ? normalizeIds(screenIds) : null;
  const existing = await prisma.playlist.findFirst({
    where: { id, tenantId, createdById: req.auth!.userId },
    include: { screens: { select: { id: true } } }
  });
  if (!existing) return res.status(404).json({ error: 'Playlist não encontrada.' });

  if (!normalizedItems || !await validateItems(tenantId, req.auth!.userId, normalizedItems)) {
    return res.status(400).json({ error: 'Uma ou mais mídias ou layouts não pertencem a este cliente.' });
  }

  const selectedScreens = targetScreenIds
    ? await findOwnedScreens(tenantId, req.auth!.userId, targetScreenIds)
    : [];
  if (targetScreenIds && selectedScreens.length !== targetScreenIds.length) {
    return res.status(400).json({ error: 'Uma ou mais telas selecionadas são inválidas.' });
  }

  const playlist = await prisma.$transaction(async (tx) => {
    await tx.playlistItem.deleteMany({ where: { playlistId: id } });
    return tx.playlist.update({
      where: { id },
      data: {
        name,
        description,
        category,
        isLoop: true,
        items: {
          create: normalizedItems.map((item, idx) => ({
            mediaId: item.mediaId,
            layoutId: item.layoutId,
            orderIndex: idx,
            durationSeconds: item.durationSeconds
          }))
        }
      },
      include: {
        items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } }
      }
    });
  });

  if (targetScreenIds) {
    const removedScreenIds = existing.screens.map((screen) => screen.id).filter((screenId) => !targetScreenIds.includes(screenId));
    await prisma.screen.updateMany({
      where: { tenantId, createdById: req.auth!.userId, activePlaylistId: id, id: { notIn: targetScreenIds } },
      data: { activePlaylistId: null }
    });
    await prisma.screen.updateMany({
      where: { tenantId, createdById: req.auth!.userId, id: { in: targetScreenIds } },
      data: { activePlaylistId: id }
    });
    const affectedIds = [...new Set([...targetScreenIds, ...removedScreenIds])];
    await bumpScreenManifestVersions(affectedIds);
    for (const screenId of affectedIds) await sendManifestToScreen(screenId, removedScreenIds.includes(screenId));
  } else {
    const ownedScreens = await prisma.screen.findMany({ where: { tenantId, createdById: req.auth!.userId, activePlaylistId: id }, select: { id: true } });
    const affectedIds = ownedScreens.map((screen) => screen.id);
    await bumpScreenManifestVersions(affectedIds);
    for (const screenId of affectedIds) await sendManifestToScreen(screenId);
  }

  return res.json(playlistDto(playlist));
});

playlistRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const existing = await prisma.playlist.findFirst({
    where: { id, tenantId, createdById: req.auth!.userId },
    include: { screens: { select: { id: true } } }
  });
  if (!existing) return res.status(404).json({ error: 'Playlist não encontrada.' });
  await prisma.playlist.delete({ where: { id } });
  const affectedIds = existing.screens.map((screen) => screen.id);
  await bumpScreenManifestVersions(affectedIds);
  for (const screenId of affectedIds) await sendManifestToScreen(screenId, true);
  return res.json({ success: true });
});

async function validateItems(tenantId: string, userId: string, items: any[]): Promise<boolean> {
  const mediaIds = [...new Set(items.map((item) => item.mediaId).filter((id): id is string => typeof id === 'string'))];
  const layoutIds = [...new Set(items.map((item) => item.layoutId).filter((id): id is string => typeof id === 'string'))];
  if (items.length === 0 || items.some((item) => Boolean(item.mediaId) === Boolean(item.layoutId))) return false;

  const [mediaCount, layoutCount] = await Promise.all([
    prisma.media.count({ where: { tenantId, createdById: userId, id: { in: mediaIds } } }),
    prisma.layout.count({ where: { tenantId, createdById: userId, id: { in: layoutIds } } })
  ]);
  return mediaCount === mediaIds.length && layoutCount === layoutIds.length;
}

type NormalizedPlaylistItem = {
  mediaId: string | null;
  layoutId: string | null;
  durationSeconds: number;
};

function normalizeItems(value: unknown): NormalizedPlaylistItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const result: NormalizedPlaylistItem[] = [];
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const item = rawItem as Record<string, unknown>;
    const mediaId = typeof item.mediaId === 'string' && item.mediaId.trim() ? item.mediaId.trim() : null;
    const layoutId = typeof item.layoutId === 'string' && item.layoutId.trim() ? item.layoutId.trim() : null;
    const durationSeconds = Number(item.durationSeconds ?? 10);
    if (Boolean(mediaId) === Boolean(layoutId) || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86400) {
      return null;
    }
    result.push({ mediaId, layoutId, durationSeconds });
  }
  return result;
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean))];
}

async function findOwnedScreens(tenantId: string, userId: string, screenIds: string[]) {
  if (screenIds.length === 0) return [];
  return prisma.screen.findMany({
    where: { tenantId, createdById: userId, id: { in: screenIds } },
    select: { id: true }
  });
}
