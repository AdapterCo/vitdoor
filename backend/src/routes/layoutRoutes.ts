import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireMutationRoles, tenantScope } from '../middleware/auth.js';
import { sendManifestToScreen } from '../lib/websocket.js';
import { layoutDto } from '../lib/dto.js';
import { bumpOwnerManifestVersions, bumpScreenManifestVersions } from '../lib/manifest.js';
import { assertSafeFeedUrl, refreshFeed } from '../lib/rssService.js';

export const layoutRoutes = Router();
layoutRoutes.use(requireMutationRoles('SUPER_ADMIN', 'ADMIN_CLIENT', 'DESIGNER'));

layoutRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const layouts = await prisma.layout.findMany({
    where: { tenantId },
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
  if (orientation && orientation !== 'HORIZONTAL') return res.status(400).json({ error: 'Layouts v2 aceitam somente orientação HORIZONTAL.' });
  if (!await validateScreens(tenantId, req.auth!.userId, screenIds)) return res.status(400).json({ error: 'Uma ou mais telas selecionadas são inválidas.' });

  const safeConfig = await prepareCanvasConfig(tenantId, req.auth!.userId, canvasConfigJson);
  if (!safeConfig) return res.status(400).json({ error: 'O layout contém mídia ausente ou pertencente a outro usuário.' });
  const layout = await prisma.layout.create({
    data: {
      tenantId, createdById: req.auth!.userId, name, description, orientation: orientation || 'HORIZONTAL',
      canvasConfigJson: safeConfig, isTemplate: !!isTemplate
    }
  });
  refreshTickerFeeds(safeConfig);
  await publishLayout(tenantId, req.auth!.userId, layout, screenIds);
  return res.status(201).json(layoutDto(layout));
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
  if (orientation && orientation !== 'HORIZONTAL') return res.status(400).json({ error: 'Layouts v2 aceitam somente orientação HORIZONTAL.' });
  const screenIds = normalizeIds(req.body.screenIds);
  if (!await validateScreens(tenantId, req.auth!.userId, screenIds)) return res.status(400).json({ error: 'Uma ou mais telas selecionadas são inválidas.' });

  const safeConfig = await prepareCanvasConfig(tenantId, req.auth!.userId, canvasConfigJson);
  if (!safeConfig) return res.status(400).json({ error: 'O layout contém mídia ausente ou pertencente a outro usuário.' });
  const layout = await prisma.layout.update({
    where: { id },
    data: { name, description, orientation, canvasConfigJson: safeConfig }
  });
  refreshTickerFeeds(safeConfig);
  const removed = existing.screens.map((screen) => screen.id).filter((screenId) => !screenIds.includes(screenId));
  await prisma.screen.updateMany({ where: { tenantId, activeLayoutId: id, id: { notIn: screenIds } }, data: { activeLayoutId: null } });
  await publishLayout(tenantId, req.auth!.userId, layout, screenIds, false);
  const affectedIds = await bumpOwnerManifestVersions(tenantId);
  for (const screenId of affectedIds) await sendManifestToScreen(screenId, removed.includes(screenId));
  return res.json(layoutDto(layout));
});

layoutRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const existing = await prisma.layout.findFirst({ where: { id, tenantId }, include: { screens: { select: { id: true } } } });
  if (!existing) return res.status(404).json({ error: 'Layout não encontrado.' });
  await prisma.layout.delete({ where: { id } });
  const affectedIds = await bumpOwnerManifestVersions(tenantId, req.auth!.userId);
  for (const screenId of affectedIds) await sendManifestToScreen(screenId, true);
  return res.json({ success: true });
});

async function prepareCanvasConfig(tenantId: string, userId: string, value: any): Promise<string | null> {
  let config: any;
  try { config = typeof value === 'string' ? JSON.parse(value) : structuredClone(value); } catch { return null; }
  if (!config || config.version !== 2 || !['FULL', 'HALF', '70_30'].includes(config.preset) || !Array.isArray(config.zones)) return null;
  const expectedZones = config.preset === 'FULL'
    ? [{ id: 'main', name: 'Conteúdo principal', widthPercent: 100 }]
    : config.preset === 'HALF'
      ? [{ id: 'main', name: 'Lado esquerdo', widthPercent: 50 }, { id: 'side', name: 'Lado direito', widthPercent: 50 }]
      : [{ id: 'main', name: 'Área principal', widthPercent: 70 }, { id: 'side', name: 'Área lateral', widthPercent: 30 }];
  if (config.zones.length !== expectedZones.length || config.zones.some((zone: any, index: number) => zone?.id !== expectedZones[index].id)) return null;
  const ids = [...new Set(config.zones.flatMap((zone: any) => Array.isArray(zone.items) ? zone.items.map((item: any) => item?.mediaId) : []).filter((id: any) => typeof id === 'string'))] as string[];
  const medias = await prisma.media.findMany({ where: { tenantId, id: { in: ids } } });
  if (medias.length !== ids.length) return null;
  const byId = new Map(medias.map((media) => [media.id, media]));
  let audioZoneCount = 0;
  const zones = [];
  for (let index = 0; index < config.zones.length; index += 1) {
    const zone = config.zones[index];
    const rawItems = Array.isArray(zone.items) ? zone.items : [];
    const audioEnabled = zone.audioEnabled === true;
    if (audioEnabled) audioZoneCount += 1;
    const fit = ['CONTAIN', 'COVER', 'FILL'].includes(zone.fit) ? zone.fit : 'CONTAIN';
    const items = rawItems.map((item: any) => {
      const media = byId.get(item?.mediaId);
      return media ? { mediaId: media.id, name: media.name, type: media.type, url: media.url, durationSeconds: media.durationSeconds } : null;
    });
    if (items.some((item: any) => !item)) return null;
    zones.push({ ...expectedZones[index], fit, loop: true, audioEnabled, items });
  }
  if (audioZoneCount > 1) return null;
  const ticker = buildTicker(config.ticker);
  if (!ticker) return null;
  const clockEnabled = config.clock?.enabled === true;
  const clockPosition = ['TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT', 'FOOTER'].includes(config.clock?.position)
    ? config.clock.position
    : 'TOP_RIGHT';
  if (clockEnabled && clockPosition === 'FOOTER' && !ticker.enabled) return null;
  return JSON.stringify({
    version: 2,
    preset: config.preset,
    zones,
    ticker,
    clock: { enabled: clockEnabled, position: clockPosition }
  });
}

type TickerConfig =
  | { enabled: false }
  | { enabled: true; mode: 'STATIC'; text: string; themes: [] }
  | { enabled: true; mode: 'RSS'; text: ''; themes: { label: string; url: string }[] };

/** Normaliza e valida o rodapé. Retorna null (layout rejeitado) em config inválida. */
function buildTicker(raw: any): TickerConfig | null {
  if (raw?.enabled !== true) return { enabled: false };
  const mode = raw?.mode === 'RSS' ? 'RSS' : 'STATIC';
  if (mode === 'STATIC') {
    const text = typeof raw?.text === 'string' ? raw.text.trim().slice(0, 500) : '';
    if (!text) return null;
    return { enabled: true, mode: 'STATIC', text, themes: [] };
  }
  const rawThemes = Array.isArray(raw?.themes) ? raw.themes : [];
  if (rawThemes.length < 1 || rawThemes.length > 6) return null;
  const themes: { label: string; url: string }[] = [];
  for (const theme of rawThemes) {
    const label = typeof theme?.label === 'string' ? theme.label.trim().slice(0, 30) : '';
    if (!label) return null;
    let url: string;
    try {
      url = assertSafeFeedUrl(String(theme?.url || ''));
    } catch {
      return null;
    }
    themes.push({ label, url });
  }
  return { enabled: true, mode: 'RSS', text: '', themes };
}

/** Dispara a primeira carga dos feeds recém-configurados sem bloquear a resposta. */
function refreshTickerFeeds(configJson: string): void {
  try {
    const config = JSON.parse(configJson);
    for (const theme of config?.ticker?.themes ?? []) {
      if (typeof theme?.url === 'string') void refreshFeed(theme.url);
    }
  } catch {
    // configJson vem de prepareCanvasConfig e sempre é JSON válido
  }
}

async function validateScreens(tenantId: string, _userId: string, screenIds: string[]): Promise<boolean> {
  if (screenIds.length === 0) return true;
  return await prisma.screen.count({ where: { tenantId, id: { in: screenIds } } }) === screenIds.length;
}

function normalizeIds(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

async function publishLayout(tenantId: string, _userId: string, layout: any, screenIds: string[], notify = true) {
  if (!screenIds.length) return;
  await prisma.screen.updateMany({
    where: { tenantId, id: { in: screenIds } },
    data: { activeLayoutId: layout.id }
  });
  if (notify) {
    await bumpScreenManifestVersions(screenIds);
    for (const screenId of screenIds) {
      await sendManifestToScreen(screenId, true);
    }
  }
}
