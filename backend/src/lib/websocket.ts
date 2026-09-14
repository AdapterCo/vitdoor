import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { prisma } from './prisma.js';
import jwt from 'jsonwebtoken';
import { getAdminJwtSecret, readCookie, SESSION_COOKIE_NAME } from './session.js';
import { alertDto, playerLayoutDto, playlistDto } from './dto.js';
import { verifyAdminSession } from './adminSessions.js';
import { getActiveAlert } from './alerts.js';
import { buildScreenManifest } from './manifest.js';
import { persistScreenshot } from './storage.js';
import { fileTypeFromBuffer } from 'file-type';

interface ConnectedClient {
  ws: WebSocket;
  type: 'PLAYER' | 'ADMIN';
  screenId?: string;
  pairingCode?: string;
  tenantId?: string;
  ownerId?: string;
  authTimer?: ReturnType<typeof setTimeout>;
  messageWindowStartedAt: number;
  messagesInWindow: number;
  sessionToken?: string;
  isAlive: boolean;
  sessionId?: string;
  expiresAt?: Date;
  deviceVersion?: number;
  webSimulator?: boolean;
  delivering?: boolean;
}

const activeConnections = new Set<ConnectedClient>();

export function cleanCode(code?: string): string {
  return (code || '').trim().replace(/[\s-]/g, '').toUpperCase();
}

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 6 * 1024 * 1024 });

  wss.on('connection', (ws: WebSocket, request) => {
    if (activeConnections.size >= 2000 || [...activeConnections].filter(c => !c.screenId && !c.ownerId).length >= 100) { ws.close(1013, 'Capacity exceeded'); return; }
    const origin = request.headers.origin;
    const allowed = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001').split(',').map(v => v.trim());
    if (origin && !allowed.includes(origin)) { ws.close(1008, 'Origin rejected'); return; }
    const client: ConnectedClient = {
      ws,
      type: 'PLAYER',
      messageWindowStartedAt: Date.now(),
      messagesInWindow: 0,
      sessionToken: readCookie(request.headers.cookie, SESSION_COOKIE_NAME),
      isAlive: true
    };

    ws.on('pong', () => {
      client.isAlive = true;
    });

    client.authTimer = setTimeout(() => {
      if (!client.screenId && !client.ownerId && ws.readyState === WebSocket.OPEN) {
        ws.close(1008, 'Authentication timeout');
      }
    }, 10_000);
    activeConnections.add(client);

    let messages = Promise.resolve();
    ws.on('error', () => ws.close());
    ws.on('message', (data: string) => {
      messages = messages.then(async () => {
      client.isAlive = true;
      const now = Date.now();
      if (now - client.messageWindowStartedAt >= 60_000) {
        client.messageWindowStartedAt = now;
        client.messagesInWindow = 0;
      }
      client.messagesInWindow += 1;
      if (client.messagesInWindow > 600) {
        ws.close(1008, 'Message rate exceeded');
        return;
      }
      try {
        const message = JSON.parse(data.toString());
        if (!message || typeof message.type !== 'string') return;
        if (message.type.startsWith('REGISTER_') && (client.screenId || client.ownerId)) { ws.close(1008, 'Already registered'); return; }
        if (!message.type.startsWith('REGISTER_') && !client.screenId && !client.ownerId) { ws.close(1008, 'Authentication required'); return; }
        await handleMessage(client, message);
      } catch (err) {
        console.error('WebSocket message failed');
      }
      });
    });

    ws.on('close', async () => {
      activeConnections.delete(client);
      if (client.authTimer) clearTimeout(client.authTimer);
      if (client.screenId) {
        const hasAnotherConnection = [...activeConnections].some((connection) =>
          connection.type === 'PLAYER' &&
          connection.screenId === client.screenId &&
          connection.ws.readyState === WebSocket.OPEN
        );
        if (hasAnotherConnection) return;
        try {
          await prisma.screen.update({
            where: { id: client.screenId },
            data: { status: 'OFFLINE' }
          });
          broadcastToAdmins(
            { type: 'SCREEN_STATUS_CHANGED', screenId: client.screenId, status: 'OFFLINE' },
            client.tenantId
          );
        } catch (e) {
          // Screen might have been deleted
        }
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const client of activeConnections) {
      if (!client.isAlive || (client.expiresAt && client.expiresAt <= new Date())) { client.ws.terminate(); continue; }
      client.isAlive = false;
      if (client.ws.readyState === WebSocket.OPEN) client.ws.ping();
      if (client.type === 'ADMIN' && client.sessionToken) {
        void verifyAdminSession(client.sessionToken).catch(() => client.ws.close(4001, 'Session expired'));
      } else if (client.screenId) {
        void prisma.screen.findFirst({ where: { id: client.screenId, archivedAt: null, paired: true, deviceTokenVersion: client.deviceVersion, tenant: { status: 'ACTIVE' } } })
          .then(screen => { if (!screen) client.ws.close(4003, 'Device revoked'); })
          .catch(() => client.ws.close(1011, 'Unable to validate device'));
      }
    }
  }, 30_000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  return () => { clearInterval(heartbeatInterval); for (const client of activeConnections) { if (client.authTimer) clearTimeout(client.authTimer); client.ws.terminate(); } wss.close(); };

  console.log('⚡ Gateway WebSocket Server ativo em /ws');
}

async function handleMessage(client: ConnectedClient, msg: any) {
  switch (msg.type) {
    case 'REGISTER_PLAYER': {
      client.type = 'PLAYER';
      client.webSimulator = msg.clientKind === 'WEB_SIMULATOR' || msg.os === 'Android TV (Simulated)';
      client.pairingCode = msg.pairingCode;
      let screen = null;
      if (msg.deviceToken) {
        try {
          if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
          const auth = jwt.verify(msg.deviceToken, process.env.JWT_SECRET, { algorithms: ['HS256'] }) as any;
          if (auth.type === 'DEVICE') {
            client.deviceVersion = auth.version;
            client.expiresAt = new Date(auth.exp * 1000);
            screen = await prisma.screen.findFirst({ where: {
              id: auth.screenId,
              tenantId: auth.tenantId,
              paired: true, archivedAt: null,
              deviceTokenVersion: auth.version
            } });
          }
        } catch (error) {
          if (!(error instanceof jwt.JsonWebTokenError) && !(error instanceof jwt.TokenExpiredError)) { client.ws.close(1011, 'Unable to validate device'); break; }
          client.ws.send(JSON.stringify({ type: 'DEVICE_AUTH_FAILED' }));
          client.ws.close(1008, 'Invalid device credentials');
          break;
        }
        if (!screen) {
          client.ws.send(JSON.stringify({ type: 'DEVICE_AUTH_FAILED' }));
          client.ws.close(1008, 'Invalid device credentials');
          break;
        }
      }
      if (screen) {
        const tenant = await prisma.tenant.findUnique({ where: { id: screen.tenantId }, select: { status: true } });
        if (tenant?.status !== 'ACTIVE') {
          client.ws.send(JSON.stringify({ type: 'TENANT_SUSPENDED' }));
          client.ws.close(4003, 'Tenant suspended');
          break;
        }
      }

      if (screen && screen.paired) {
        client.screenId = screen.id;
        client.tenantId = screen.tenantId;
        client.ownerId = screen.createdById || undefined;
        if (client.authTimer) clearTimeout(client.authTimer);
        await prisma.screen.update({
          where: { id: screen.id },
          data: {
            status: 'ONLINE',
            lastPing: new Date(),
            ipAddress: typeof msg.ipAddress === 'string' ? msg.ipAddress.slice(0, 64) : undefined,
            os: typeof msg.os === 'string' ? msg.os.slice(0, 100) : undefined,
            appVersion: typeof msg.appVersion === 'string' ? msg.appVersion.slice(0, 40) : undefined
          }
        });

        const manifest = await buildScreenManifest(screen.id);
        const activeAlert = await getActiveAlert(screen.id, screen.tenantId);
        client.ws.send(JSON.stringify({
          type: 'PAIRING_SUCCESS',
          screenId: screen.id,
          screenName: screen.name,
          volume: screen.volume,
          orientation: screen.orientation,
          activePlaylist: manifest?.activePlaylist ?? null,
          activeLayout: manifest?.activeLayout ?? null,
          activeAlert: alertDto(activeAlert),
          manifestVersion: manifest?.version,
          manifestChecksum: manifest?.checksum,
          campaigns: manifest?.campaigns ?? []
        }));
        await deliverPendingCommands(client);

        broadcastToAdmins(
          { type: 'SCREEN_STATUS_CHANGED', screenId: screen.id, status: 'ONLINE' },
          screen.tenantId
        );
      } else {
        client.ws.close(1008, 'Device credentials required');
      }
      break;
    }

    case 'HEARTBEAT': {
      if (client.screenId) {
        const telemetry: any = { status: 'ONLINE', lastPing: new Date() };
        if (Number.isFinite(msg.ramUsagePercent)) telemetry.ramUsagePercent = clampInteger(msg.ramUsagePercent, 0, 100);
        if (Number.isFinite(msg.cpuUsagePercent)) telemetry.cpuUsagePercent = clampInteger(msg.cpuUsagePercent, 0, 100);
        if (Number.isFinite(msg.storageFreeMb)) telemetry.storageFreeMb = Math.max(0, Math.round(msg.storageFreeMb));
        if (typeof msg.currentMediaName === 'string' && msg.currentMediaName.trim()) telemetry.currentMediaName = msg.currentMediaName.trim().slice(0, 255);
        if (Object.prototype.hasOwnProperty.call(msg, 'currentMediaId')) {
          const media = typeof msg.currentMediaId === 'string' ? await prisma.media.findFirst({ where: { id: msg.currentMediaId, tenantId: client.tenantId, archivedAt: null } }) : null;
          telemetry.currentMediaId = media?.id ?? null;
          telemetry.currentMediaName = media?.name ?? null;
          telemetry.currentMediaAt = media ? new Date() : null;
        }
        await prisma.screen.update({
          where: { id: client.screenId },
          data: telemetry
        });
        broadcastToAdmins(
          {
            type: 'SCREEN_TELEMETRY_UPDATE',
            screenId: client.screenId,
            telemetry: {
              ...(telemetry.ramUsagePercent !== undefined ? { ramUsagePercent: telemetry.ramUsagePercent } : {}),
              ...(telemetry.cpuUsagePercent !== undefined ? { cpuUsagePercent: telemetry.cpuUsagePercent } : {}),
              ...(telemetry.storageFreeMb !== undefined ? { storageFreeMb: telemetry.storageFreeMb } : {}),
              ...(telemetry.currentMediaName !== undefined ? { currentMediaName: telemetry.currentMediaName } : {})
            }
          },
          client.tenantId
        );
        await deliverPendingCommands(client, false);
      }
      break;
    }

    case 'REGISTER_ADMIN': {
      try {
        const token = msg.token || client.sessionToken || '';
        if (!token) throw new Error('Token de autenticação ausente.');
        const session = await verifyAdminSession(token);
        client.type = 'ADMIN';
        client.tenantId = session.user.tenantId;
        client.ownerId = session.user.id;
        client.sessionToken = token;
        client.sessionId = session.sessionId;
        client.expiresAt = session.expiresAt;
        if (client.authTimer) clearTimeout(client.authTimer);
        client.ws.send(JSON.stringify({ type: 'ADMIN_REGISTERED', tenantId: session.user.tenantId }));
      } catch (err: any) {
        console.warn(`🔒 Conexão WebSocket Admin rejeitada: ${err?.message || 'Não autorizado'}`);
        client.ws.close(1008, 'Unauthorized');
      }
      break;
    }

    case 'SCREENSHOT_RESULT': {
      if (!client.screenId || !client.tenantId || typeof msg.commandId !== 'string' || typeof msg.imageDataUrl !== 'string') break;
      const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(msg.imageDataUrl);
      if (!match || msg.imageDataUrl.length > 3 * 1024 * 1024) break;
      const buffer = Buffer.from(match[2], 'base64');
      if (!buffer.length || buffer.length > 2 * 1024 * 1024) break;
      const detected = await fileTypeFromBuffer(buffer);
      if (!detected || !['image/jpeg', 'image/png'].includes(detected.mime)) break;
      try {
        const stored = await persistScreenshot(buffer, detected.mime as 'image/jpeg' | 'image/png', client.tenantId, client.screenId, msg.commandId);
        broadcastToAdmins({ type: 'SCREENSHOT_UPDATED', screenId: client.screenId, commandId: msg.commandId, imageUrl: stored.url, capturedAt: stored.capturedAt.toISOString() }, client.tenantId);
      } catch {
        const command = await completeCommand(client.screenId, msg.commandId, false, 'Não foi possível salvar a captura.', 'TAKE_SCREENSHOT');
        if (command) broadcastToAdmins({ type: 'COMMAND_RESULT', screenId: client.screenId, commandId: msg.commandId, action: 'TAKE_SCREENSHOT', success: false, message: 'Não foi possível salvar a captura.' }, client.tenantId);
      }
      break;
    }
    case 'COMMAND_RESULT': {
      if (client.screenId && typeof msg.commandId === 'string') {
        const action = typeof msg.action === 'string' ? msg.action.slice(0, 40).toUpperCase() : 'UNKNOWN';
        const message = typeof msg.message === 'string' ? msg.message.slice(0, 300) : undefined;
        const command = await completeCommand(client.screenId, msg.commandId, !!msg.success, message, action);
        if (!command) break;
        broadcastToAdmins(
          {
            type: 'COMMAND_RESULT',
            screenId: client.screenId,
            commandId: msg.commandId,
            action: command.action,
            success: !!msg.success,
            message
          },
          client.tenantId
        );
      }
      break;
    }
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function isScreenOnline(screenId?: string | null): boolean {
  if (!screenId) return false;
  for (const conn of activeConnections) {
    if (conn.type === 'PLAYER' && conn.screenId === screenId && conn.ws.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
}

/** Monta a mensagem de comando para o dispositivo. UPDATE_APP entrega os campos
 *  (apkUrl/version/checksum) no topo; os demais comandos usam `payload` aninhado. */
export function formatCommandForDevice(
  action: string,
  commandId: string,
  deviceId: string,
  createdAt: Date,
  expiresAt: Date,
  payload?: any
): Record<string, any> {
  const base = {
    type: action,
    commandId,
    deviceId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
  if (action === 'UPDATE_APP' && payload) return { ...base, ...payload };
  return payload ? { ...base, payload } : base;
}

export function sendCommandToScreen(screenId: string, command: any) {
  for (const conn of activeConnections) {
    if (conn.type === 'PLAYER' && conn.screenId === screenId && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(command));
      return true;
    }
  }
  return false;
}

export function broadcastTicketCalled(screenId: string, data: { ticketNumber: string; deskName: string; audioText: string }) {
  return sendCommandToScreen(screenId, {
    type: 'TICKET_CALLED',
    ticketNumber: data.ticketNumber,
    deskName: data.deskName,
    audioText: data.audioText,
    calledAt: new Date().toISOString()
  });
}

export async function sendManifestToScreen(
  screenId: string,
  forceReload = false,
  command?: { commandId: string; createdAt: Date; expiresAt: Date }
): Promise<boolean> {
  const manifest = await buildScreenManifest(screenId);
  if (!manifest) return false;
  const client = [...activeConnections].find(c => c.type === 'PLAYER' && c.screenId === screenId && c.ws.readyState === WebSocket.OPEN);
  if (!client) return false;
  const legacy = client.webSimulator ? {
    activePlaylist: manifest.activePlaylist, activeLayout: manifest.activeLayout,
    campaigns: manifest.campaigns, volume: manifest.screen.volume, orientation: manifest.screen.orientation,
    activeAlert: alertDto(await getActiveAlert(screenId, client.tenantId!))
  } : {};
  return sendCommandToScreen(screenId, {
    ...legacy,
    type: client.webSimulator ? 'CONTENT_UPDATED' : 'MANIFEST_UPDATED',
    deviceId: screenId,
    manifestVersion: manifest.version,
    manifestChecksum: manifest.checksum,
    forceReload,
    ...(command ? {
      commandId: command.commandId,
      createdAt: command.createdAt.toISOString(),
      expiresAt: command.expiresAt.toISOString()
    } : {})
  });
}

async function deliverPendingCommands(client: ConnectedClient, reconnect = true): Promise<void> {
  if (!client.screenId || client.ws.readyState !== WebSocket.OPEN || client.delivering) return;
  client.delivering = true;
  try {
  const now = new Date();
  await prisma.remoteCommand.updateMany({
    where: { screenId: client.screenId, status: { in: ['PENDING', 'SENT'] }, expiresAt: { lte: now } },
    data: { status: 'EXPIRED', completedAt: new Date(), success: false, message: 'Comando expirado após 24 horas.' }
  });
  const commands = await prisma.remoteCommand.findMany({
    where: { screenId: client.screenId, status: { in: ['PENDING', 'SENT'] }, expiresAt: { gt: now }, ...(reconnect ? {} : { OR: [{ sentAt: null }, { sentAt: { lt: new Date(Date.now() - 60_000) } }] }) },
    orderBy: { createdAt: 'asc' },
    take: 50
  });
  for (const command of commands) {
    if (command.action === 'SYNC') {
      await sendManifestToScreen(client.screenId, true, command);
    } else {
      let payload: any;
      try { payload = command.payloadJson ? JSON.parse(command.payloadJson) : undefined; } catch { payload = undefined; }
      client.ws.send(JSON.stringify(
        formatCommandForDevice(command.action, command.commandId, client.screenId, command.createdAt, command.expiresAt, payload)
      ));
    }
    await prisma.remoteCommand.updateMany({ where: { commandId: command.commandId, status: { in: ['PENDING', 'SENT'] } }, data: { status: 'SENT', sentAt: new Date() } });
  }
  } finally { client.delivering = false; }
}

export async function completeCommand(screenId: string, commandId: string, success: boolean, message?: string, action?: string) {
  const command = await prisma.remoteCommand.findFirst({ where: { commandId, screenId } });
  if (!command || (action && command.action !== action) || (command.action === 'TAKE_SCREENSHOT' && success)) return null;
  if (['SUCCEEDED', 'FAILED', 'EXPIRED'].includes(command.status)) return null;
  if (command.expiresAt <= new Date()) {
    await prisma.remoteCommand.update({
      where: { commandId },
      data: { status: 'EXPIRED', success: false, message: 'Comando expirado antes da confirmação.', completedAt: new Date() }
    });
    return null;
  }
  const result = await prisma.remoteCommand.updateMany({
    where: { commandId, status: { in: ['PENDING', 'SENT'] }, expiresAt: { gt: new Date() } },
    data: { status: success ? 'SUCCEEDED' : 'FAILED', success, message, completedAt: new Date() }
  });
  return result.count ? command : null;
}

export function broadcastToAdmins(data: any, tenantId?: string) {
  for (const conn of activeConnections) {
    if (
      conn.type === 'ADMIN' &&
      (!tenantId || conn.tenantId === tenantId) &&
      conn.ws.readyState === WebSocket.OPEN
    ) {
      conn.ws.send(JSON.stringify(data));
    }
  }
}

export function disconnectTenant(tenantId: string) {
  for (const connection of activeConnections) {
    if (connection.tenantId === tenantId && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(JSON.stringify({ type: 'TENANT_SUSPENDED' }));
      connection.ws.close(4003, 'Tenant suspended');
    }
  }
}

export function disconnectAdminSessions(userId: string, sessionId?: string) {
  for (const client of activeConnections) if (client.type === 'ADMIN' && client.ownerId === userId && (!sessionId || client.sessionId === sessionId)) client.ws.close(4001, 'Session changed');
}
export function disconnectScreen(screenId: string) {
  for (const client of activeConnections) if (client.screenId === screenId) { client.ws.send(JSON.stringify({ type: 'DEVICE_AUTH_FAILED' })); client.ws.close(4003, 'Device revoked'); }
}
