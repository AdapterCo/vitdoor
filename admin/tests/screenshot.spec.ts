import { test, expect } from '@playwright/test';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
test('dashboard loads screenshot through authenticated API, ignoring a different public origin', async ({ page, context }) => {
  let authorizedRequest = false, wrongOriginRequested = false;
  await context.addCookies([{ name: 'vitdoor_session', value: 'test-only', url: 'http://127.0.0.1:3100', httpOnly: true, sameSite: 'Strict' }]);
  await page.route('https://wrong-origin.example.invalid/**', async route => { wrongOriginRequested = true; await route.abort(); });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'user', name: 'Test', role: 'ADMIN_CLIENT', tenantId: 'tenant', tenant: { id: 'tenant' } } });
    if (path === '/api/screens') return route.fulfill({ json: [{ id: 'screen', name: 'TV', status: 'ONLINE', lastScreenshotUrl: 'https://wrong-origin.example.invalid/api/screens/screen/screenshot?v=1' }] });
    if (path === '/api/screens/screen/screenshot') { authorizedRequest = (route.request().headers().cookie || '').includes('vitdoor_session=test-only'); return route.fulfill({ body: png, contentType: 'image/png' }); }
    return route.fulfill({ json: path.includes('/stats') ? { recentLogs: [], totalScreens: 1, onlineScreens: 1 } : [] });
  });
  await page.routeWebSocket('**/ws', ws => ws.onMessage(() => {}));
  await page.goto('/');
  const img = page.getByAltText('Último screenshot capturado');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
  expect(authorizedRequest).toBe(true); expect(wrongOriginRequested).toBe(false);
});

test('missing screenshot shows an actionable error instead of a broken image', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'user', name: 'Test', role: 'ADMIN_CLIENT', tenantId: 'tenant', tenant: { id: 'tenant' } } });
    if (path === '/api/screens') return route.fulfill({ json: [{ id: 'screen', name: 'TV', status: 'ONLINE', lastScreenshotUrl: '/api/screens/screen/screenshot' }] });
    if (path === '/api/screens/screen/screenshot') return route.fulfill({ status: 404, json: { error: 'Arquivo de captura ausente. Solicite uma nova captura.' } });
    return route.fulfill({ json: path.includes('/stats') ? { recentLogs: [], totalScreens: 1, onlineScreens: 1 } : [] });
  });
  await page.routeWebSocket('**/ws', ws => ws.onMessage(() => {}));
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Tentar carregar novamente' })).toBeVisible();
  await expect(page.getByAltText('Último screenshot capturado')).toHaveCount(0);
});
