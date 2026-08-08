const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');

export const API_BASE = configuredApiUrl ? `${configuredApiUrl}/api` : '/api';

export function getWebSocketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined;
  if (configured) return configured;

  const apiOrigin = configuredApiUrl || window.location.origin;
  const url = new URL(apiOrigin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  return url.toString();
}
