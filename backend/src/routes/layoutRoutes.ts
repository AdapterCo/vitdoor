import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { tenantScope } from '../middleware/auth.js';
import { sendManifestToScreen } from '../lib/websocket.js';
import { layoutDto } from '../lib/dto.js';
import { bumpOwnerManifestVersions, bumpScreenManifestVersions } from '../lib/manifest.js';

export const layoutRoutes = Router();

layoutRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const layouts = await prisma.layout.findMany({
    where: { tenantId, createdById: req.auth!.userId },
    include: { screens: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' }
  });
  return res.json(layouts.map(layoutDto));
});

layoutRoutes.post('/', async (req: Request, res: Response): Promise<any> => {
  const { tenantId: requestedTenantId, name, description, orientation, canvasConfigJson, isTemplate } = req.body;
  const screenIds = normalizeIds(req.body.screenIds);
  const tenantId = tenantScope(req, requestedTenantId);
  if (!name || !canvasConfigJson) return res.status(400).json({ error: 'Nome e configuração são obrigatórios.' });
  if (!await validateScreens(tenantId, req.auth!.userId, screenIds)) return res.status(400).json({ error: 'Uma ou mais telas selecionadas são inválidas.' });

  const safeConfig = await prepareCanvasConfig(tenantId, req.auth!.userId, canvasConfigJson);
  if (!safeConfig) return res.status(400).json({ error: 'O layout contém mídia ausente ou pertencente a outro usuário.' });
  const layout = await prisma.layout.create({
    data: {
      tenantId, createdById: req.auth!.userId, name, description, orientation: orientation || 'HORIZONTAL',
      canvasConfigJson: safeConfig, isTemplate: !!isTemplate
    }
  });
  await publishLayout(tenantId, req.auth!.userId, layout, screenIds);
  return res.status(201).json(layoutDto(layout));
});

layoutRoutes.put('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.body.tenantId);
  const existing = await prisma.layout.findFirst({
    where: { id, tenantId, createdById: req.auth!.userId },
    include: { screens: { select: { id: true } } }
  });
  if (!existing) return res.status(404).json({ error: 'Layout não encontrado.' });
  const { name, description, orientation, canvasConfigJson } = req.body;
  const screenIds = normalizeIds(req.body.screenIds);
  if (!await validateScreens(tenantId, req.auth!.userId, screenIds)) return res.status(400).json({ error: 'Uma ou mais telas selecionadas são inválidas.' });

  const safeConfig = await prepareCanvasConfig(tenantId, req.auth!.userId, canvasConfigJson);
  if (!safeConfig) return res.status(400).json({ error: 'O layout contém mídia ausente ou pertencente a outro usuário.' });
  const layout = await prisma.layout.update({
    where: { id },
    data: { name, description, orientation, canvasConfigJson: safeConfig }
  });
  const removed = existing.screens.map((screen) => screen.id).filter((screenId) => !screenIds.includes(screenId));
  await prisma.screen.updateMany({ where: { tenantId, createdById: req.auth!.userId, activeLayoutId: id, id: { notIn: screenIds } }, data: { activeLayoutId: null } });
  await publishLayout(tenantId, req.auth!.userId, layout, screenIds, false);
  const affectedIds = await bumpOwnerManifestVersions(tenantId, req.auth!.userId);
  for (const screenId of affectedIds) await sendManifestToScreen(screenId, removed.includes(screenId));
  return res.json(layoutDto(layout));
});

layoutRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const existing = await prisma.layout.findFirst({ where: { id, tenantId, createdById: req.auth!.userId }, include: { screens: { select: { id: true } } } });
  if (!existing) return res.status(404).json({ error: 'Layout não encontrado.' });
  await prisma.layout.delete({ where: { id } });
  const affectedIds = await bumpOwnerManifestVersions(tenantId, req.auth!.userId);
  for (const screenId of affectedIds) await sendManifestToScreen(screenId, true);
  return res.json({ success: true });
});

async function prepareCanvasConfig(tenantId: string, userId: string, value: any): Promise<string | null> {
  let config: any;
  try { config = typeof value === 'string' ? JSON.parse(value) : structuredClone(value); } catch { return null; }
  if (!config || !Array.isArray(config.zones) || config.zones.length === 0) return null;
  const ids = [...new Set(config.zones.flatMap((zone: any) => Array.isArray(zone.items) ? zone.items.map((item: any) => item?.mediaId) : []).filter((id: any) => typeof id === 'string'))] as string[];
  const medias = await prisma.media.findMany({ where: { tenantId, createdById: userId, id: { in: ids } } });
  if (medias.length !== ids.length) return null;
  const byId = new Map(medias.map((media) => [media.id, media]));
  for (const zone of config.zones) {
    if (!Array.isArray(zone.items) || zone.items.length === 0) return null;
    zone.loop = true;
    zone.audioEnabled = zone.audioEnabled === true;
    zone.items = zone.items.map((item: any) => {
      const media = byId.get(item.mediaId);
      return media ? { mediaId: media.id, name: media.name, type: media.type, url: media.url, durationSeconds: media.durationSeconds } : null;
    });
    if (zone.items.some((item: any) => !item)) return null;
  }
  return JSON.stringify(config);
}

async function validateScreens(tenantId: string, userId: string, screenIds: string[]): Promise<boolean> {
  if (screenIds.length === 0) return true;
  return await prisma.screen.count({ where: { tenantId, createdById: userId, id: { in: screenIds } } }) === screenIds.length;
}

function normalizeIds(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

async function publishLayout(tenantId: string, userId: string, layout: any, screenIds: string[], notify = true) {
  if (!screenIds.length) return;
  await prisma.screen.updateMany({
    where: { tenantId, createdById: userId, id: { in: screenIds } },
    data: { activeLayoutId: layout.id, activePlaylistId: null }
  });
  if (notify) {
    await bumpScreenManifestVersions(screenIds);
    for (const screenId of screenIds) {
      await sendManifestToScreen(screenId, true);
    }
  }
}
