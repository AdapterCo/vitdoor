import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { requireSuperAdmin } from '../middleware/auth.js';
import { disconnectTenant } from '../lib/websocket.js';

export const tenantRoutes = Router();
tenantRoutes.use(requireSuperAdmin);

tenantRoutes.get('/', async (_req: Request, res: Response): Promise<any> => {
  const tenants = await prisma.tenant.findMany({
    include: {
      users: { select: { id: true, name: true, email: true, role: true, active: true } },
      _count: { select: { screens: true, users: true, medias: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
  return res.json(tenants);
});

tenantRoutes.post('/', async (req: Request, res: Response): Promise<any> => {
  const {
    name, slug, maxScreens, maxStorageMb, brandColor, logoUrl, customDomain,
    adminName, adminEmail, adminPassword
  } = req.body;

  if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'Empresa e dados do administrador são obrigatórios.' });
  }
  if (String(adminPassword).length < 12) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 12 caracteres.' });
  }

  try {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const tenant = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          name,
          slug: String(slug).toLowerCase().trim().replace(/[^a-z0-9-]/g, '-'),
          maxScreens: Math.max(1, parseInt(maxScreens, 10) || 1),
          maxStorageMb: Math.max(100, parseInt(maxStorageMb, 10) || 5000),
          brandColor: brandColor || '#2563eb',
          logoUrl,
          customDomain
        }
      });
      await tx.user.create({
        data: {
          tenantId: created.id,
          name: adminName,
          email: String(adminEmail).toLowerCase().trim(),
          passwordHash,
          role: 'ADMIN_CLIENT'
        }
      });
      return created;
    });
    return res.status(201).json(tenant);
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Slug ou e-mail já cadastrado.' });
    throw error;
  }
});

tenantRoutes.put('/:id', async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const { name, status, maxScreens, maxStorageMb, brandColor, customDomain } = req.body;
  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Cliente não encontrado.' });
  if (status && !['ACTIVE', 'SUSPENDED'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  if (existing.slug === 'vitdoor-master' && status === 'SUSPENDED') return res.status(400).json({ error: 'O tenant master da plataforma não pode ser suspenso.' });
  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      name, status,
      maxScreens: maxScreens !== undefined ? Math.max(1, parseInt(maxScreens, 10)) : undefined,
      maxStorageMb: maxStorageMb !== undefined ? Math.max(100, parseInt(maxStorageMb, 10)) : undefined,
      brandColor, customDomain
    }
  });
  if (tenant.status !== 'ACTIVE') {
    await prisma.screen.updateMany({ where: { tenantId: id }, data: { status: 'OFFLINE' } });
    disconnectTenant(id);
  }
  return res.json(tenant);
});
