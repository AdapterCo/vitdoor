import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export interface DeviceAuth { screenId: string; tenantId: string; version: number; type: 'DEVICE' }
declare global { namespace Express { interface Request { deviceAuth?: DeviceAuth } } }

export async function authenticateDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as DeviceAuth;
    if (payload.type !== 'DEVICE') throw new Error('INVALID_TOKEN_TYPE');
    const screen = await prisma.screen.findFirst({ where: {
      id: payload.screenId, tenantId: payload.tenantId, paired: true, deviceTokenVersion: payload.version,
      tenant: { status: 'ACTIVE' }
    } });
    if (!screen) throw new Error('REVOKED_DEVICE');
    req.deviceAuth = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Credencial do dispositivo inválida ou revogada.' });
  }
}
