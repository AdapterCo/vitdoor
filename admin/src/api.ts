import { API_BASE } from './config';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('vitdoor_token');
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401 && !path.includes('/auth/login')) {
    localStorage.removeItem('vitdoor_token');
    window.dispatchEvent(new Event('vitdoor:logout'));
  }
  return response;
}
