import { API_BASE } from './config';

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem('token') || localStorage.getItem('vitdoor_token');
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(path.startsWith('http') ? path : `${API_BASE}${path}`, { ...init, headers, credentials: 'include', signal: init.signal || AbortSignal.timeout(init.body instanceof FormData ? 600_000 : 60_000) });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    response = new Response(JSON.stringify({ error: 'Falha de conexão. Seus dados não foram confirmados. Tente novamente.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  if (response.status === 401 && !path.includes('/auth/login')) {
    window.dispatchEvent(new Event('vitdoor:logout'));
  }
  if (!response.ok && response.status !== 401 && !path.includes('/auth/')) {
    const body = await response.clone().json().catch(() => ({}));
    window.dispatchEvent(new CustomEvent('vitdoor:api-error', { detail: body.error || `Falha ao concluir a operação (${response.status}).` }));
  }
  return response;
}
