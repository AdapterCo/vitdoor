import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendCommandToScreen } from '../lib/websocket.js';
import { tenantScope } from '../middleware/auth.js';

export const emergencyRoutes = Router();

emergencyRoutes.post('/trigger', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const { title, message, alertType, durationSeconds } = req.body;
  const screenIds = normalizeIds(req.body.screenIds);
  if (!title || !message || screenIds.length === 0) return res.status(400).json({ error: 'Título, mensagem e ao menos uma tela são obrigatórios.' });
  const screens = await prisma.screen.findMany({ where: { tenantId, createdById: req.auth!.userId, id: { in: screenIds } }, select: { id: true } });
  if (screens.length !== screenIds.length) return res.status(400).json({ error: 'Uma ou mais telas são inválidas.' });
  const alert = await prisma.emergencyAlert.create({
    data: { tenantId, createdById: req.auth!.userId, title, message, alertType: alertType || 'WARNING', durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : 60, active: true,
      targets: { create: screenIds.map((screenId) => ({ screenId })) } },
    include: { targets: true }
  });
  for (const screenId of screenIds) sendCommandToScreen(screenId, { type: 'EMERGENCY_ALERT_TRIGGERED', alert });
  return res.json({ success: true, alert });
});

emergencyRoutes.post('/clear', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const screenIds = normalizeIds(req.body.screenIds);
  if (screenIds.length === 0) return res.status(400).json({ error: 'Selecione ao menos uma tela.' });
  const screens = await prisma.screen.findMany({ where: { tenantId, createdById: req.auth!.userId, id: { in: screenIds } }, select: { id: true } });
  if (screens.length !== screenIds.length) return res.status(400).json({ error: 'Uma ou mais telas são inválidas.' });
  await prisma.emergencyAlert.updateMany({ where: { tenantId, createdById: req.auth!.userId, active: true, targets: { some: { screenId: { in: screenIds } } } }, data: { active: false } });
  for (const screenId of screenIds) sendCommandToScreen(screenId, { type: 'EMERGENCY_ALERT_CLEARED' });
  return res.json({ success: true });
});

function normalizeIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
}
