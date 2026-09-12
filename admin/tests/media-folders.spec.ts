import { test, expect } from '@playwright/test';

for (const fails of [false, true]) {
  test(`media deletion ${fails ? 'shows failure and retains the count' : 'refreshes the folder count without reloading the page'}`, async ({ page }) => {
    let deleted = false;
    const alerts: string[] = [];
    page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
    await page.routeWebSocket('**/ws', ws => ws.onMessage(() => {}));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me') return route.fulfill({ json: { id: 'user', name: 'Teste', role: 'ADMIN_CLIENT', tenantId: 'tenant', tenant: { id: 'tenant' } } });
      if (path === '/api/media/item' && route.request().method() === 'DELETE') {
        if (fails) return route.fulfill({ status: 409, json: { error: 'Remova esta mídia do layout antes de excluí-la.' } });
        deleted = true; return route.fulfill({ json: { success: true } });
      }
      if (path === '/api/media') return route.fulfill({ json: deleted ? [] : [{ id: 'item', folderId: 'folder', name: 'Anúncio de teste', type: 'WEB_PAGE', url: 'https://example.invalid', durationSeconds: 10 }] });
      if (path === '/api/media/folders') return route.fulfill({ json: [{ id: 'folder', name: 'Ofertas', _count: { medias: deleted ? 0 : 1 } }] });
      return route.fulfill({ json: path.includes('/stats') ? { recentLogs: [], totalScreens: 0 } : [] });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Biblioteca de Mídias' }).click();
    await page.getByRole('button', { name: 'Ofertas (1)' }).click();
    await page.getByTitle('Excluir Mídia', { exact: true }).click();
    if (fails) {
      await expect.poll(() => alerts.length).toBeGreaterThan(0);
      expect(alerts[0]).toContain('Remova esta mídia');
      await expect(page.getByRole('button', { name: 'Ofertas (1)' })).toBeVisible();
      await expect(page.getByText('Anúncio de teste', { exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Ofertas (0)' })).toBeVisible();
      await expect(page.getByText('Anúncio de teste', { exact: true })).toHaveCount(0);
    }
  });
}
