import { prisma } from './prisma.js';
export async function getActiveAlert(screenId: string, tenantId: string) {
  return prisma.emergencyAlert.findFirst({ where: { tenantId, active: true, expiresAt: { gt: new Date() }, targets: { some: { screenId } } }, orderBy: { createdAt: 'desc' } });
}
