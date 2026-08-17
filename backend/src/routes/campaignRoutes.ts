import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireMutationRoles, tenantScope } from '../middleware/auth.js';
import { campaignDto } from '../lib/dto.js';
import { bumpOwnerManifestVersions } from '../lib/manifest.js';
import { sendManifestToScreen } from '../lib/websocket.js';

export const campaignRoutes = Router();
campaignRoutes.use(requireMutationRoles('SUPER_ADMIN', 'ADMIN_CLIENT', 'DESIGNER'));

function parseStartDate(val: string): Date {
  if (!val) return new Date();
  return new Date(val.includes('T') ? val : `${val}T00:00:00.000Z`);
}

function parseEndDate(val: string): Date {
  if (!val) return new Date();
  return new Date(val.includes('T') ? val : `${val}T23:59:59.999Z`);
}

campaignRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const campaigns = await prisma.campaign.findMany({
    where: { tenantId },
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
    const playlist = await prisma.playlist.findFirst({ where: { id: playlistId, tenantId } });
    if (!playlist) return res.status(400).json({ error: 'Playlist inválida para este cliente.' });
  }

  const campaign = await prisma.campaign.create({
    data: {
      tenantId,
      createdById: req.auth!.userId,
      name,
      advertiserName,
      playlistId,
      startDate: parseStartDate(startDate),
      endDate: parseEndDate(endDate),
      daysOfWeek: daysOfWeek || '1,2,3,4,5,6,0',
      startTime: startTime || '00:00',
      endTime: endTime || '23:59',
      priority: priority ? parseInt(priority, 10) : 1,
      maxImpressions: maxImpressions ? parseInt(maxImpressions, 10) : undefined,
      status: 'ACTIVE'
    }
  });

  const affectedIds = await bumpOwnerManifestVersions(tenantId, req.auth!.userId);
  for (const screenId of affectedIds) await sendManifestToScreen(screenId, true);

  return res.json(campaignDto(campaign));
});

campaignRoutes.put('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { tenantId: requestedTenantId, name, advertiserName, playlistId, startDate, endDate, daysOfWeek, startTime, endTime, priority, maxImpressions, status } = req.body;
  const tenantId = tenantScope(req, requestedTenantId);

  const existing = await prisma.campaign.findFirst({ where: { id, tenantId } });
  if (!existing) return res.status(404).json({ error: 'Campanha não encontrada.' });

  if (playlistId) {
    const playlist = await prisma.playlist.findFirst({ where: { id: playlistId, tenantId } });
    if (!playlist) return res.status(400).json({ error: 'Playlist inválida para este cliente.' });
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      name: name || existing.name,
      advertiserName: advertiserName !== undefined ? advertiserName : existing.advertiserName,
      playlistId: playlistId !== undefined ? (playlistId || null) : existing.playlistId,
      startDate: startDate ? parseStartDate(startDate) : existing.startDate,
      endDate: endDate ? parseEndDate(endDate) : existing.endDate,
      daysOfWeek: daysOfWeek || existing.daysOfWeek,
      startTime: startTime || existing.startTime,
      endTime: endTime || existing.endTime,
      priority: priority ? parseInt(priority, 10) : existing.priority,
      maxImpressions: maxImpressions !== undefined ? (maxImpressions ? parseInt(maxImpressions, 10) : null) : existing.maxImpressions,
      status: status || existing.status
    },
    include: { playlist: true }
  });

  const affectedIds = await bumpOwnerManifestVersions(tenantId, req.auth!.userId);
  for (const screenId of affectedIds) await sendManifestToScreen(screenId, true);

  return res.json(campaignDto(campaign));
});

campaignRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const existing = await prisma.campaign.findFirst({ where: { id, tenantId } });
  if (!existing) return res.status(404).json({ error: 'Campanha não encontrada.' });
  await prisma.campaign.delete({ where: { id } });

  const affectedIds = await bumpOwnerManifestVersions(tenantId, req.auth!.userId);
  for (const screenId of affectedIds) await sendManifestToScreen(screenId, true);

  return res.json({ success: true });
});
