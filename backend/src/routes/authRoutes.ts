import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

export const authRoutes = Router();

authRoutes.post('/login', async (req: Request, res: Response): Promise<any> => {
  const { email, password } = req.body;
  if (!email || !password) {
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

  const token = jwt.sign(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );

  return res.json({
    token,
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

authRoutes.get('/me', async (req: Request, res: Response): Promise<any> => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, include: { tenant: true } });
    if (!user || !user.active || user.tenant.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Sessão inválida.' });
    }
    return res.json({
      id: user.id, name: user.name, email: user.email, role: user.role,
      tenantId: user.tenantId, tenantName: user.tenant.name, tenant: user.tenant
    });
  } catch {
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
});

authRoutes.post('/seed', async (_req: Request, res: Response): Promise<any> => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Rota indisponível.' });
  }
  // Ensure default master tenant & admin user exists
  let tenant = await prisma.tenant.findFirst({ where: { slug: 'vitdoor-demo' } });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'VitDoor Mídia Demo',
        slug: 'vitdoor-demo',
        plan: 'ENTERPRISE',
        maxScreens: 50,
        maxStorageMb: 20000,
        brandColor: '#2563eb'
      }
    });
  }

  let adminUser = await prisma.user.findUnique({ where: { email: 'admin@vitdoor.com' } });
  if (!adminUser) {
    const passwordHash = await bcrypt.hash('admin123', 10);
    adminUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: 'Administrador Master',
        email: 'admin@vitdoor.com',
        passwordHash,
        role: 'SUPER_ADMIN'
      }
    });
  }

  // Create sample media items
  let media1 = await prisma.media.findFirst({ where: { tenantId: tenant.id, name: 'Oferta Especial Semanal' } });
  if (!media1) {
    media1 = await prisma.media.create({
      data: {
        tenantId: tenant.id,
        name: 'Oferta Especial Semanal',
        type: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
        durationSeconds: 10,
        tags: 'Promocional'
      }
    });
  }

  let media2 = await prisma.media.findFirst({ where: { tenantId: tenant.id, name: 'Vídeo Institucional VitDoor' } });
  if (!media2) {
    media2 = await prisma.media.create({
      data: {
        tenantId: tenant.id,
        name: 'Vídeo Institucional VitDoor',
        type: 'IMAGE',
        url: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80',
        durationSeconds: 15,
        tags: 'Institucional'
      }
    });
  }

  // Create default playlist
  let defaultPlaylist = await prisma.playlist.findFirst({ where: { tenantId: tenant.id } });
  if (!defaultPlaylist) {
    defaultPlaylist = await prisma.playlist.create({
      data: {
        tenantId: tenant.id,
        name: 'Playlist Demo Inicial',
        description: 'Programação de demonstração padrão',
        category: 'Geral',
        isLoop: true,
        items: {
          create: [
            { mediaId: media1.id, orderIndex: 0, durationSeconds: 10 },
            { mediaId: media2.id, orderIndex: 1, durationSeconds: 15 }
          ]
        }
      }
    });
  }

  return res.json({ message: 'Ambiente inicializado com sucesso!', tenant, user: adminUser.email });
});
