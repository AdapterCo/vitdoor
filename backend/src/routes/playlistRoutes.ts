import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { broadcastToAllScreens, sendCommandToScreen } from '../lib/websocket.js';
import { tenantScope } from '../middleware/auth.js';

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
  return res.json(playlists);
});

playlistRoutes.post('/', async (req: Request, res: Response): Promise<any> => {
  const { tenantId: requestedTenantId, name, description, category, isLoop, items, screenIds = [] } = req.body;
  const tenantId = tenantScope(req, requestedTenantId);

  if (!name) {
    return res.status(400).json({ error: 'TenantId e Nome da playlist são obrigatórios.' });
  }

  if (!await validateItems(tenantId, req.auth!.userId, items || [])) {
    return res.status(400).json({ error: 'Uma ou mais mídias ou layouts não pertencem a este cliente.' });
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
        create: (items || []).map((item: any, idx: number) => ({
          mediaId: item.mediaId || null,
          layoutId: item.layoutId || null,
          orderIndex: idx,
          durationSeconds: item.durationSeconds || 10
        }))
      }
    },
    include: {
      items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } }
    }
  });

  if (Array.isArray(screenIds) && screenIds.length > 0) {
    const selectedScreens = await prisma.screen.findMany({ where: { id: { in: screenIds }, tenantId, createdById: req.auth!.userId } });
    if (selectedScreens.length !== screenIds.length) {
      await prisma.playlist.delete({ where: { id: playlist.id } });
      return res.status(400).json({ error: 'Uma ou mais telas selecionadas são inválidas.' });
    }
    await prisma.screen.updateMany({
      where: { id: { in: screenIds }, tenantId, createdById: req.auth!.userId },
      data: { activePlaylistId: playlist.id }
    });
    for (const screen of selectedScreens) {
      sendPlaylistToScreen(screen.id, playlist);
    }
  }

  return res.json(playlist);
});

playlistRoutes.put('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { name, description, category, isLoop, items, screenIds, tenantId: requestedTenantId } = req.body;
  const tenantId = tenantScope(req, requestedTenantId);
  const existing = await prisma.playlist.findFirst({
    where: { id, tenantId, createdById: req.auth!.userId },
    include: { screens: { select: { id: true } } }
  });
  if (!existing) return res.status(404).json({ error: 'Playlist não encontrada.' });

  if (!await validateItems(tenantId, req.auth!.userId, items || [])) {
    return res.status(400).json({ error: 'Uma ou mais mídias ou layouts não pertencem a este cliente.' });
  }

  await prisma.playlistItem.deleteMany({ where: { playlistId: id } });

  const playlist = await prisma.playlist.update({
    where: { id },
    data: {
      name,
      description,
      category,
      isLoop: true,
      items: {
        create: (items || []).map((item: any, idx: number) => ({
          mediaId: item.mediaId || null,
          layoutId: item.layoutId || null,
          orderIndex: idx,
          durationSeconds: item.durationSeconds || 10
        }))
      }
    },
    include: {
      items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } }
    }
  });

  if (Array.isArray(screenIds)) {
    const removedScreenIds = existing.screens.map((screen) => screen.id).filter((screenId) => !screenIds.includes(screenId));
    await prisma.screen.updateMany({
      where: { tenantId, createdById: req.auth!.userId, activePlaylistId: id, id: { notIn: screenIds } },
      data: { activePlaylistId: null }
    });
    await prisma.screen.updateMany({
      where: { tenantId, createdById: req.auth!.userId, id: { in: screenIds } },
      data: { activePlaylistId: id }
    });
    for (const screenId of screenIds) sendPlaylistToScreen(screenId, playlist);
    for (const screenId of removedScreenIds) {
      sendCommandToScreen(screenId, { type: 'CONTENT_UPDATED', activePlaylist: null, forceReload: true });
    }
  } else {
    const ownedScreens = await prisma.screen.findMany({ where: { tenantId, createdById: req.auth!.userId, activePlaylistId: id }, select: { id: true } });
    for (const screen of ownedScreens) sendPlaylistToScreen(screen.id, playlist);
  }

  return res.json(playlist);
});

playlistRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const existing = await prisma.playlist.findFirst({ where: { id, tenantId, createdById: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: 'Playlist não encontrada.' });
  await prisma.playlist.delete({ where: { id } });
  return res.json({ success: true });
});

function sendPlaylistToScreen(screenId: string, playlist: any) {
  sendCommandToScreen(screenId, { type: 'CONTENT_UPDATED', activePlaylist: playlist });
}

async function validateItems(tenantId: string, userId: string, items: any[]): Promise<boolean> {
  const mediaIds = [...new Set(items.map((item) => item.mediaId).filter((id): id is string => typeof id === 'string'))];
  const layoutIds = [...new Set(items.map((item) => item.layoutId).filter((id): id is string => typeof id === 'string'))];
  if (items.some((item) => !item.mediaId && !item.layoutId)) return false;

  const [mediaCount, layoutCount] = await Promise.all([
    prisma.media.count({ where: { tenantId, createdById: userId, id: { in: mediaIds } } }),
    prisma.layout.count({ where: { tenantId, createdById: userId, id: { in: layoutIds } } })
  ]);
  return mediaCount === mediaIds.length && layoutCount === layoutIds.length;
}
