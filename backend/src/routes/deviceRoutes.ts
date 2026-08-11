import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authenticateDevice } from '../middleware/deviceAuth.js';
import { buildScreenManifest } from '../lib/manifest.js';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { broadcastToAdmins } from '../lib/websocket.js';
import { screenshotRateLimiter } from '../middleware/security.js';
import { saveScreenshot } from '../lib/storage.js';

export const deviceRoutes = Router();
const screenshotUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

deviceRoutes.get('/manifest', authenticateDevice, async (req: Request, res: Response) => {
  const manifest = await buildScreenManifest(req.deviceAuth!.screenId);
  if (!manifest) return res.status(404).json({ error: 'Manifesto da tela não encontrado.' });
  const etag = `"manifest-${manifest.version}-${manifest.checksum}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, no-cache');
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  return res.json(manifest);
});

deviceRoutes.post('/screenshots/:commandId', screenshotRateLimiter, authenticateDevice, receiveScreenshot, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Envie o screenshot no campo file.' });
  const detected = await fileTypeFromBuffer(req.file.buffer);
  if (!detected || !['image/jpeg', 'image/png'].includes(detected.mime)) {
    return res.status(415).json({ error: 'Screenshot deve ser JPEG ou PNG válido.' });
  }
  const command = await prisma.remoteCommand.findFirst({
    where: { commandId: req.params.commandId, screenId: req.deviceAuth!.screenId, tenantId: req.deviceAuth!.tenantId, action: 'TAKE_SCREENSHOT' }
  });
  if (!command) return res.status(404).json({ error: 'Comando de screenshot não encontrado para este dispositivo.' });
  if (command.expiresAt <= new Date() && ['PENDING', 'SENT'].includes(command.status)) {
    await prisma.remoteCommand.update({
      where: { commandId: command.commandId },
      data: { status: 'EXPIRED', success: false, message: 'Comando expirado antes do screenshot.', completedAt: new Date() }
    });
    return res.status(409).json({ error: 'Este comando expirou.', status: 'EXPIRED' });
  }
  if (command.status === 'SUCCEEDED') {
    const screen = await prisma.screen.findUnique({ where: { id: req.deviceAuth!.screenId }, select: { lastScreenshotUrl: true } });
    return res.json({
      commandId: command.commandId,
      status: command.status,
      capturedAt: command.completedAt,
      ...screenshotMetadata(screen?.lastScreenshotUrl),
      duplicate: true
    });
  }
  if (['FAILED', 'EXPIRED'].includes(command.status)) {
    return res.status(409).json({ error: 'Este comando já foi finalizado.', status: command.status });
  }

  const capturedAt = new Date();
  const previousScreenshotUrl = (await prisma.screen.findUnique({ where: { id: req.deviceAuth!.screenId }, select: { lastScreenshotUrl: true } }))?.lastScreenshotUrl;
  const stored = await saveScreenshot(req.file.buffer, detected.mime as 'image/jpeg' | 'image/png', req.deviceAuth!.tenantId, req.deviceAuth!.screenId);
  await prisma.$transaction([
    prisma.screen.update({ where: { id: req.deviceAuth!.screenId }, data: { lastScreenshotUrl: stored.url } }),
    prisma.remoteCommand.update({
      where: { commandId: command.commandId },
      data: { status: 'SUCCEEDED', success: true, message: 'Screenshot recebido.', completedAt: capturedAt }
    })
  ]);
  broadcastToAdmins({
    type: 'SCREENSHOT_UPDATED',
    screenId: req.deviceAuth!.screenId,
    commandId: command.commandId,
    imageUrl: stored.url,
    capturedAt: capturedAt.toISOString()
  }, req.deviceAuth!.tenantId, command.createdById);
  // A URL anterior é mantida nesta versão por compatibilidade legada; a limpeza
  // completa será feita por rotina de retenção de screenshots no R2.
  void previousScreenshotUrl;
  return res.status(201).json({ commandId: command.commandId, status: 'SUCCEEDED', capturedAt, mimeType: detected.mime, sizeBytes: req.file.size, duplicate: false });
});

function screenshotMetadata(dataUrl?: string | null): { mimeType?: string; sizeBytes?: number } {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!match) return {};
  return { mimeType: match[1], sizeBytes: Buffer.from(match[2], 'base64').length };
}

function receiveScreenshot(req: Request, res: Response, next: (error?: any) => void) {
  screenshotUpload.single('file')(req, res, (error: any) => {
    if (error instanceof multer.MulterError) {
      res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Screenshot maior que 2 MB.' : 'Upload de screenshot inválido.' });
      return;
    }
    next(error);
  });
}

deviceRoutes.post('/pairing', async (_req: Request, res: Response) => {
  const secret = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  let code = '';
  do code = `${crypto.randomInt(100, 1000)}-${crypto.randomInt(100, 1000)}`;
  while (await prisma.pairingSession.findUnique({ where: { code } }));
  const session = await prisma.pairingSession.create({ data: { code, secretHash: await bcrypt.hash(secret, 10), expiresAt } });
  res.status(201).json({ pairingId: session.id, pairingCode: code, pairingSecret: secret, expiresAt });
});

deviceRoutes.post('/pairing/:id/status', async (req: Request, res: Response) => {
  const secret = req.headers.authorization?.startsWith('Pairing ') ? req.headers.authorization.slice(8) : '';
  const session = await prisma.pairingSession.findUnique({ where: { id: req.params.id }, include: { screen: true } });
  if (!session || !secret || !await bcrypt.compare(secret, session.secretHash)) return res.status(401).json({ error: 'Sessão inválida.' });
  if (!session.screen || !session.claimedAt) {
    if (session.expiresAt <= new Date()) return res.status(410).json({ status: 'EXPIRED' });
    return res.json({ status: 'PENDING', expiresAt: session.expiresAt });
  }
  const deviceToken = jwt.sign({ type: 'DEVICE', screenId: session.screen.id, tenantId: session.screen.tenantId, version: session.screen.deviceTokenVersion }, process.env.JWT_SECRET!, { expiresIn: '365d', algorithm: 'HS256' });
  return res.json({ status: 'PAIRED', deviceToken, screenId: session.screen.id, screenName: session.screen.name });
});
