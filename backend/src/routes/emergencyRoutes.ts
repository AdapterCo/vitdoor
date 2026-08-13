import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendCommandToScreen } from '../lib/websocket.js';
import { requireMutationRoles, tenantScope } from '../middleware/auth.js';
import { alertDto } from '../lib/dto.js';

export const emergencyRoutes = Router();
emergencyRoutes.use(requireMutationRoles('SUPER_ADMIN', 'ADMIN_CLIENT', 'OPERATOR'));

emergencyRoutes.post('/trigger', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const { title, message, alertType, durationSeconds } = req.body;
  const screenIds = normalizeIds(req.body.screenIds);
  if (!title || !message || screenIds.length === 0) return res.status(400).json({ error: 'Título, mensagem e ao menos uma tela são obrigatórios.' });
  const screens = await prisma.screen.findMany({ where: { tenantId, id: { in: screenIds } }, select: { id: true } });
  if (screens.length !== screenIds.length) return res.status(400).json({ error: 'Uma ou mais telas são inválidas.' });
  const alert = await prisma.emergencyAlert.create({
    data: { tenantId, createdById: req.auth!.userId, title, message, alertType: alertType || 'WARNING', durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : 60, active: true,
      targets: { create: screenIds.map((screenId) => ({ screenId })) } },
    include: { targets: true }
  });
  for (const screenId of screenIds) sendCommandToScreen(screenId, { type: 'EMERGENCY_ALERT_TRIGGERED', alert: alertDto(alert) });
  return res.json({ success: true, alert: alertDto(alert) });
});

emergencyRoutes.post('/clear', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const screenIds = normalizeIds(req.body.screenIds);

  let targetScreenIds = screenIds;
  if (targetScreenIds.length === 0) {
    // If no specific screen IDs passed, fetch all screen IDs for this tenant
    const allScreens = await prisma.screen.findMany({ where: { tenantId }, select: { id: true } });
    targetScreenIds = allScreens.map((s) => s.id);
  }

  await prisma.emergencyAlert.updateMany({
    where: {
      tenantId,
      active: true,
      ...(screenIds.length > 0 ? { targets: { some: { screenId: { in: screenIds } } } } : {})
    },
    data: { active: false }
  });

  for (const screenId of targetScreenIds) {
    sendCommandToScreen(screenId, { type: 'EMERGENCY_ALERT_CLEARED' });
  }

  return res.json({ success: true, message: `Alertas encerrados em ${targetScreenIds.length} telas.` });
});

function normalizeIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
}
