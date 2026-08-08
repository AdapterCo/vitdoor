import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { broadcastToAllScreens } from '../lib/websocket.js';
import { tenantScope } from '../middleware/auth.js';

export const emergencyRoutes = Router();

// Trigger immediate emergency broadcast message across connected screens
emergencyRoutes.post('/trigger', async (req: Request, res: Response): Promise<any> => {
  const { tenantId: requestedTenantId, title, message, alertType, durationSeconds } = req.body;
  const tenantId = tenantScope(req, requestedTenantId);

  if (!tenantId || !title || !message) {
    return res.status(400).json({ error: 'TenantId, Título e Mensagem são obrigatórios.' });
  }

  // Deactivate previous active alerts
  await prisma.emergencyAlert.updateMany({
    where: { tenantId, active: true },
    data: { active: false }
  });

  const alert = await prisma.emergencyAlert.create({
    data: {
      tenantId,
      title,
      message,
      alertType: alertType || 'WARNING',
      durationSeconds: durationSeconds ? parseInt(durationSeconds, 10) : 60,
      active: true
    }
  });

  // Broadcast to all screens real-time
  broadcastToAllScreens(tenantId, {
    type: 'EMERGENCY_ALERT_TRIGGERED',
    alert
  });

  return res.json({ success: true, alert });
});

// Clear active emergency broadcast
emergencyRoutes.post('/clear', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.body.tenantId);

  await prisma.emergencyAlert.updateMany({
    where: { tenantId, active: true },
    data: { active: false }
  });

  broadcastToAllScreens(tenantId, {
    type: 'EMERGENCY_ALERT_CLEARED'
  });

  return res.json({ success: true, message: 'Alertas de emergência encerrados.' });
});
