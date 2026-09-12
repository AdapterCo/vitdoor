import { Router } from '../lib/router.js';
import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, randomInt } from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { authenticate, requireRoles, tenantScope } from '../middleware/auth.js';
import { broadcastTicketCalled, isScreenOnline } from '../lib/websocket.js';
import { getAdminJwtSecret } from '../lib/session.js';
import { HttpError, isUuid, text } from '../lib/validation.js';

export const queueRoutes = Router();
const managers = requireRoles('SUPER_ADMIN', 'ADMIN_CLIENT', 'OPERATOR');
const pinLimit = rateLimit({ windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Muitas tentativas de PIN. Aguarde 15 minutos.' } });
const tenantPinLimit = rateLimit({ windowMs: 15 * 60_000, limit: 100, skipSuccessfulRequests: true, keyGenerator: req => typeof req.body.tenantId === 'string' ? req.body.tenantId : 'invalid', message: { error: 'Limite de tentativas do estabelecimento atingido.' } });
const lookupPin = (tenantId: string, pin: string) => createHmac('sha256', getAdminJwtSecret()).update(`${tenantId}:${pin}`).digest('hex');
function pinValue(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4,6}$/.test(value)) throw new HttpError(400, 'PIN deve conter 4 a 6 dígitos.');
  return value;
}
export async function migrateQueuePins() {
  const queues = await prisma.ticketQueue.findMany({ where: { pinCode: { not: null } } });
  for (const queue of queues) {
    const pin = queue.pinCode!;
    await prisma.ticketQueue.update({ where: { id: queue.id }, data: { pinHash: await bcrypt.hash(pin, 12), pinLookup: lookupPin(queue.tenantId, pin), pinCode: null } });
  }
}
function queueDto(queue: any) {
  return { id: queue.id, name: queue.name, prefix: queue.prefix, currentNum: queue.currentNum, deskName: queue.deskName, screenId: queue.screenId, screen: queue.screen, screenName: queue.screen?.name, screenStatus: isScreenOnline(queue.screenId) ? 'ONLINE' : 'OFFLINE', _count: queue._count };
}
async function operatorQueue(req: Request) {
  let claims: any;
  try { claims = jwt.verify(req.headers.authorization?.replace(/^Bearer /, '') || '', getAdminJwtSecret(), { algorithms: ['HS256'] }); }
  catch { throw new HttpError(401, 'Sessão do chamador expirada. Informe o PIN novamente.'); }
  if (claims.type !== 'QUEUE' || typeof claims.queueId !== 'string') throw new HttpError(401, 'Sessão inválida.');
  const queue = await prisma.ticketQueue.findFirst({ where: { id: claims.queueId, tenantId: claims.tenantId, tokenVersion: claims.version, tenant: { status: 'ACTIVE' } }, include: { screen: { select: { id: true, name: true } } } });
  if (!queue) throw new HttpError(401, 'Fila indisponível.');
  return queue;
}
async function queueStatus(queue: any) {
  const recentTickets = await prisma.queueTicket.findMany({ where: { queueId: queue.id, status: { not: 'RESET' } }, orderBy: { calledAt: 'desc' }, take: 5 });
  return { queue: queueDto(queue), recentTickets };
}
queueRoutes.post('/operator/auth', pinLimit, tenantPinLimit, async (req, res) => {
  const tenantId = text(req.body.tenantId, 'Estabelecimento');
  const pin = pinValue(req.body.pinCode);
  const queue = await prisma.ticketQueue.findFirst({ where: { tenantId, pinLookup: lookupPin(tenantId, pin), tenant: { status: 'ACTIVE' } }, include: { screen: { select: { id: true, name: true } } } });
  if (!queue?.pinHash || !await bcrypt.compare(pin, queue.pinHash)) throw new HttpError(401, 'PIN inválido.');
  const token = jwt.sign({ type: 'QUEUE', queueId: queue.id, tenantId, version: queue.tokenVersion }, getAdminJwtSecret(), { expiresIn: '8h', algorithm: 'HS256' });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ...await queueStatus(queue), token });
});
queueRoutes.post('/operator/status', async (req, res) => res.json(await queueStatus(await operatorQueue(req))));

for (const action of ['call-next', 'call-specific', 'recall', 'reset']) {
  queueRoutes.post(`/operator/${action}`, async (req, res) => {
    const queue = await operatorQueue(req);
    if (!isUuid(req.body.eventId)) throw new HttpError(400, 'eventId UUID obrigatório.');
    const custom = action === 'call-specific' ? text(req.body.customNumber, 'Senha', 12).toUpperCase() : '';
    if (custom && !/^[A-Z0-9 -]+$/.test(custom)) throw new HttpError(400, 'Senha deve conter letras e números.');
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "TicketQueue" WHERE id = ${queue.id} FOR UPDATE`;
      const fresh = await tx.ticketQueue.findUniqueOrThrow({ where: { id: queue.id } });
      if (fresh.tokenVersion !== queue.tokenVersion) throw new HttpError(401, 'Sessão do operador revogada.');
      const duplicate = await tx.queueTicket.findUnique({ where: { queueId_eventId: { queueId: queue.id, eventId: req.body.eventId } } });
      if (duplicate) return { ticket: duplicate, currentNum: fresh.currentNum, duplicate: true };
      let currentNum = fresh.currentNum;
      if (action === 'call-next') {
        if (currentNum >= 2147483646) throw new HttpError(409, 'Zere o contador antes de continuar.');
        currentNum = (await tx.ticketQueue.update({ where: { id: queue.id }, data: { currentNum: { increment: 1 } } })).currentNum;
      }
      if (action === 'recall' && currentNum === 0) throw new HttpError(400, 'Nenhuma senha chamada ainda.');
      if (action === 'reset') { currentNum = 0; await tx.ticketQueue.update({ where: { id: queue.id }, data: { currentNum: 0 } }); }
      const ticketNumber = action === 'call-specific' ? custom : `${fresh.prefix}${String(currentNum).padStart(3, '0')}`;
      const ticket = await tx.queueTicket.create({ data: { queueId: queue.id, eventId: req.body.eventId, ticketNumber, deskName: fresh.deskName, status: action === 'reset' ? 'RESET' : 'CALLED' } });
      return { ticket, currentNum, duplicate: false };
    });
    let delivered = false;
    if (action !== 'reset' && !result.duplicate && queue.screenId) delivered = broadcastTicketCalled(queue.screenId, { ticketNumber: result.ticket.ticketNumber, deskName: result.ticket.deskName, audioText: `Senha ${result.ticket.ticketNumber.split('').join(' ')}, ${result.ticket.deskName}` });
    return res.json({ success: true, ...result.ticket, currentNum: result.currentNum, duplicate: result.duplicate, delivered });
  });
}

queueRoutes.get('/admin', authenticate, managers, async (req, res) => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  return res.json((await prisma.ticketQueue.findMany({ where: { tenantId }, include: { screen: { select: { id: true, name: true } }, _count: { select: { tickets: true } } }, orderBy: { createdAt: 'desc' } })).map(queueDto));
});
queueRoutes.post('/admin', authenticate, managers, async (req, res) => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const pin = pinValue(req.body.pinCode || String(randomInt(100000, 1000000)));
  const screenId = req.body.screenId || null;
  if (screenId && !await prisma.screen.findFirst({ where: { id: screenId, tenantId, archivedAt: null } })) throw new HttpError(400, 'Tela inválida.');
  const prefix = typeof req.body.prefix === 'string' ? req.body.prefix.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{0,6}$/.test(prefix)) throw new HttpError(400, 'Prefixo inválido.');
  const queue = await prisma.ticketQueue.create({ data: { tenantId, name: text(req.body.name, 'Nome'), prefix, deskName: text(req.body.deskName || 'Guichê 01', 'Guichê', 80), screenId, pinCode: null, pinHash: await bcrypt.hash(pin, 12), pinLookup: lookupPin(tenantId, pin) } });
  return res.status(201).json({ ...queueDto(queue), pinCode: pin }); // shown once
});
queueRoutes.post('/admin/:id/reset-pin', authenticate, managers, async (req, res) => {
  const tenantId = tenantScope(req, req.body.tenantId);
  const queue = await prisma.ticketQueue.findFirst({ where: { id: req.params.id, tenantId } });
  if (!queue) throw new HttpError(404, 'Fila não encontrada.');
  const pin = String(randomInt(100000, 1000000));
  await prisma.ticketQueue.update({ where: { id: queue.id }, data: { pinCode: null, pinHash: await bcrypt.hash(pin, 12), pinLookup: lookupPin(tenantId, pin), tokenVersion: { increment: 1 } } });
  return res.json({ pinCode: pin });
});
queueRoutes.delete('/admin/:id', authenticate, managers, async (req, res) => {
  const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
  const result = await prisma.ticketQueue.deleteMany({ where: { id: req.params.id, tenantId } });
  if (!result.count) throw new HttpError(404, 'Fila não encontrada.');
  return res.json({ success: true });
});
