// IndexedDB local caching service for offline resilience

const DB_NAME = 'VitDoorPlayerDB';
const DB_VERSION = 1;

export interface OfflineProofLog {
  id?: number;
  screenId: string;
  mediaName: string;
  playedAt: string;
  durationSeconds: number;
  completed: boolean;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache');
      }
      if (!db.objectStoreNames.contains('proofLogs')) {
        db.createObjectStore('proofLogs', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function setCache(key: string, value: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    const store = tx.objectStore('cache');
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCache(key: string): Promise<any> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readonly');
    const store = tx.objectStore('cache');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addProofLog(log: OfflineProofLog): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('proofLogs', 'readwrite');
    const store = tx.objectStore('proofLogs');
    store.add(log);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllProofLogs(): Promise<OfflineProofLog[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('proofLogs', 'readonly');
    const store = tx.objectStore('proofLogs');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function clearProofLogs(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('proofLogs', 'readwrite');
    const store = tx.objectStore('proofLogs');
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
