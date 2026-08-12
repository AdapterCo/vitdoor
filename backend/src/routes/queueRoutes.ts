import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, tenantScope } from '../middleware/auth.js';
import { broadcastTicketCalled } from '../lib/websocket.js';

export const queueRoutes = Router();

// ==========================================
// OPERATOR PUBLIC ENDPOINTS (AUTHENTICATED VIA PIN)
// ==========================================

/**
 * POST /api/queues/operator/auth
 * Operador digita o PIN (ex: "1234") para acessar a tela do chamador.
 */
queueRoutes.post('/operator/auth', async (req: Request, res: Response): Promise<any> => {
  const { pinCode } = req.body;
  if (!pinCode || typeof pinCode !== 'string') {
    return res.status(400).json({ error: 'PIN inválido.' });
  }

  const queue = await prisma.ticketQueue.findFirst({
    where: { pinCode: pinCode.trim() },
    include: {
      screen: { select: { id: true, name: true, status: true } },
      tenant: { select: { status: true } }
    }
  });

  if (!queue || queue.tenant.status !== 'ACTIVE') {
    return res.status(401).json({ error: 'PIN de chamador não encontrado ou inativo.' });
  }

  // Get recent 5 called tickets
  const recentTickets = await prisma.queueTicket.findMany({
    where: { queueId: queue.id },
    orderBy: { calledAt: 'desc' },
    take: 5
  });

  return res.json({
    queue: {
      id: queue.id,
      name: queue.name,
      prefix: queue.prefix,
      currentNum: queue.currentNum,
      deskName: queue.deskName,
      screenId: queue.screenId,
      screenName: queue.screen?.name || null,
      screenStatus: queue.screen?.status || 'OFFLINE'
    },
    recentTickets
  });
});

/**
 * POST /api/queues/operator/call-next
 * Operador clica em "Chamar Próximo"
 */
queueRoutes.post('/operator/call-next', async (req: Request, res: Response): Promise<any> => {
  const { pinCode } = req.body;
  if (!pinCode || typeof pinCode !== 'string') {
    return res.status(400).json({ error: 'PIN de autenticação obrigatório.' });
  }

  const queue = await prisma.ticketQueue.findFirst({
    where: { pinCode: pinCode.trim() },
    select: { id: true, prefix: true, currentNum: true, deskName: true, screenId: true }
  });

  if (!queue) return res.status(401).json({ error: 'PIN inválido.' });

  const nextNum = queue.currentNum + 1;
  const formattedNum = (queue.prefix ? queue.prefix : '') + String(nextNum).padStart(3, '0');

  const [updatedQueue, ticket] = await prisma.$transaction([
    prisma.ticketQueue.update({
      where: { id: queue.id },
      data: { currentNum: nextNum }
    }),
    prisma.queueTicket.create({
      data: {
        queueId: queue.id,
        ticketNumber: formattedNum,
        deskName: queue.deskName,
        status: 'CALLED'
      }
    })
  ]);

  // Format audio text for TTS synthesis (e.g. "Senha A 0 4 3, Consultório 0 1")
  const spacedNumber = formattedNum.split('').join(' ');
  const audioText = `Senha ${spacedNumber}, ${queue.deskName}`;

  // Broadcast WebSocket event to the screen if connected
  if (queue.screenId) {
    broadcastTicketCalled(queue.screenId, {
      ticketNumber: formattedNum,
      deskName: queue.deskName,
      audioText
    });
  }

  return res.json({
    success: true,
    currentNum: updatedQueue.currentNum,
    ticketNumber: ticket.ticketNumber,
    deskName: ticket.deskName,
    calledAt: ticket.calledAt
  });
});

/**
 * POST /api/queues/operator/recall
 * Operador clica em "Rechamar"
 */
queueRoutes.post('/operator/recall', async (req: Request, res: Response): Promise<any> => {
  const { pinCode } = req.body;
  if (!pinCode || typeof pinCode !== 'string') {
    return res.status(400).json({ error: 'PIN de autenticação obrigatório.' });
  }

  const queue = await prisma.ticketQueue.findFirst({
    where: { pinCode: pinCode.trim() },
    select: { id: true, prefix: true, currentNum: true, deskName: true, screenId: true }
  });

  if (!queue || queue.currentNum === 0) {
    return res.status(400).json({ error: 'Nenhuma senha chamada ainda.' });
  }

  const formattedNum = (queue.prefix ? queue.prefix : '') + String(queue.currentNum).padStart(3, '0');

  // Record recall as a new call event
  const ticket = await prisma.queueTicket.create({
    data: {
      queueId: queue.id,
      ticketNumber: formattedNum,
      deskName: queue.deskName,
      status: 'CALLED'
    }
  });

  const spacedNumber = formattedNum.split('').join(' ');
  const audioText = `Atenção, Senha ${spacedNumber}, ${queue.deskName}`;

  if (queue.screenId) {
    broadcastTicketCalled(queue.screenId, {
      ticketNumber: formattedNum,
      deskName: queue.deskName,
      audioText
    });
  }

  return res.json({
    success: true,
    ticketNumber: ticket.ticketNumber,
    deskName: ticket.deskName,
    calledAt: ticket.calledAt
  });
});

/**
 * POST /api/queues/operator/call-specific
 * Operador digita um número específico para chamar (ex: preferencial P005)
 */
queueRoutes.post('/operator/call-specific', async (req: Request, res: Response): Promise<any> => {
  const { pinCode, customNumber } = req.body;
  if (!pinCode || typeof pinCode !== 'string' || !customNumber) {
    return res.status(400).json({ error: 'PIN e número específico são obrigatórios.' });
  }

  const queue = await prisma.ticketQueue.findFirst({
    where: { pinCode: pinCode.trim() },
    select: { id: true, deskName: true, screenId: true }
  });

  if (!queue) return res.status(401).json({ error: 'PIN inválido.' });

  const formattedNum = String(customNumber).trim().toUpperCase();

  const ticket = await prisma.queueTicket.create({
    data: {
      queueId: queue.id,
      ticketNumber: formattedNum,
      deskName: queue.deskName,
      status: 'CALLED'
    }
  });

  const spacedNumber = formattedNum.split('').join(' ');
  const audioText = `Senha ${spacedNumber}, ${queue.deskName}`;

  if (queue.screenId) {
    broadcastTicketCalled(queue.screenId, {
      ticketNumber: formattedNum,
      deskName: queue.deskName,
      audioText
    });
  }

  return res.json({
    success: true,
    ticketNumber: ticket.ticketNumber,
    deskName: ticket.deskName,
    calledAt: ticket.calledAt
  });
});

/**
 * POST /api/queues/operator/reset
 * Operador zera o contador da fila
 */
queueRoutes.post('/operator/reset', async (req: Request, res: Response): Promise<any> => {
  const { pinCode } = req.body;
  if (!pinCode || typeof pinCode !== 'string') {
    return res.status(400).json({ error: 'PIN de autenticação obrigatório.' });
  }

  const queue = await prisma.ticketQueue.findFirst({
    where: { pinCode: pinCode.trim() },
    select: { id: true }
  });

  if (!queue) return res.status(401).json({ error: 'PIN inválido.' });

  await prisma.ticketQueue.update({
    where: { id: queue.id },
    data: { currentNum: 0 }
  });

  return res.json({ success: true, message: 'Contador de senhas zerado com sucesso.' });
});

// ==========================================
// ADMIN ENDPOINTS (AUTHENTICATED MANAGER)
// ==========================================

/**
 * GET /api/queues/admin?tenantId=:tenantId
 */
queueRoutes.get('/admin', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const tenantId = tenantScope(req, req.query.tenantId as string | undefined);

    const queues = await prisma.ticketQueue.findMany({
      where: { tenantId },
      include: {
        screen: { select: { id: true, name: true, status: true } },
        _count: { select: { tickets: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json(queues);
  } catch (err: any) {
    return res.status(err.message === 'UNAUTHENTICATED' ? 401 : 400).json({ error: err.message || 'Erro ao buscar filas' });
  }
});

/**
 * POST /api/queues/admin
 * Admin cria uma nova fila de senhas com PIN
 */
queueRoutes.post('/admin', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const tenantId = tenantScope(req, req.body.tenantId);
    const { name, prefix, deskName, screenId, pinCode } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome da fila é obrigatório.' });
    }

    const cleanPin = typeof pinCode === 'string' && pinCode.trim() ? pinCode.trim() : Math.floor(1000 + Math.random() * 9000).toString();

    // Check PIN uniqueness
    const existingPin = await prisma.ticketQueue.findFirst({ where: { pinCode: cleanPin } });
    if (existingPin) {
      return res.status(400).json({ error: 'PIN já está em uso por outra fila. Escolha outro código.' });
    }

    let validatedScreenId: string | null = null;
    if (screenId) {
      const screen = await prisma.screen.findFirst({ where: { id: screenId, tenantId } });
      if (screen) validatedScreenId = screen.id;
    }

    const queue = await prisma.ticketQueue.create({
      data: {
        tenantId,
        name: name.trim(),
        prefix: (prefix || '').trim().toUpperCase(),
        deskName: (deskName || 'Guichê 01').trim(),
        screenId: validatedScreenId,
        pinCode: cleanPin
      },
      include: { screen: { select: { id: true, name: true } } }
    });

    return res.status(201).json(queue);
  } catch (err: any) {
    return res.status(err.message === 'UNAUTHENTICATED' ? 401 : 400).json({ error: err.message || 'Erro ao criar fila' });
  }
});

/**
 * DELETE /api/queues/admin/:id
 */
queueRoutes.delete('/admin/:id', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const tenantId = tenantScope(req, req.query.tenantId as string | undefined);
    const { id } = req.params;

    const queue = await prisma.ticketQueue.findFirst({ where: { id, tenantId } });
    if (!queue) return res.status(404).json({ error: 'Fila não encontrada.' });

    await prisma.ticketQueue.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(err.message === 'UNAUTHENTICATED' ? 401 : 400).json({ error: err.message || 'Erro ao excluir fila' });
  }
});
