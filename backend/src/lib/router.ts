import { Router as ExpressRouter, type RequestHandler, type ErrorRequestHandler } from 'express';

/** Express 4 does not forward rejected handler promises to the error middleware. */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => { Promise.resolve().then(() => handler(req, res, next)).catch(next); };
}

export function Router(): ReturnType<typeof ExpressRouter> {
  const router = ExpressRouter();
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'use'] as const) {
    const original = (router[method] as Function).bind(router);
    (router as any)[method] = (...args: any[]) => original(...args.map(function wrap(value: any): any {
      if (Array.isArray(value)) return value.map(wrap);
      if (typeof value !== 'function' || value.length === 4) return value as ErrorRequestHandler;
      return asyncHandler(value);
    }));
  }
  return router;
}
