import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authenticateDevice } from '../middleware/deviceAuth.js';
import { buildScreenManifest } from '../lib/manifest.js';

export const deviceRoutes = Router();

deviceRoutes.get('/manifest', authenticateDevice, async (req: Request, res: Response) => {
  const manifest = await buildScreenManifest(req.deviceAuth!.screenId);
  if (!manifest) return res.status(404).json({ error: 'Manifesto da tela não encontrado.' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json(manifest);
});

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
