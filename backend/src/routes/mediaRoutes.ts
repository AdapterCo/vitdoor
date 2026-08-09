import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { saveFile } from '../lib/storage.js';
import { broadcastToAllScreens } from '../lib/websocket.js';
import { tenantScope } from '../middleware/auth.js';
import { detectMediaDuration } from '../lib/mediaMetadata.js';

export const mediaRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Helper to push playlist update to screens
async function autoAttachAndNotify(tenantId: string, mediaId: string, durationSeconds: number) {
  let playlist = await prisma.playlist.findFirst({
    where: { tenantId },
    include: { items: true }
  });

  if (!playlist) {
    playlist = await prisma.playlist.create({
      data: {
        tenantId,
        name: 'Playlist Demo Inicial',
        description: 'Programação de demonstração',
        isLoop: true
      },
      include: { items: true }
    });
  }

  // Append new item to playlist
  const nextOrder = (playlist.items || []).length;
  await prisma.playlistItem.create({
    data: {
      playlistId: playlist.id,
      mediaId,
      orderIndex: nextOrder,
      durationSeconds
    }
  });

  // Fetch updated full playlist
  const updatedPlaylist = await prisma.playlist.findUnique({
    where: { id: playlist.id },
    include: { items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } } }
  });

  // Update screens activePlaylistId
  await prisma.screen.updateMany({
    where: { tenantId },
    data: { activePlaylistId: playlist.id }
  });

  // Broadcast real-time WebSocket update to screens
  broadcastToAllScreens(tenantId, {
    type: 'CONTENT_UPDATED',
    activePlaylist: updatedPlaylist
  });
}

// List media items
mediaRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const type = req.query.type as string;

  const medias = await prisma.media.findMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(type ? { type } : {})
    },
    orderBy: { createdAt: 'desc' }
  });

  const serialized = medias.map((m) => ({
    ...m,
    sizeBytes: m.sizeBytes ? Number(m.sizeBytes) : 0
  }));

  return res.json(serialized);
});

// Upload media file
mediaRoutes.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.body.tenantId as string | undefined);
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    return res.status(400).json({ error: 'Cliente/Tenant não encontrado.' });
  }
  const storage = await prisma.media.aggregate({ where: { tenantId }, _sum: { sizeBytes: true } });
  const usedBytes = Number(storage._sum.sizeBytes || 0);
  if (usedBytes + req.file.size > tenant.maxStorageMb * 1024 * 1024) {
    return res.status(413).json({ error: 'Limite de armazenamento contratado atingido.' });
  }

  const mime = req.file.mimetype;
  let type = 'IMAGE';
  if (mime.startsWith('video/')) type = 'VIDEO';
  else if (mime.startsWith('audio/')) type = 'AUDIO';
  else if (mime.includes('pdf')) type = 'PDF';

  const { url, storagePath } = await saveFile(req.file);
  const detectedDuration = (type === 'VIDEO' || type === 'AUDIO')
    ? detectMediaDuration(req.file.buffer, mime)
    : null;
  const requestedDuration = parseInt(req.body.durationSeconds, 10);
  const duration = detectedDuration || (Number.isFinite(requestedDuration) && requestedDuration > 0 ? requestedDuration : 10);

  const media = await prisma.media.create({
    data: {
      tenantId,
      createdById: req.auth!.userId,
      name: req.body.name || req.file.originalname,
      type,
      url,
      storagePath,
      thumbnailUrl: type === 'IMAGE' ? url : undefined,
      durationSeconds: duration,
      sizeBytes: BigInt(req.file.size),
      tags: req.body.tags || 'Geral'
    }
  });

  return res.json({ ...media, sizeBytes: Number(media.sizeBytes || 0) });
});

// Create dynamic widget media (RSS, Clock, Custom Web URL)
mediaRoutes.post('/widget', async (req: Request, res: Response): Promise<any> => {
  const { tenantId: requestedTenantId, name, type, url, durationSeconds, tags } = req.body;
  const tenantId = tenantScope(req, requestedTenantId);
  if (!name || !url) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const duration = durationSeconds ? parseInt(durationSeconds, 10) : 15;

  const media = await prisma.media.create({
    data: {
      tenantId,
      createdById: req.auth!.userId,
      name,
      type: type || 'WEB_PAGE',
      url,
      durationSeconds: duration,
      tags: tags || 'Widget'
    }
  });

  return res.json({ ...media, sizeBytes: Number(media.sizeBytes || 0) });
});

mediaRoutes.put('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.body.tenantId);
  const existing = await prisma.media.findFirst({ where: { id, tenantId } });
  if (!existing) return res.status(404).json({ error: 'Mídia não encontrada.' });

  const durationSeconds = Math.max(1, Math.round(Number(req.body.durationSeconds) || existing.durationSeconds));
  const media = await prisma.$transaction(async (tx) => {
    const updated = await tx.media.update({
      where: { id },
      data: {
        name: req.body.name ?? existing.name,
        durationSeconds,
        tags: req.body.tags ?? existing.tags
      }
    });
    await tx.playlistItem.updateMany({ where: { mediaId: id }, data: { durationSeconds } });
    return updated;
  });
  return res.json({ ...media, sizeBytes: Number(media.sizeBytes || 0) });
});

// Delete media
mediaRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const media = await prisma.media.findFirst({ where: { id, tenantId } });
  if (!media) return res.status(404).json({ error: 'Mídia não encontrada.' });
  await prisma.media.delete({ where: { id } });
  return res.json({ success: true });
});
