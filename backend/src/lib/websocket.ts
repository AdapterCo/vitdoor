import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { prisma } from './prisma.js';
import jwt from 'jsonwebtoken';

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
}

const activeConnections = new Set<ConnectedClient>();

export function cleanCode(code?: string): string {
  return (code || '').trim().replace(/[\s-]/g, '').toUpperCase();
}

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 6 * 1024 * 1024 });

  wss.on('connection', (ws: WebSocket) => {
    const client: ConnectedClient = {
      ws,
      type: 'PLAYER',
      messageWindowStartedAt: Date.now(),
      messagesInWindow: 0
    };
    client.authTimer = setTimeout(() => {
      if (!client.screenId && !client.ownerId && ws.readyState === WebSocket.OPEN) {
        ws.close(1008, 'Authentication timeout');
      }
    }, 10_000);
    activeConnections.add(client);

    ws.on('message', async (data: string) => {
      const now = Date.now();
      if (now - client.messageWindowStartedAt >= 60_000) {
        client.messageWindowStartedAt = now;
        client.messagesInWindow = 0;
      }
      client.messagesInWindow += 1;
      if (client.messagesInWindow > 120) {
        ws.close(1008, 'Message rate exceeded');
        return;
      }
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(client, message);
      } catch (err) {
        console.error('WebSocket Message Parsing Error:', err);
      }
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
            client.tenantId,
            client.ownerId
          );
        } catch (e) {
          // Screen might have been deleted
        }
      }
    });
  });

  console.log('⚡ Gateway WebSocket Server ativo em /ws');
}

async function handleMessage(client: ConnectedClient, msg: any) {
  switch (msg.type) {
    case 'REGISTER_PLAYER': {
      client.type = 'PLAYER';
      client.pairingCode = msg.pairingCode;
      let screen = null;
      if (msg.deviceToken) {
        try {
          const auth = jwt.verify(msg.deviceToken, process.env.JWT_SECRET || 'secret', { algorithms: ['HS256'] }) as any;
          if (auth.type === 'DEVICE') {
            screen = await prisma.screen.findFirst({ where: {
              id: auth.screenId,
              tenantId: auth.tenantId,
              paired: true,
              deviceTokenVersion: auth.version
            } });
          }
        } catch {
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

        // Send active playlist / content data back to player
        const activePlaylist = screen.activePlaylistId
          ? await prisma.playlist.findUnique({
            where: { id: screen.activePlaylistId, tenantId: screen.tenantId, createdById: screen.createdById },
              include: { items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } } }
            })
          : await prisma.playlist.findFirst({
              where: { tenantId: screen.tenantId, createdById: screen.createdById },
              include: { items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } } }
            });

        const activeAlert = await prisma.emergencyAlert.findFirst({
          where: { tenantId: screen.tenantId, active: true, targets: { some: { screenId: screen.id } } },
          orderBy: { createdAt: 'desc' }
        });
        const activeLayout = screen.activeLayoutId
          ? await prisma.layout.findFirst({ where: { id: screen.activeLayoutId, tenantId: screen.tenantId, createdById: screen.createdById } })
          : null;

        client.ws.send(JSON.stringify({
          type: 'PAIRING_SUCCESS',
          screenId: screen.id,
          screenName: screen.name,
          tenantId: screen.tenantId,
          volume: screen.volume,
          orientation: screen.orientation,
          activePlaylist,
          activeLayout,
          activeAlert
        }));

        broadcastToAdmins(
          { type: 'SCREEN_STATUS_CHANGED', screenId: screen.id, status: 'ONLINE' },
          screen.tenantId,
          screen.createdById || undefined
        );
      } else {
        client.ws.send(JSON.stringify({ type: 'PAIRING_PENDING', pairingCode: msg.pairingCode }));
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
        await prisma.screen.update({
          where: { id: client.screenId },
          data: telemetry
        });
        broadcastToAdmins(
          {
            type: 'SCREEN_TELEMETRY_UPDATE',
            screenId: client.screenId,
            telemetry: msg
          },
          client.tenantId,
          client.ownerId
        );
      }
      break;
    }

    case 'REGISTER_ADMIN': {
      try {
        const auth = jwt.verify(msg.token || '', process.env.JWT_SECRET || 'secret', { algorithms: ['HS256'] }) as any;
        const user = await prisma.user.findFirst({ where: { id: auth.userId, tenantId: auth.tenantId, active: true, tenant: { status: 'ACTIVE' } } });
        if (!user) throw new Error('INACTIVE_ADMIN');
        client.type = 'ADMIN';
        client.tenantId = auth.tenantId;
        client.ownerId = auth.userId;
        if (client.authTimer) clearTimeout(client.authTimer);
      } catch {
        client.ws.close(1008, 'Unauthorized');
      }
      break;
    }

    case 'SCREENSHOT_RESULT': {
      if (
        client.screenId &&
        typeof msg.imageDataUrl === 'string' &&
        msg.imageDataUrl.startsWith('data:image/jpeg;base64,') &&
        msg.imageDataUrl.length <= 5 * 1024 * 1024
      ) {
        await prisma.screen.update({
          where: { id: client.screenId },
          data: { lastScreenshotUrl: msg.imageDataUrl }
        });
        broadcastToAdmins(
          {
            type: 'SCREENSHOT_UPDATED',
            screenId: client.screenId,
            imageUrl: msg.imageDataUrl
          },
          client.tenantId,
          client.ownerId
        );
      }
      break;
    }
    case 'COMMAND_RESULT': {
      if (client.screenId) {
        broadcastToAdmins(
          { type: 'COMMAND_RESULT', screenId: client.screenId, action: msg.action, success: !!msg.success, message: msg.message },
          client.tenantId,
          client.ownerId
        );
      }
      break;
    }
  }
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
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

export function broadcastToAdmins(data: any, tenantId?: string, ownerId?: string) {
  for (const conn of activeConnections) {
    if (
      conn.type === 'ADMIN' &&
      (!tenantId || conn.tenantId === tenantId) &&
      (!ownerId || conn.ownerId === ownerId) &&
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
