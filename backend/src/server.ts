import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';

import { initWebSocketServer } from './lib/websocket.js';
import { prisma } from './lib/prisma.js';
import { authRoutes } from './routes/authRoutes.js';
import { screenRoutes } from './routes/screenRoutes.js';
import { mediaRoutes } from './routes/mediaRoutes.js';
import { layoutRoutes } from './routes/layoutRoutes.js';
import { playlistRoutes } from './routes/playlistRoutes.js';
import { campaignRoutes } from './routes/campaignRoutes.js';
import { proofOfPlayRoutes } from './routes/proofOfPlayRoutes.js';
import { emergencyRoutes } from './routes/emergencyRoutes.js';
import { tenantRoutes } from './routes/tenantRoutes.js';
import { deviceRoutes } from './routes/deviceRoutes.js';
import { authenticate } from './middleware/auth.js';
import { assertStorageConfiguration } from './lib/storage.js';

(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

const app = express();
const PORT = process.env.PORT || 4000;
assertStorageConfiguration();
app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres em produção.');
}

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/screens', authenticate, screenRoutes);
app.use('/api/media', authenticate, mediaRoutes);
app.use('/api/layouts', authenticate, layoutRoutes);
app.use('/api/playlists', authenticate, playlistRoutes);
app.use('/api/campaigns', authenticate, campaignRoutes);
app.use('/api/proof-of-play', proofOfPlayRoutes);
app.use('/api/emergency', authenticate, emergencyRoutes);
app.use('/api/tenants', authenticate, tenantRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', database: 'OK', storage: process.env.STORAGE_DRIVER || 'local', system: 'VitDoor Mídia Indoor SaaS', timestamp: new Date() });
  } catch {
    res.status(503).json({ status: 'ERROR', database: 'UNAVAILABLE', timestamp: new Date() });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled request error:', error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const server = http.createServer(app);
initWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`VitDoor Backend Server rodando na porta ${PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} recebido; encerrando servidor.`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
