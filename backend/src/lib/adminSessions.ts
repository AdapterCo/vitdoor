import jwt from 'jsonwebtoken';
import { prisma } from './prisma.js';
import { getAdminJwtSecret } from './session.js';
import { HttpError } from './validation.js';

export async function createAdminSession(user: { id: string; tenantId: string; sessionVersion: number }, db: Pick<typeof prisma, 'adminSession'> = prisma) {
  const session = await db.adminSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 12 * 3600_000) } });
  return jwt.sign({ userId: user.id, tenantId: user.tenantId, sessionId: session.id, version: user.sessionVersion, type: 'ADMIN' }, getAdminJwtSecret(), { expiresIn: '12h', algorithm: 'HS256' });
}

export async function verifyAdminSession(token: string) {
  let claims: any;
  try { claims = jwt.verify(token, getAdminJwtSecret(), { algorithms: ['HS256'] }); }
  catch { throw new HttpError(401, 'Sessão inválida ou expirada.'); }
  if (claims.type !== 'ADMIN' || typeof claims.sessionId !== 'string' || typeof claims.userId !== 'string') throw new HttpError(401, 'Entre novamente para continuar.');
  const session = await prisma.adminSession.findUnique({ where: { id: claims.sessionId }, include: { user: { include: { tenant: true } } } });
  if (!session || session.expiresAt <= new Date() || session.userId !== claims.userId || session.user.tenantId !== claims.tenantId || session.user.sessionVersion !== claims.version || !session.user.active || session.user.tenant.status !== 'ACTIVE') throw new HttpError(401, 'Sessão revogada ou conta inativa.');
  return { user: session.user, sessionId: session.id, expiresAt: session.expiresAt };
}
