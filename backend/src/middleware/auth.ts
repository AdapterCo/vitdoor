import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

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
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Autenticação obrigatória.' });
    return;
  }
  try {
    const auth = jwt.verify(token, process.env.JWT_SECRET || 'secret') as AuthUser;
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
