import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { getAdminJwtSecret, getSessionToken } from '../lib/session.js';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Autenticação obrigatória.' });
    return;
  }
  const usesSessionCookie = Boolean(req.cookies?.vitdoor_session);
  const origin = req.headers.origin;
  if (usesSessionCookie && origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const allowedAdminOrigins = (process.env.ADMIN_ORIGINS || process.env.PUBLIC_BASE_URL || '')
      .split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
    if (!allowedAdminOrigins.includes(origin.replace(/\/$/, ''))) {
      res.status(403).json({ error: 'Origem da sessão não autorizada.' });
      return;
    }
  }
  try {
    const auth = jwt.verify(token, getAdminJwtSecret(), { algorithms: ['HS256'] }) as AuthUser;
    const user = await prisma.user.findFirst({ where: { id: auth.userId, tenantId: auth.tenantId, active: true }, include: { tenant: true } });
    if (!user || user.tenant.status !== 'ACTIVE') {
      res.status(401).json({ error: 'Conta ou empresa suspensa.' });
      return;
    }
    req.auth = auth;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Acesso exclusivo do administrador da plataforma.' });
    return;
  }
  next();
}

export function tenantScope(req: Request, requestedTenantId?: string): string {
  if (!req.auth) throw new Error('UNAUTHENTICATED');
  if (requestedTenantId && requestedTenantId !== req.auth.tenantId) throw new Error('FORBIDDEN_TENANT');
  return req.auth.tenantId;
}
