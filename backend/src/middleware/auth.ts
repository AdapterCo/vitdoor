import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { getAdminJwtSecret, getSessionToken } from '../lib/session.js';
import { verifyAdminSession } from '../lib/adminSessions.js';
import { HttpError } from '../lib/validation.js';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: string;
  sessionId: string;
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
    const allowedAdminOrigins = (process.env.ADMIN_ORIGINS || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000,http://127.0.0.1:3000' : process.env.PUBLIC_BASE_URL) || '')
      .split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean);
    if (!allowedAdminOrigins.includes(origin.replace(/\/$/, ''))) {
      res.status(403).json({ error: 'Origem da sessão não autorizada.' });
      return;
    }
  }
  try {
    const { user, sessionId } = await verifyAdminSession(token);
    req.auth = { userId: user.id, tenantId: user.tenantId, role: user.role, sessionId };
    next();
  } catch (error) {
    if (error instanceof HttpError) res.status(error.status).json({ error: error.message });
    else next(error);
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Acesso exclusivo do administrador da plataforma.' });
    return;
  }
  next();
}

export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'Seu perfil não tem permissão para executar esta ação.' });
      return;
    }
    next();
  };
}

/** GET/HEAD permanecem consultivos; toda mutação exige um papel explicitamente autorizado. */
export function requireMutationRoles(...roles: string[]) {
  const authorize = requireRoles(...roles);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    authorize(req, res, next);
  };
}

export function tenantScope(req: Request, requestedTenantId?: string): string {
  if (!req.auth) throw new HttpError(401, 'Autenticação obrigatória.');
  if (requestedTenantId && requestedTenantId !== req.auth.tenantId) throw new HttpError(403, 'Acesso a outro cliente não autorizado.');
  return req.auth.tenantId;
}
