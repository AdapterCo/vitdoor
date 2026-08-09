import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { saveFile } from '../lib/storage.js';
import { tenantScope } from '../middleware/auth.js';
import { detectMediaDuration } from '../lib/mediaMetadata.js';
import { randomUUID } from 'crypto';

export const mediaRoutes = Router();
const upload = multer({ storage: multer.memoryStorage() });

// List media items
mediaRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const type = req.query.type as string;

  const medias = await prisma.media.findMany({
    where: {
      tenantId,
      createdById: req.auth!.userId,
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

mediaRoutes.get('/folders', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  return res.json(await prisma.mediaFolder.findMany({
    where: { tenantId, createdById: req.auth!.userId },
    include: { _count: { select: { medias: true } } },
    orderBy: { name: 'asc' }
  }));
});

mediaRoutes.post('/folders', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe o nome da pasta.' });
  try {
    return res.status(201).json(await prisma.mediaFolder.create({ data: { tenantId, createdById: req.auth!.userId, name } }));
  } catch {
    return res.status(409).json({ error: 'Você já possui uma pasta com este nome.' });
  }
});

mediaRoutes.put('/folders/:id', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const folder = await prisma.mediaFolder.findFirst({ where: { id: req.params.id, tenantId, createdById: req.auth!.userId } });
  if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe o nome da pasta.' });
  return res.json(await prisma.mediaFolder.update({ where: { id: folder.id }, data: { name } }));
});

mediaRoutes.delete('/folders/:id', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const folder = await prisma.mediaFolder.findFirst({ where: { id: req.params.id, tenantId, createdById: req.auth!.userId } });
  if (!folder) return res.status(404).json({ error: 'Pasta não encontrada.' });
  await prisma.mediaFolder.delete({ where: { id: folder.id } });
  return res.json({ success: true });
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
  const folderId = await validateFolder(tenantId, req.auth!.userId, req.body.folderId);
  if (req.body.folderId && !folderId) return res.status(400).json({ error: 'Pasta inválida.' });
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

  const mediaId = randomUUID();
  const { url, storagePath } = await saveFile(req.file, tenantId, mediaId);
  const detectedDuration = (type === 'VIDEO' || type === 'AUDIO')
    ? detectMediaDuration(req.file.buffer, mime)
    : null;
  const requestedDuration = parseInt(req.body.durationSeconds, 10);
  const duration = detectedDuration || (Number.isFinite(requestedDuration) && requestedDuration > 0 ? requestedDuration : 10);

  const media = await prisma.media.create({
    data: {
      id: mediaId,
      tenantId,
      createdById: req.auth!.userId,
      folderId,
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
  const { tenantId: requestedTenantId, name, type, url, durationSeconds, tags, folderId: requestedFolderId } = req.body;
  const tenantId = tenantScope(req, requestedTenantId);
  if (!name || !url) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  const duration = durationSeconds ? parseInt(durationSeconds, 10) : 15;
  const folderId = await validateFolder(tenantId, req.auth!.userId, requestedFolderId);
  if (requestedFolderId && !folderId) return res.status(400).json({ error: 'Pasta inválida.' });

  const media = await prisma.media.create({
    data: {
      tenantId,
      createdById: req.auth!.userId,
      folderId,
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
  const existing = await prisma.media.findFirst({ where: { id, tenantId, createdById: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: 'Mídia não encontrada.' });

  const durationSeconds = Math.max(1, Math.round(Number(req.body.durationSeconds) || existing.durationSeconds));
  const folderId = req.body.folderId === undefined ? existing.folderId : await validateFolder(tenantId, req.auth!.userId, req.body.folderId);
  if (req.body.folderId && !folderId) return res.status(400).json({ error: 'Pasta inválida.' });
  const media = await prisma.$transaction(async (tx) => {
    const updated = await tx.media.update({
      where: { id },
      data: {
        name: req.body.name ?? existing.name,
        durationSeconds,
        tags: req.body.tags ?? existing.tags,
        folderId
      }
    });
    await tx.playlistItem.updateMany({ where: { mediaId: id }, data: { durationSeconds } });
    return updated;
  });
  return res.json({ ...media, sizeBytes: Number(media.sizeBytes || 0) });
});

async function validateFolder(tenantId: string, userId: string, value: unknown): Promise<string | null> {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  const folder = await prisma.mediaFolder.findFirst({ where: { id: value, tenantId, createdById: userId }, select: { id: true } });
  return folder?.id || null;
}

// Delete media
mediaRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const media = await prisma.media.findFirst({ where: { id, tenantId, createdById: req.auth!.userId } });
  if (!media) return res.status(404).json({ error: 'Mídia não encontrada.' });
  await prisma.media.delete({ where: { id } });
  return res.json({ success: true });
});
