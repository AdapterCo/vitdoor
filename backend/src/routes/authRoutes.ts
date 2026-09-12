import { Router } from '../lib/router.js';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../lib/session.js';
import { authenticate } from '../middleware/auth.js';
import { createAdminSession } from '../lib/adminSessions.js';
import { passwordError, HttpError } from '../lib/validation.js';
import { passwordRateLimiter } from '../middleware/security.js';
import { disconnectAdminSessions } from '../lib/websocket.js';
import { tenantDto } from '../lib/dto.js';

export const authRoutes = Router();
authRoutes.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});

authRoutes.post('/login', async (req: Request, res: Response): Promise<any> => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const user = await prisma.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
    include: { tenant: true }
  });

  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  if (!user.active || user.tenant.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Conta ou empresa suspensa. Entre em contato com o suporte.' });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const token = await createAdminSession(user);

  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      tenantLogo: user.tenant.logoUrl,
      brandColor: user.tenant.brandColor
    }
  });
});

authRoutes.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId }, include: { tenant: true } });
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId, tenantName: user.tenant.name, tenant: tenantDto(user.tenant) });
});

authRoutes.post('/change-password', authenticate, passwordRateLimiter, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const error = passwordError(newPassword);
  if (error) throw new HttpError(400, error);
  if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword, 'utf8') > 72) throw new HttpError(400, 'Informe a senha atual.');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  if (!await bcrypt.compare(currentPassword, user.passwordHash)) throw new HttpError(400, 'Senha atual incorreta.');
  if (await bcrypt.compare(newPassword, user.passwordHash)) throw new HttpError(400, 'Escolha uma senha diferente da atual.');
  const passwordHash = await bcrypt.hash(newPassword, 12);
  const token = await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash, sessionVersion: user.sessionVersion }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    if (result.count !== 1) throw new HttpError(409, 'A conta foi alterada. Entre novamente e tente outra vez.');
    return createAdminSession(await tx.user.findUniqueOrThrow({ where: { id: user.id } }));
  });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  disconnectAdminSessions(user.id);
  return res.json({ message: 'Senha alterada. As outras sessões foram encerradas.' });
});

authRoutes.post('/logout', async (req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions(), maxAge: undefined });
  return res.status(204).send();
});
