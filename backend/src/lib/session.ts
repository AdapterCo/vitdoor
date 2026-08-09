import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE_NAME = 'vitdoor_session';

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60 * 1000
  };
}

export function getSessionToken(req: Request): string {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken) return cookieToken;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : '';
}

export function readCookie(header: string | undefined, name: string): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}
