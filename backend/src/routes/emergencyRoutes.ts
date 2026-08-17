import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendCommandToScreen } from '../lib/websocket.js';
import { requireMutationRoles, tenantScope } from '../middleware/auth.js';
import { alertDto } from '../lib/dto.js';

export const emergencyRoutes = Router();
emergencyRoutes.use(requireMutationRoles('SUPER_ADMIN', 'ADMIN_CLIENT', 'OPERATOR'));

emergencyRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const alerts = await prisma.emergencyAlert.findMany({
    where: { tenantId, active: true },
    include: { targets: true },
    orderBy: { createdAt: 'desc' }
  });
  return res.json(alerts.map(alertDto));
});

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

  if (screenIds.length === 0) {
    // Clear all emergency alerts for tenant
    const activeAlerts = await prisma.emergencyAlert.findMany({
      where: { tenantId, active: true },
      include: { targets: { select: { screenId: true } } }
    });
    
    await prisma.emergencyAlert.updateMany({
      where: { tenantId, active: true },
      data: { active: false }
    });

    const allAffectedScreenIds = [...new Set(activeAlerts.flatMap(a => a.targets.map(t => t.screenId)))];
    for (const screenId of allAffectedScreenIds) {
      sendCommandToScreen(screenId, { type: 'EMERGENCY_ALERT_CLEARED' });
    }
    return res.json({ success: true, message: `Alertas encerrados em todas as telas.` });
  }

  // Clear specific screens: remove targets for these screens
  await prisma.emergencyAlertTarget.deleteMany({
    where: {
      screenId: { in: screenIds },
      alert: { tenantId, active: true }
    }
  });

  // Find active alerts that now have no targets left and deactivate them
  const activeAlerts = await prisma.emergencyAlert.findMany({
    where: { tenantId, active: true },
    include: { _count: { select: { targets: true } } }
  });

  const emptyAlertIds = activeAlerts.filter(a => a._count.targets === 0).map(a => a.id);
  if (emptyAlertIds.length > 0) {
    await prisma.emergencyAlert.updateMany({
      where: { id: { in: emptyAlertIds } },
      data: { active: false }
    });
  }

  for (const screenId of screenIds) {
    sendCommandToScreen(screenId, { type: 'EMERGENCY_ALERT_CLEARED' });
  }

  return res.json({ success: true, message: `Alerta encerrado em ${screenIds.length} tela(s).` });
});

function normalizeIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
}
