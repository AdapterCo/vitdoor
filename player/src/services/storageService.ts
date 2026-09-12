// Persist data and acknowledge only the events actually accepted by the server.
export interface OfflineProofLog {
  id?: number;
  eventId: string;
  screenId: string;
  mediaId: string;
  mediaName: string;
  mediaVersion?: number;
  manifestVersion: number;
  campaignId?: string | null;
  zoneId?: string;
  playedAt: string;
  durationSeconds: number;
  completed: boolean;
  reason?: string;
  rejected?: boolean;
}
let connection: Promise<IDBDatabase> | undefined;
export function openDB(): Promise<IDBDatabase> {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('VitDoorPlayerDB', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('proofLogs')) db.createObjectStore('proofLogs', { keyPath: 'id', autoIncrement: true });
      const logs = request.transaction!.objectStore('proofLogs');
      if (!logs.indexNames.contains('screenId')) logs.createIndex('screenId', 'screenId');
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = undefined; }; resolve(request.result); };
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
  return connection;
}
async function write(storeName: string, action: (store: IDBObjectStore) => void) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function setCache(key: string, value: unknown) { return write('cache', s => { s.put(value, key); }); }
export async function getCache(key: string): Promise<any> {
  const db = await openDB();
  return new Promise((resolve, reject) => { const r = db.transaction('cache').objectStore('cache').get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function clearContentCache() { return write('cache', s => { s.clear(); }); }
export async function addProofLog(log: OfflineProofLog) { return write('proofLogs', s => { s.add(log); }); }
export async function getProofBatch(screenId: string, limit = 500): Promise<OfflineProofLog[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const out: OfflineProofLog[] = [];
    const request = db.transaction('proofLogs').objectStore('proofLogs').index('screenId').openCursor(IDBKeyRange.only(screenId));
    request.onsuccess = () => { const cursor = request.result; if (!cursor || out.length >= limit) { resolve(out); return; } if (!cursor.value.rejected) out.push(cursor.value); cursor.continue(); };
    request.onerror = () => reject(request.error);
  });
}
export async function acknowledgeProofBatch(batch: OfflineProofLog[], eventIds: string[], rejectedEventIds: string[]) {
  const accepted = new Set(eventIds), rejected = new Set(rejectedEventIds);
  return write('proofLogs', store => {
    for (const log of batch) {
      if (log.id === undefined) continue;
      if (accepted.has(log.eventId)) store.delete(log.id);
      else if (rejected.has(log.eventId) || !log.eventId) store.put({ ...log, rejected: true });
    }
  });
}
