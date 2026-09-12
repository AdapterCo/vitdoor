import { test, expect } from '@playwright/test';
test('single image loops produce proofs after playback, retaining manifest and media identity', async ({ page }) => {
  const screenId = '10000000-0000-4000-8000-000000000001';
  const mediaId = '20000000-0000-4000-8000-000000000001';
  const proofs: any[] = [];
  const media = { id: mediaId, name: 'Test image', version: 2, type: 'IMAGE', url: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iMzYwIj48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjM2MCIgZmlsbD0iIzI1NjNlYiIvPjwvc3ZnPg==', durationSeconds: 1 };
  await page.addInitScript(async ({ screenId }) => {
    localStorage.setItem('vitdoor_device_token', 'test-token');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('VitDoorPlayerDB', 2);
      request.onupgradeneeded = () => { request.result.createObjectStore('cache'); const proofs = request.result.createObjectStore('proofLogs', { keyPath: 'id', autoIncrement: true }); proofs.createIndex('screenId', 'screenId'); };
      request.onsuccess = () => { const db = request.result; const tx = db.transaction('cache', 'readwrite'); tx.objectStore('cache').put({ id: screenId, orientation: 'HORIZONTAL' }, 'screenInfo'); tx.oncomplete = () => { db.close(); resolve(); }; };
      request.onerror = () => reject(request.error);
    });
  }, { screenId });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/manifest')) return route.fulfill({ json: { version: 7, screen: { id: screenId, volume: 0 }, activeLayout: null, activePlaylist: { id: 'playlist', items: [{ media, durationSeconds: 1 }] }, campaigns: [], assets: [media] } });
    if (path.endsWith('/log-batch')) { const items = route.request().postDataJSON().items; proofs.push(...items); return route.fulfill({ json: { eventIds: items.map((i: any) => i.eventId), rejectedEventIds: [] } }); }
    return route.fulfill({ json: { activeAlert: null, deviceToken: 'test-token' } });
  });
  await page.routeWebSocket('**/ws', ws => ws.onMessage(() => {}));
  await page.goto('http://127.0.0.1:3101');
  await expect(page.getByAltText('Test image')).toBeVisible();
  await expect.poll(() => proofs.filter(p => p.completed).length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  const complete = proofs.filter(p => p.completed);
  expect(complete[0].eventId).not.toEqual(complete[1].eventId);
  for (const p of complete) { expect(p.screenId).toBe(screenId); expect(p.mediaId).toBe(mediaId); expect(p.mediaVersion).toBe(2); expect(p.manifestVersion).toBe(7); expect(p.durationSeconds).toBeGreaterThanOrEqual(1); }
});
