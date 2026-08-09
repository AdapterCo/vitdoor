import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';

function limitedMessage(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ error: message });
  };
}

const commonOptions = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  validate: true
};

export const apiRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60_000,
  limit: 300,
  handler: limitedMessage('Muitas requisições. Aguarde um minuto e tente novamente.')
});

export const loginRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  handler: limitedMessage('Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.')
});

export const pairingCreationRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60_000,
  limit: 30,
  handler: limitedMessage('Muitos códigos de ativação solicitados. Aguarde antes de gerar outro código.')
});

export const pairingStatusRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: 5 * 60_000,
  limit: 600,
  handler: limitedMessage('Consultas de ativação em excesso. Aguarde alguns minutos.')
});

export const uploadRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60_000,
  limit: 30,
  handler: limitedMessage('Limite temporário de uploads atingido. Aguarde antes de enviar novos arquivos.')
});

let activeUploads = 0;
const MAX_CONCURRENT_UPLOADS = 2;

export function uploadConcurrencyLimiter(_req: Request, res: Response, next: NextFunction): void {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) {
    res.setHeader('Retry-After', '30');
    res.status(503).json({ error: 'Servidor processando outros uploads. Tente novamente em alguns segundos.' });
    return;
  }
  activeUploads += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeUploads = Math.max(0, activeUploads - 1);
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}
