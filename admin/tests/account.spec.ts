import { test, expect } from '@playwright/test';
test('user changes their password, corrects mismatched confirmation and sees success', async ({ page }) => {
  let sent: any = null;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: any = [];
    if (path === '/api/auth/me') body = { id: 'user-a', name: 'Usuário de teste', email: 'teste@example.invalid', role: 'ADMIN_CLIENT', tenantId: 'tenant-a', tenant: { id: 'tenant-a', name: 'Cliente de teste' } };
    if (path.includes('/stats')) body = { totalPlays: 0, totalScreens: 0, onlineScreens: 0, recentLogs: [] };
    if (path === '/api/auth/change-password') { sent = route.request().postDataJSON(); body = { message: 'Senha alterada. As outras sessões foram encerradas.' }; }
    await route.fulfill({ json: body });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Minha conta' }).click();
  await page.getByLabel('Senha atual', { exact: true }).fill('current-password-123');
  await page.getByLabel('Nova senha', { exact: true }).fill('new-password-456');
  await page.getByLabel('Confirmar nova senha').fill('different-password');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('alert')).toContainText('não corresponde'); expect(sent).toBeNull();
  await page.getByLabel('Confirmar nova senha').fill('new-password-456');
  await page.screenshot({ path: 'test-results/minha-conta.png', fullPage: true });
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('status')).toContainText('Senha alterada');
  expect(sent).toEqual({ currentPassword: 'current-password-123', newPassword: 'new-password-456' });
  await expect(page.getByLabel('Senha atual', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Nova senha', { exact: true })).toHaveValue('');
});
test('server rejection preserves password form so the user can correct it', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { id: 'u', name: 'Teste', email: 'teste@example.invalid', role: 'VIEWER', tenantId: 't', tenant: { id: 't' } } });
    if (path === '/api/auth/change-password') return route.fulfill({ status: 400, json: { error: 'Senha atual incorreta.' } });
    return route.fulfill({ json: path.includes('/stats') ? { recentLogs: [] } : [] });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Minha conta' }).click();
  await page.getByLabel('Senha atual', { exact: true }).fill('wrong-password');
  await page.getByLabel('Nova senha', { exact: true }).fill('new-password-456');
  await page.getByLabel('Confirmar nova senha').fill('new-password-456');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('alert')).toHaveText('Senha atual incorreta.');
  await expect(page.getByLabel('Nova senha', { exact: true })).toHaveValue('new-password-456');
  await expect(page.getByRole('button', { name: 'Salvar nova senha' })).toBeEnabled();
});
