import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from '../lib/validation.js';
export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return void res.status(error.status).json({ error: error.message });
  if (error instanceof multer.MulterError) return void res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Arquivo excede o limite permitido.' : 'Upload inválido.' });
  if (error?.type === 'entity.too.large') return void res.status(413).json({ error: 'Requisição excede o limite permitido.' });
  if (error instanceof SyntaxError || error?.name === 'PrismaClientValidationError') return void res.status(400).json({ error: 'Dados da requisição inválidos.' });
  if (error?.code === 'P2002') return void res.status(409).json({ error: 'Registro já cadastrado. Use outro valor.' });
  if (error?.code === 'P2025') return void res.status(404).json({ error: 'Registro não encontrado.' });
  if (error?.code === 'P2003') return void res.status(409).json({ error: 'Este registro ainda possui vínculos.' });
  console.error(JSON.stringify({ event: 'request_error', requestId: res.getHeader('X-Request-Id'), code: error?.code || 'INTERNAL' }));
  res.status(500).json({ error: 'Erro interno do servidor. Tente novamente.', requestId: res.getHeader('X-Request-Id') });
};
