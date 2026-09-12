import { validateCampaign } from '../lib/campaignValidation.js';
import { HttpError } from '../lib/validation.js';
import { Router } from '../lib/router.js';
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireMutationRoles, tenantScope } from '../middleware/auth.js';
import { campaignDto } from '../lib/dto.js';
import { bumpOwnerManifestVersions } from '../lib/manifest.js';
import { sendManifestToScreen } from '../lib/websocket.js';

export const campaignRoutes = Router();
campaignRoutes.use(requireMutationRoles('SUPER_ADMIN', 'ADMIN_CLIENT', 'DESIGNER'));

campaignRoutes.get('/', async (req, res) => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  return res.json((await prisma.campaign.findMany({ where: { tenantId }, include: { playlist: true }, orderBy: { createdAt: 'desc' } })).map(campaignDto));
});
async function notify(tenantId: string) {
  const screens = await prisma.screen.findMany({ where: { tenantId, archivedAt: null }, select: { id: true } });
  for (const screen of screens) await sendManifestToScreen(screen.id, true).catch(() => console.error('Campaign notification pending'));
}
campaignRoutes.post('/', async (req, res) => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const data = validateCampaign(req.body);
  const campaign = await prisma.$transaction(async tx => {
    if (data.playlistId && !await tx.playlist.findFirst({ where: { id: data.playlistId, tenantId } })) throw new HttpError(400, 'Playlist invalida.');
    const result = await tx.campaign.create({ data: { ...data, tenantId, createdById: req.auth!.userId } });
    await tx.screen.updateMany({ where: { tenantId, archivedAt: null }, data: { manifestVersion: { increment: 1 } } });
    return result;
  });
  await notify(tenantId); return res.status(201).json(campaignDto(campaign));
});
campaignRoutes.put('/:id', async (req, res) => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const campaign = await prisma.$transaction(async tx => {
    const existing = await tx.campaign.findFirst({ where: { id: req.params.id, tenantId } });
    if (!existing) throw new HttpError(404, 'Campanha nao encontrada.');
    const data = validateCampaign({ ...existing, ...req.body });
    if (data.playlistId && !await tx.playlist.findFirst({ where: { id: data.playlistId, tenantId } })) throw new HttpError(400, 'Playlist invalida.');
    if (data.maxImpressions && existing.currentImpressions >= data.maxImpressions) data.status = 'EXPIRED';
    const result = await tx.campaign.update({ where: { id: existing.id }, data, include: { playlist: true } });
    await tx.screen.updateMany({ where: { tenantId, archivedAt: null }, data: { manifestVersion: { increment: 1 } } });
    return result;
  });
  await notify(tenantId); return res.json(campaignDto(campaign));
});
campaignRoutes.delete('/:id', async (req, res) => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  await prisma.$transaction(async tx => {
    const result = await tx.campaign.deleteMany({ where: { id: req.params.id, tenantId } });
    if (!result.count) throw new HttpError(404, 'Campanha nao encontrada.');
    await tx.screen.updateMany({ where: { tenantId, archivedAt: null }, data: { manifestVersion: { increment: 1 } } });
  });
  await notify(tenantId); return res.json({ success: true });
});
