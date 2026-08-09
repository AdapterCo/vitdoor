import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrador VitDoor';

  if (!email || !password || password.length < 12) {
    throw new Error('Defina INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD com pelo menos 12 caracteres.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'vitdoor-master' },
    update: { status: 'ACTIVE' },
    create: {
      name: 'VitDoor',
      slug: 'vitdoor-master',
      maxScreens: 1,
      maxStorageMb: 100,
      status: 'ACTIVE'
    }
  });

  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, active: true, role: 'SUPER_ADMIN', tenantId: tenant.id },
    create: { name, email, passwordHash, active: true, role: 'SUPER_ADMIN', tenantId: tenant.id }
  });

  console.log(`Administrador master preparado: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
