import { prisma } from './prisma.js';
import { deleteStoredFile, purgePublicUrl } from './storage.js';
import { sendCommandToScreen, sendManifestToScreen } from './websocket.js';
import { getActiveAlert } from './alerts.js';
import { alertDto } from './dto.js';

let running = false;
export async function maintenanceTick() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const alerts = await prisma.emergencyAlert.findMany({ where: { active: true, expiresAt: { lte: now } }, include: { targets: true } });
    await prisma.emergencyAlert.updateMany({ where: { id: { in: alerts.map(a => a.id) } }, data: { active: false } });
    for (const alert of alerts) for (const target of alert.targets) {
      const current = await getActiveAlert(target.screenId, alert.tenantId);
      sendCommandToScreen(target.screenId, current ? { type: 'EMERGENCY_ALERT_TRIGGERED', alert: alertDto(current) } : { type: 'EMERGENCY_ALERT_CLEARED' });
    }
    await prisma.remoteCommand.updateMany({ where: { status: { in: ['PENDING', 'SENT'] }, expiresAt: { lte: now } }, data: { status: 'EXPIRED', success: false, completedAt: now } });
    await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } });
    await prisma.pairingSession.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } });
    const deletions = await prisma.storageDeletion.findMany({ where: { nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: 'asc' }, take: 20 });
    for (const job of deletions) {
      try {
        await deleteStoredFile(job.storagePath); await purgePublicUrl(job.publicUrl);
        await prisma.storageDeletion.delete({ where: { id: job.id } });
      } catch {
        await prisma.storageDeletion.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + Math.min(86400, 30 * 2 ** Math.min(job.attempts, 12)) * 1000) } });
        console.error(JSON.stringify({ event: 'storage_deletion_retry', jobId: job.id }));
      }
    }
    // Reconcile persisted version changes after a failed notification or a process restart.
    const unpublished = await prisma.$queryRaw<{ id: string }[]>`SELECT s.id FROM "Screen" s JOIN "Tenant" t ON t.id = s."tenantId" WHERE s.paired = true AND s."archivedAt" IS NULL AND t.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM "ScreenManifest" m WHERE m."screenId" = s.id AND m.version = s."manifestVersion") LIMIT 50`;
    for (const screen of unpublished) await sendManifestToScreen(screen.id).catch(() => console.error('Publication retry failed', screen.id));
  } finally { running = false; }
}
export function startMaintenance(): () => void {
  const run = () => void maintenanceTick().catch(() => console.error('Maintenance tick failed'));
  run(); const timer = setInterval(run, 30_000);
  return () => clearInterval(timer);
}
