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
}

const activeConnections = new Set<ConnectedClient>();

export function cleanCode(code?: string): string {
  return (code || '').trim().replace(/[\s-]/g, '').toUpperCase();
}

export function initWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    const client: ConnectedClient = { ws, type: 'PLAYER' };
    activeConnections.add(client);

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data.toString());
        await handleMessage(client, message);
      } catch (err) {
        console.error('WebSocket Message Parsing Error:', err);
      }
    });

    ws.on('close', async () => {
      activeConnections.delete(client);
      if (client.screenId) {
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
          const auth = jwt.verify(msg.deviceToken, process.env.JWT_SECRET || 'secret') as any;
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
        }
      }
      if (!screen && msg.pairingCode) {
        const targetCode = cleanCode(msg.pairingCode);
        const screens = await prisma.screen.findMany();
        screen = screens.find((s) => cleanCode(s.pairingCode) === targetCode) || null;
      }

      if (screen && screen.paired) {
        client.screenId = screen.id;
        client.tenantId = screen.tenantId;
        await prisma.screen.update({
          where: { id: screen.id },
          data: {
            status: 'ONLINE',
            lastPing: new Date(),
            ipAddress: msg.ipAddress || '192.168.1.100',
            os: msg.os || 'Android TV',
            appVersion: msg.appVersion || '1.0.0'
          }
        });

        // Send active playlist / content data back to player
        const activePlaylist = screen.activePlaylistId
          ? await prisma.playlist.findUnique({
              where: { id: screen.activePlaylistId },
              include: { items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } } }
            })
          : await prisma.playlist.findFirst({
              where: { tenantId: screen.tenantId },
              include: { items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } } }
            });

        const activeAlert = await prisma.emergencyAlert.findFirst({
          where: { tenantId: screen.tenantId, active: true },
          orderBy: { createdAt: 'desc' }
        });
        const activeLayout = screen.activeLayoutId
          ? await prisma.layout.findUnique({ where: { id: screen.activeLayoutId } })
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
          screen.tenantId
        );
      } else {
        client.ws.send(JSON.stringify({ type: 'PAIRING_PENDING', pairingCode: msg.pairingCode }));
      }
      break;
    }

    case 'HEARTBEAT': {
      if (client.screenId) {
        await prisma.screen.update({
          where: { id: client.screenId },
          data: {
            status: 'ONLINE',
            lastPing: new Date(),
            ramUsagePercent: msg.ramUsagePercent || 35,
            cpuUsagePercent: msg.cpuUsagePercent || 18,
            currentMediaName: msg.currentMediaName || 'Carregando...',
            storageFreeMb: msg.storageFreeMb || 4096
          }
        });
        broadcastToAdmins(
          {
            type: 'SCREEN_TELEMETRY_UPDATE',
            screenId: client.screenId,
            telemetry: msg
          },
          client.tenantId
        );
      }
      break;
    }

    case 'REGISTER_ADMIN': {
      try {
        const auth = jwt.verify(msg.token || '', process.env.JWT_SECRET || 'secret') as any;
        client.type = 'ADMIN';
        client.tenantId = auth.role === 'SUPER_ADMIN'
          ? (typeof msg.tenantId === 'string' ? msg.tenantId : undefined)
          : auth.tenantId;
      } catch {
        client.ws.close(1008, 'Unauthorized');
      }
      break;
    }

    case 'SCREENSHOT_RESULT': {
      if (client.screenId && msg.imageDataUrl) {
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
          client.tenantId
        );
      }
      break;
    }
    case 'COMMAND_RESULT': {
      if (client.screenId) {
        broadcastToAdmins(
          { type: 'COMMAND_RESULT', screenId: client.screenId, action: msg.action, success: !!msg.success, message: msg.message },
          client.tenantId
        );
      }
      break;
    }
  }
}

export async function notifyPairingConfirmed(screen: any) {
  const fullScreen = await prisma.screen.findUnique({
    where: { id: screen.id },
    include: {
      activePlaylist: { include: { items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } } } },
      activeLayout: true
    }
  });

  const defaultPlaylist = fullScreen?.activePlaylist || await prisma.playlist.findFirst({
    where: { tenantId: screen.tenantId },
    include: { items: { include: { media: true, layout: true }, orderBy: { orderIndex: 'asc' } } }
  });

  const targetCode = cleanCode(screen.pairingCode);

  for (const conn of activeConnections) {
    if (
      conn.type === 'PLAYER' &&
      (cleanCode(conn.pairingCode) === targetCode || conn.screenId === screen.id)
    ) {
      conn.screenId = screen.id;
      conn.tenantId = screen.tenantId;
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(JSON.stringify({
          type: 'PAIRING_CONFIRMED',
          screenId: screen.id,
          screenName: screen.name,
          tenantId: screen.tenantId,
          volume: screen.volume || 80,
          orientation: screen.orientation || 'HORIZONTAL',
          activePlaylist: defaultPlaylist
          ,activeLayout: fullScreen?.activeLayout
        }));
      }
    }
  }
  broadcastToAdmins(
    { type: 'SCREEN_STATUS_CHANGED', screenId: screen.id, status: 'ONLINE' },
    screen.tenantId
  );
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

export function broadcastToAllScreens(tenantId: string, command: any) {
  for (const conn of activeConnections) {
    if (conn.type === 'PLAYER' && conn.tenantId === tenantId && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(command));
    }
  }
}

export function broadcastToAdmins(data: any, tenantId?: string) {
  for (const conn of activeConnections) {
    if (
      conn.type === 'ADMIN' &&
      (!tenantId || !conn.tenantId || conn.tenantId === tenantId) &&
      conn.ws.readyState === WebSocket.OPEN
    ) {
      conn.ws.send(JSON.stringify(data));
    }
  }
}
