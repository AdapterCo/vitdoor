import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { prisma } from './prisma.js';
import { getAdminJwtSecret } from './session.js';
import { HttpError } from './validation.js';

// Keep the original signed-cookie flow. A user version revokes credentials after
// a password change without creating a database session for each login.
export async function createAdminSession(user: { id: string; tenantId: string; role: string; sessionVersion: number }) {
  return jwt.sign({ userId: user.id, tenantId: user.tenantId, role: user.role, version: user.sessionVersion, type: 'ADMIN' }, getAdminJwtSecret(), { expiresIn: '12h', algorithm: 'HS256', jwtid: randomUUID() });
}

export async function verifyAdminSession(token: string) {
  let claims: any;
  try { claims = jwt.verify(token, getAdminJwtSecret(), { algorithms: ['HS256'] }); }
  catch { throw new HttpError(401, 'Sessao invalida ou expirada.'); }
  if ((claims.type && claims.type !== 'ADMIN') || typeof claims.userId !== 'string' || typeof claims.tenantId !== 'string') throw new HttpError(401, 'Entre novamente para continuar.');
  const user = await prisma.user.findUnique({ where: { id: claims.userId }, include: { tenant: true } });
  if (!user || user.tenantId !== claims.tenantId || !user.active || user.tenant.status !== 'ACTIVE' || (claims.version ?? 1) !== user.sessionVersion) throw new HttpError(401, 'Sessao revogada ou conta inativa.');
  // Read sessions already issued by the previous release until they expire.
  if (claims.sessionId) {
    const session = await prisma.adminSession.findUnique({ where: { id: claims.sessionId } });
    if (!session || session.userId !== user.id || session.expiresAt <= new Date()) throw new HttpError(401, 'Sessao revogada.');
  }
  return { user, sessionId: claims.sessionId || claims.jti || '', expiresAt: new Date(claims.exp * 1000) };
}
