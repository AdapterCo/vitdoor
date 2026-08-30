import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendCommandToScreen, sendManifestToScreen, cleanCode, formatCommandForDevice } from '../lib/websocket.js';
import { requireMutationRoles, requireSuperAdmin, tenantScope } from '../middleware/auth.js';
import { layoutDto, playlistDto, screenDto } from '../lib/dto.js';
import { randomUUID } from 'crypto';

export const screenRoutes = Router();
screenRoutes.use(requireMutationRoles('SUPER_ADMIN', 'ADMIN_CLIENT', 'OPERATOR'));

function generatePairingCode(): string {
  const num1 = Math.floor(100 + Math.random() * 900);
  const num2 = Math.floor(100 + Math.random() * 900);
  return `${num1}-${num2}`;
}

// List all screens
screenRoutes.get('/', async (req: Request, res: Response): Promise<any> => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const screens = await prisma.screen.findMany({
    where: { tenantId },
    include: {
      activePlaylist: true,
      activeLayout: true
    },
    orderBy: { createdAt: 'desc' }
  });
  return res.json(screens.map(screenDto));
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
    where: { tenantId: scopedTenantId }
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

  return res.json(screenDto(screen));
});

// Update screen details
screenRoutes.put('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const scopedTenantId = tenantScope(req, req.body.tenantId);
  const existing = await prisma.screen.findFirst({ where: { id, tenantId: scopedTenantId } });
  if (!existing) return res.status(404).json({ error: 'Tela não encontrada.' });
  const { name, locationName, groupName, orientation, volume, activePlaylistId, activeLayoutId } = req.body;
  const playlistProvided = Object.prototype.hasOwnProperty.call(req.body, 'activePlaylistId');
  const layoutProvided = Object.prototype.hasOwnProperty.call(req.body, 'activeLayoutId');

  if (activePlaylistId) {
    const playlist = await prisma.playlist.findFirst({ where: { id: activePlaylistId, tenantId: scopedTenantId } });
    if (!playlist) return res.status(400).json({ error: 'Playlist inválida para este cliente.' });
  }
  if (activeLayoutId) {
    const layout = await prisma.layout.findFirst({ where: { id: activeLayoutId, tenantId: scopedTenantId } });
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
      activePlaylistId: playlistProvided ? (activePlaylistId || null) : undefined,
      activeLayoutId: layoutProvided ? (activeLayoutId || null) : undefined,
      manifestVersion: { increment: 1 }
    },
    include: {
      activePlaylist: { include: { items: { include: { media: true, layout: true } } } },
      activeLayout: true
    }
  });

  // Push immediate websocket update to the physical screen
  await sendManifestToScreen(id);

  return res.json(screenDto(screen));
});

// Remote commands route (Screenshot, reboot, change volume, force sync)
screenRoutes.post('/:id/remote-command', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const scopedTenantId = tenantScope(req, req.body.tenantId);
  const existing = await prisma.screen.findFirst({ where: { id, tenantId: scopedTenantId } });
  if (!existing) return res.status(404).json({ error: 'Tela não encontrada.' });
  const action = typeof req.body.action === 'string' ? req.body.action.trim().toUpperCase() : '';
  if (action === 'UPDATE_APP' && req.auth?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Apenas o administrador da plataforma pode atualizar o app do player.' });
  }
  const payload = normalizeCommandPayload(action, req.body.payload);
  if (!payload.valid) return res.status(400).json({ error: payload.error });
  const commandId = randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
  const command = await prisma.remoteCommand.create({
    data: {
      commandId,
      tenantId: scopedTenantId,
      screenId: id,
      createdById: req.auth!.userId,
      action,
      payloadJson: payload.value ? JSON.stringify(payload.value) : null,
      expiresAt
    }
  });

  let sent = false;
  if (action === 'SYNC') {
    await prisma.screen.update({ where: { id }, data: { manifestVersion: { increment: 1 } } });
    sent = await sendManifestToScreen(id, true, {
      commandId,
      createdAt: command.createdAt,
      expiresAt: command.expiresAt
    });
  } else {
    sent = sendCommandToScreen(id, formatCommandForDevice(action, commandId, id, command.createdAt, command.expiresAt, payload.value));
  }

  if (action === 'SET_VOLUME') {
    await prisma.screen.update({
      where: { id },
      data: { volume: payload.value!.volume, manifestVersion: { increment: 1 } }
    });
  }
  if (sent) await prisma.remoteCommand.update({ where: { commandId }, data: { status: 'SENT', sentAt: new Date() } });

  return res.status(202).json({
    commandId,
    action,
    status: sent ? 'SENT' : 'PENDING',
    delivered: sent,
    createdAt: command.createdAt,
    expiresAt: command.expiresAt,
    message: sent ? `Comando ${action} entregue ao dispositivo; aguardando confirmação.` : 'Dispositivo offline; comando persistido para entrega posterior.'
  });
});

// Atualização remota do app do player — exclusivo do administrador da plataforma.
screenRoutes.post('/fleet/update-app', requireSuperAdmin, async (req: Request, res: Response): Promise<any> => {
  const payload = normalizeCommandPayload('UPDATE_APP', req.body);
  if (!payload.valid) return res.status(400).json({ error: payload.error });

  const screenIds: string[] | null = Array.isArray(req.body.screenIds)
    ? [...new Set((req.body.screenIds as unknown[]).filter((value): value is string => typeof value === 'string' && value.length > 0))]
    : null;

  const screens = await prisma.screen.findMany({
    where: { paired: true, ...(screenIds ? { id: { in: screenIds } } : {}) },
    select: { id: true, tenantId: true }
  });
  if (!screens.length) return res.status(400).json({ error: 'Nenhuma tela pareada encontrada para atualizar.' });

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60_000);
  const commands = screens.map((screen) => ({
    commandId: randomUUID(),
    tenantId: screen.tenantId,
    screenId: screen.id,
    createdById: req.auth!.userId,
    action: 'UPDATE_APP',
    payloadJson: JSON.stringify(payload.value),
    createdAt,
    expiresAt
  }));
  await prisma.remoteCommand.createMany({ data: commands });

  const deliveredIds: string[] = [];
  for (const command of commands) {
    const sent = sendCommandToScreen(
      command.screenId,
      formatCommandForDevice('UPDATE_APP', command.commandId, command.screenId, createdAt, expiresAt, payload.value)
    );
    if (sent) deliveredIds.push(command.commandId);
  }
  if (deliveredIds.length) {
    await prisma.remoteCommand.updateMany({ where: { commandId: { in: deliveredIds } }, data: { status: 'SENT', sentAt: new Date() } });
  }

  return res.status(202).json({
    version: payload.value.version,
    total: commands.length,
    delivered: deliveredIds.length,
    pending: commands.length - deliveredIds.length
  });
});

screenRoutes.get('/:id/commands/:commandId', async (req: Request, res: Response): Promise<any> => {
  const scopedTenantId = tenantScope(req, req.query.tenantId as string | undefined);
  await prisma.remoteCommand.updateMany({
    where: {
      commandId: req.params.commandId,
      screenId: req.params.id,
      tenantId: scopedTenantId,
      status: { in: ['PENDING', 'SENT'] },
      expiresAt: { lte: new Date() }
    },
    data: { status: 'EXPIRED', success: false, message: 'Comando expirado antes da confirmação.', completedAt: new Date() }
  });
  const command = await prisma.remoteCommand.findFirst({
    where: { commandId: req.params.commandId, screenId: req.params.id, tenantId: scopedTenantId },
    select: { commandId: true, action: true, status: true, success: true, message: true, createdAt: true, expiresAt: true, sentAt: true, completedAt: true }
  });
  if (!command) return res.status(404).json({ error: 'Comando não encontrado.' });
  return res.json(command);
});

// Delete screen
screenRoutes.delete('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const scopedTenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const existing = await prisma.screen.findFirst({ where: { id, tenantId: scopedTenantId } });
  if (!existing) return res.status(404).json({ error: 'Tela não encontrada.' });
  await prisma.screen.delete({ where: { id } });
  return res.json({ success: true });
});

function normalizeCommandPayload(action: string, value: any): { valid: boolean; value?: any; error?: string } {
  if (!['SYNC', 'TAKE_SCREENSHOT', 'SET_VOLUME', 'REBOOT', 'UPDATE_APP'].includes(action)) {
    return { valid: false, error: 'Ação inválida. Use SYNC, TAKE_SCREENSHOT, SET_VOLUME, REBOOT ou UPDATE_APP.' };
  }
  if (action === 'SET_VOLUME') {
    const volume = Number(value?.volume);
    if (!Number.isInteger(volume) || volume < 0 || volume > 100) return { valid: false, error: 'Volume deve ser um inteiro entre 0 e 100.' };
    return { valid: true, value: { volume } };
  }
  if (action === 'UPDATE_APP') {
    const version = typeof value?.version === 'string' ? value.version.trim() : '';
    const checksum = typeof value?.checksum === 'string' ? value.checksum.trim().toLowerCase() : '';
    if (!/^\d+\.\d+\.\d+$/.test(version)) return { valid: false, error: 'Versão do app deve estar no formato x.y.z.' };
    if (!/^[a-f0-9]{64}$/.test(checksum)) return { valid: false, error: 'Checksum SHA-256 (64 caracteres hex) é obrigatório.' };
    let apkUrl: string;
    try {
      apkUrl = assertAllowedApkUrl(typeof value?.apkUrl === 'string' ? value.apkUrl.trim() : '');
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
    return { valid: true, value: { apkUrl, version, checksum } };
  }
  if (value !== undefined && value !== null && (typeof value !== 'object' || Object.keys(value).length > 0)) {
    return { valid: false, error: `O comando ${action} não aceita payload.` };
  }
  return { valid: true };
}

/** A URL do APK precisa ser HTTPS e estar no domínio de mídia/API oficial do VitDoor. */
function assertAllowedApkUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL do APK inválida.');
  }
  if (url.protocol !== 'https:') throw new Error('A URL do APK deve usar HTTPS.');
  const allowedHosts = [process.env.R2_PUBLIC_URL, process.env.PUBLIC_BASE_URL]
    .map((value) => {
      try {
        return value ? new URL(value).host : '';
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  if (!allowedHosts.includes(url.host)) {
    throw new Error('Host do APK não autorizado. Hospede o arquivo no domínio de mídia do VitDoor (R2).');
  }
  if (!url.pathname.toLowerCase().endsWith('.apk')) throw new Error('A URL deve apontar para um arquivo .apk.');
  return url.toString();
}
