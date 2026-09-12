import { getProofBatch, acknowledgeProofBatch } from './storageService';
import { API_BASE } from '../config';
let syncing = false;
let retryAt = 0;
let failures = 0;
export async function syncProofLogs(screenId: string, token: string) {
  if (syncing || !token || Date.now() < retryAt) return;
  syncing = true;
  try {
    for (let page = 0; page < 20; page++) {
      const batch = await getProofBatch(screenId);
      if (!batch.length) break;
      const response = await fetch(`${API_BASE}/proof-of-play/log-batch`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ items: batch }), signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Proof sync HTTP ${response.status}`);
      const result = await response.json();
      if (!Array.isArray(result.eventIds) || !Array.isArray(result.rejectedEventIds)) throw new Error('Confirmação de lote inválida.');
      await acknowledgeProofBatch(batch, result.eventIds, result.rejectedEventIds);
      if (result.rejectedEventIds.length) console.warn('Eventos de reprodução em quarentena:', result.rejectedEventIds.length);
      if (!result.eventIds.length && !result.rejectedEventIds.length) break;
    }
    failures = 0; retryAt = 0;
  } catch { failures++; retryAt = Date.now() + Math.min(300_000, 2000 * 2 ** Math.min(failures, 8)); }
  finally { syncing = false; }
}
