import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendCommandToScreen, cleanCode } from '../lib/websocket.js';
import { tenantScope } from '../middleware/auth.js';

export const screenRoutes = Router();

function generatePairingCode(): string {
  const num1 = Math.floor(100 + Math.random() * 900);
  const num2 = Math.floor(100 + Math.random() * 900);
  return `${num1}-${num2}`;
}

// List all screens
screenRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const screens = await prisma.screen.findMany({
    where: { tenantId, createdById: req.auth!.userId },
    include: {
      activePlaylist: true,
      activeLayout: true
    },
    orderBy: { createdAt: 'desc' }
  });
  return res.json(screens);
});

// Generate new pending screen with pairing code
screenRoutes.post('/generate-code', async (_req: Request, res: Response): Promise<any> => {
  const code = generatePairingCode();
  return res.json({ pairingCode: code });
});

// Pair device by code (admin confirms pairing code shown on TV)
screenRoutes.post('/pair', async (req: Request, res: Response): Promise<any> => {
  const { tenantId, pairingCode, name, locationName, groupName, orientation } = req.body;
  const scopedTenantId = tenantScope(req, tenantId);

  if (!pairingCode) {
    return res.status(400).json({ error: 'Tenant ID e Código de Pareamento são obrigatórios.' });
  }

  const normalizedPairingCode = cleanCode(pairingCode);
  const pairingSessions = await prisma.pairingSession.findMany({ where: { claimedAt: null, expiresAt: { gt: new Date() } } });
  const pairingSession = pairingSessions.find((session) => cleanCode(session.code) === normalizedPairingCode);
  if (!pairingSession) return res.status(410).json({ error: 'Código de pareamento inválido, expirado ou já utilizado.' });

  // Check for default playlist to attach
  const defaultPlaylist = await prisma.playlist.findFirst({
    where: { tenantId: scopedTenantId, createdById: req.auth!.userId }
  });

  const [tenant, screenCount] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: scopedTenantId } }),
    prisma.screen.count({ where: { tenantId: scopedTenantId } })
  ]);
  if (!tenant || tenant.status !== 'ACTIVE') return res.status(403).json({ error: 'Cliente inativo ou suspenso.' });

  let screen = await prisma.screen.findUnique({ where: { pairingCode: normalizedPairingCode } });
  if (!tenant.unlimitedScreens && !screen && screenCount >= tenant.maxScreens) {
    return res.status(403).json({
      error: `Limite contratado atingido (${tenant.maxScreens} dispositivo${tenant.maxScreens === 1 ? '' : 's'}). Adquira outra licença para conectar uma nova tela.`
    });
  }

  if (screen && screen.tenantId !== scopedTenantId) {
    return res.status(409).json({ error: 'Este código já pertence a outro cliente.' });
  }

  if (screen) {
    screen = await prisma.screen.update({
      where: { id: screen.id },
      data: {
        tenantId: scopedTenantId,
        name: name || screen.name,
        locationName: locationName || screen.locationName,
        groupName: groupName || screen.groupName,
        orientation: orientation || screen.orientation,
        paired: true,
        status: 'OFFLINE',
        activePlaylistId: screen.activePlaylistId || defaultPlaylist?.id || null
      }
    });
  } else {
    screen = await prisma.screen.create({
      data: {
        tenantId: scopedTenantId,
        createdById: req.auth!.userId,
        name: name || 'Nova Tela Mídia Indoor',
        pairingCode: normalizedPairingCode,
        paired: true,
        locationName: locationName || 'Loja Principal',
        groupName: groupName || 'Geral',
        orientation: orientation || 'HORIZONTAL',
        status: 'OFFLINE',
        activePlaylistId: defaultPlaylist?.id || null
      }
    });
  }

  await prisma.pairingSession.update({
    where: { id: pairingSession.id },
    data: { screenId: screen.id, claimedAt: new Date() }
  });

  return res.json(screen);
});

// Update screen details
screenRoutes.put('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const scopedTenantId = tenantScope(req, req.body.tenantId);
  const existing = await prisma.screen.findFirst({ where: { id, tenantId: scopedTenantId, createdById: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: 'Tela não encontrada.' });
  const { name, locationName, groupName, orientation, volume, activePlaylistId, activeLayoutId } = req.body;

  if (activePlaylistId) {
    const playlist = await prisma.playlist.findFirst({ where: { id: activePlaylistId, tenantId: scopedTenantId, createdById: req.auth!.userId } });
    if (!playlist) return res.status(400).json({ error: 'Playlist inválida para este cliente.' });
  }
  if (activeLayoutId) {
    const layout = await prisma.layout.findFirst({ where: { id: activeLayoutId, tenantId: scopedTenantId, createdById: req.auth!.userId } });
    if (!layout) return res.status(400).json({ error: 'Layout inválido para este cliente.' });
  }

  const screen = await prisma.screen.update({
    where: { id },
    data: {
      name,
      locationName,
      groupName,
      orientation,
      volume: volume !== undefined ? parseInt(volume, 10) : undefined,
      activePlaylistId,
      activeLayoutId
    },
    include: {
      activePlaylist: { include: { items: { include: { media: true, layout: true } } } },
      activeLayout: true
    }
  });

  // Push immediate websocket update to the physical screen
  sendCommandToScreen(id, {
    type: 'CONTENT_UPDATED',
    volume: screen.volume,
    orientation: screen.orientation,
    activePlaylist: screen.activePlaylist,
    activeLayout: screen.activeLayout
  });

  return res.json(screen);
});

// Remote commands route (Screenshot, reboot, change volume, force sync)
screenRoutes.post('/:id/remote-command', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const scopedTenantId = tenantScope(req, req.body.tenantId);
  const existing = await prisma.screen.findFirst({ where: { id, tenantId: scopedTenantId, createdById: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: 'Tela não encontrada.' });
  const { action, payload } = req.body;

  let command: any = { type: action, payload };
  if (action === 'SYNC') {
    const refreshed = await prisma.screen.findUnique({
      where: { id },
      include: {
        activePlaylist: {
          include: { items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } } }
        },
        activeLayout: true
      }
    });
    command = {
      type: 'CONTENT_UPDATED',
      activePlaylist: refreshed?.activePlaylist,
      activeLayout: refreshed?.activeLayout,
      volume: refreshed?.volume,
      orientation: refreshed?.orientation,
      forceReload: true
    };
  }
  const sent = sendCommandToScreen(id, command);

  if (action === 'SET_VOLUME' && payload?.volume !== undefined) {
    await prisma.screen.update({
      where: { id },
      data: { volume: payload.volume }
    });
  }

  return res.json({
    success: sent,
    message: sent ? `Comando ${action} enviado em tempo real para a tela.` : `Tela offline ou inacessível no momento.`
  });
});

// Delete screen
screenRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const scopedTenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const existing = await prisma.screen.findFirst({ where: { id, tenantId: scopedTenantId, createdById: req.auth!.userId } });
  if (!existing) return res.status(404).json({ error: 'Tela não encontrada.' });
  await prisma.screen.delete({ where: { id } });
  return res.json({ success: true });
});
