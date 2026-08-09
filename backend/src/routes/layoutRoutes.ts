import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { tenantScope } from '../middleware/auth.js';
import { sendCommandToScreen } from '../lib/websocket.js';

export const layoutRoutes = Router();

layoutRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  return res.json(await prisma.layout.findMany({
    where: { tenantId },
    include: { screens: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' }
  }));
});

layoutRoutes.post('/', async (req: Request, res: Response): Promise<any> => {
  const { tenantId: requestedTenantId, name, description, orientation, canvasConfigJson, isTemplate } = req.body;
  const screenIds = normalizeIds(req.body.screenIds);
  const tenantId = tenantScope(req, requestedTenantId);
  if (!name || !canvasConfigJson) return res.status(400).json({ error: 'Nome e configuração são obrigatórios.' });
  if (!await validateScreens(tenantId, screenIds)) return res.status(400).json({ error: 'Uma ou mais telas selecionadas são inválidas.' });

  const layout = await prisma.layout.create({
    data: {
      tenantId, createdById: req.auth!.userId, name, description, orientation: orientation || 'HORIZONTAL',
      canvasConfigJson: stringifyConfig(canvasConfigJson), isTemplate: !!isTemplate
    }
  });
  await publishLayout(tenantId, layout, screenIds);
  return res.status(201).json(layout);
});

layoutRoutes.put('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.body.tenantId);
  const existing = await prisma.layout.findFirst({
    where: { id, tenantId },
    include: { screens: { select: { id: true } } }
  });
  if (!existing) return res.status(404).json({ error: 'Layout não encontrado.' });
  const { name, description, orientation, canvasConfigJson } = req.body;
  const screenIds = normalizeIds(req.body.screenIds);
  if (!await validateScreens(tenantId, screenIds)) return res.status(400).json({ error: 'Uma ou mais telas selecionadas são inválidas.' });

  const layout = await prisma.layout.update({
    where: { id },
    data: { name, description, orientation, canvasConfigJson: stringifyConfig(canvasConfigJson) }
  });
  const removed = existing.screens.map((screen) => screen.id).filter((screenId) => !screenIds.includes(screenId));
  await prisma.screen.updateMany({ where: { tenantId, activeLayoutId: id, id: { notIn: screenIds } }, data: { activeLayoutId: null } });
  for (const screenId of removed) sendCommandToScreen(screenId, { type: 'CONTENT_UPDATED', activeLayout: null, forceReload: true });
  await publishLayout(tenantId, layout, screenIds);
  return res.json(layout);
});

layoutRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const existing = await prisma.layout.findFirst({ where: { id, tenantId }, include: { screens: { select: { id: true } } } });
  if (!existing) return res.status(404).json({ error: 'Layout não encontrado.' });
  for (const screen of existing.screens) sendCommandToScreen(screen.id, { type: 'CONTENT_UPDATED', activeLayout: null, forceReload: true });
  await prisma.layout.delete({ where: { id } });
  return res.json({ success: true });
});

function stringifyConfig(value: any): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function validateScreens(tenantId: string, screenIds: string[]): Promise<boolean> {
  if (screenIds.length === 0) return true;
  return await prisma.screen.count({ where: { tenantId, id: { in: screenIds } } }) === screenIds.length;
}

function normalizeIds(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

async function publishLayout(tenantId: string, layout: any, screenIds: string[]) {
  if (!screenIds.length) return;
  await prisma.screen.updateMany({
    where: { tenantId, id: { in: screenIds } },
    data: { activeLayoutId: layout.id, activePlaylistId: null }
  });
  for (const screenId of screenIds) {
    sendCommandToScreen(screenId, { type: 'CONTENT_UPDATED', activeLayout: layout, activePlaylist: null, forceReload: true });
  }
}
