import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export interface DeviceAuth { screenId: string; tenantId: string; version: number; type: 'DEVICE' }
declare global { namespace Express { interface Request { deviceAuth?: DeviceAuth } } }

export async function authenticateDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  let payload: DeviceAuth;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as DeviceAuth;
    if (payload.type !== 'DEVICE' || typeof payload.screenId !== 'string' || typeof payload.tenantId !== 'string' || !Number.isInteger(payload.version)) throw new Error('INVALID_TOKEN_TYPE');
  } catch {
    res.status(401).json({ error: 'Credencial do dispositivo inválida ou revogada.' });
    return;
  }
  try {
    const screen = await prisma.screen.findFirst({ where: {
      id: payload.screenId, tenantId: payload.tenantId, paired: true, archivedAt: null, deviceTokenVersion: payload.version
    }, include: { tenant: { select: { status: true } } } });
    if (!screen) { res.status(401).json({ error: 'Credencial do dispositivo revogada.' }); return; }
    if (screen.tenant.status !== 'ACTIVE') { res.status(403).json({ error: 'Empresa temporariamente suspensa.' }); return; }
    req.deviceAuth = { type: 'DEVICE', screenId: payload.screenId, tenantId: payload.tenantId, version: payload.version };
    next();
  } catch (error) { next(error); }
}
