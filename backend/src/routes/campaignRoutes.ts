import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireMutationRoles, tenantScope } from '../middleware/auth.js';
import { campaignDto } from '../lib/dto.js';

export const campaignRoutes = Router();
campaignRoutes.use(requireMutationRoles('SUPER_ADMIN', 'ADMIN_CLIENT', 'DESIGNER'));

campaignRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const campaigns = await prisma.campaign.findMany({
    where: { tenantId, createdById: req.auth!.userId },
    include: { playlist: true },
    orderBy: { createdAt: 'desc' }
  });
  return res.json(campaigns.map(campaignDto));
});

campaignRoutes.post('/', async (req: Request, res: Response): Promise<any> => {
  const { tenantId: requestedTenantId, name, advertiserName, playlistId, startDate, endDate, daysOfWeek, startTime, endTime, priority, maxImpressions } = req.body;
  const tenantId = tenantScope(req, requestedTenantId);

  if (!tenantId || !name || !startDate || !endDate) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  if (playlistId) {
    const playlist = await prisma.playlist.findFirst({ where: { id: playlistId, tenantId, createdById: req.auth!.userId } });
    if (!playlist) return res.status(400).json({ error: 'Playlist inválida para este cliente.' });
  }

  const campaign = await prisma.campaign.create({
    data: {
      tenantId,
      createdById: req.auth!.userId,
      name,
      advertiserName,
      playlistId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      daysOfWeek: daysOfWeek || '1,2,3,4,5,6,0',
      startTime: startTime || '00:00',
      endTime: endTime || '23:59',
      priority: priority ? parseInt(priority, 10) : 1,
      maxImpressions: maxImpressions ? parseInt(maxImpressions, 10) : undefined,
      status: 'ACTIVE'
    }
  });

  return res.json(campaignDto(campaign));
});

campaignRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const existing = await prisma.campaign.findFirst({ where: { id, tenantId, createdById: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: 'Campanha não encontrada.' });
  await prisma.campaign.delete({ where: { id } });
  return res.json({ success: true });
});
