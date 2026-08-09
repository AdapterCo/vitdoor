import { API_BASE } from './config';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const response = await fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && !path.includes('/auth/login')) {
    window.dispatchEvent(new Event('vitdoor:logout'));
  }
  return response;
}
