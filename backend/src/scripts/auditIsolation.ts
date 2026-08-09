const baseUrl = (process.env.AUDIT_API_URL || 'http://127.0.0.1:4000/api').replace(/\/$/, '');
const masterEmail = process.env.ADMIN_EMAIL;
const masterPassword = process.env.ADMIN_PASSWORD;

if (!masterEmail || !masterPassword) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD para executar a auditoria.');

type Session = { token: string; tenantId: string; email: string };

async function request(path: string, options: RequestInit = {}, session?: Session) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login(email: string, password: string): Promise<Session> {
  const { response, body } = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error(`Login falhou para ${email}: ${body.error || response.status}`);
  return { token: body.token, tenantId: body.user.tenantId, email };
}

async function createTenant(master: Session, suffix: string, index: number) {
  const email = `audit-${suffix}-${index}@vitdoor.invalid`;
  const password = `Audit!${suffix}${index}`;
  const { response, body } = await request('/tenants', { method: 'POST', body: JSON.stringify({
    name: `AUDIT ${suffix} Cliente ${index}`, slug: `audit-${suffix}-${index}`, maxScreens: 2, maxStorageMb: 100,
    adminName: `Auditor ${index}`, adminEmail: email, adminPassword: password
  }) }, master);
  if (!response.ok) throw new Error(`Criação do cliente ${index} falhou: ${body.error || response.status}`);
  return { tenantId: body.id, email, password };
}

async function createFixture(session: Session, suffix: string) {
  const folder = await request('/media/folders', { method: 'POST', body: JSON.stringify({ tenantId: session.tenantId, name: `Pasta ${suffix}` }) }, session);
  if (!folder.response.ok) throw new Error(`Pasta ${suffix}: ${folder.body.error}`);
  const media = await request('/media/widget', { method: 'POST', body: JSON.stringify({ tenantId: session.tenantId, folderId: folder.body.id, name: `Mídia ${suffix}`, type: 'WEB_PAGE', url: 'https://example.com', durationSeconds: 10 }) }, session);
  if (!media.response.ok) throw new Error(`Mídia ${suffix}: ${media.body.error}`);
  const layoutConfig = { version: 2, preset: 'FULL', zones: [{ id: 'main', name: 'Principal', widthPercent: 100, fit: 'CONTAIN', audioEnabled: true, items: [{ mediaId: media.body.id }] }] };
  const layout = await request('/layouts', { method: 'POST', body: JSON.stringify({ tenantId: session.tenantId, name: `Layout ${suffix}`, canvasConfigJson: layoutConfig, screenIds: [] }) }, session);
  if (!layout.response.ok) throw new Error(`Layout ${suffix}: ${layout.body.error}`);
  const playlist = await request('/playlists', { method: 'POST', body: JSON.stringify({ tenantId: session.tenantId, name: `Playlist ${suffix}`, items: [{ mediaId: media.body.id, durationSeconds: 10 }], screenIds: [] }) }, session);
  if (!playlist.response.ok) throw new Error(`Playlist ${suffix}: ${playlist.body.error}`);
  const campaign = await request('/campaigns', { method: 'POST', body: JSON.stringify({ tenantId: session.tenantId, name: `Campanha ${suffix}`, playlistId: playlist.body.id, startDate: new Date().toISOString(), endDate: new Date(Date.now() + 86400000).toISOString() }) }, session);
  if (!campaign.response.ok) throw new Error(`Campanha ${suffix}: ${campaign.body.error}`);
  return { folder: folder.body, media: media.body, layout: layout.body, playlist: playlist.body, campaign: campaign.body };
}

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`FALHA: ${message}`); }

async function main() {
  const suffix = Date.now().toString(36);
  const master = await login(masterEmail!, masterPassword!);
  const clients = [await createTenant(master, suffix, 1), await createTenant(master, suffix, 2)];
  try {
    const sessions = [await login(clients[0].email, clients[0].password), await login(clients[1].email, clients[1].password)];
    const fixtures = [await createFixture(sessions[0], `${suffix}-1`), await createFixture(sessions[1], `${suffix}-2`)];
    for (let i = 0; i < 2; i++) {
      const other = i === 0 ? 1 : 0;
      for (const route of ['/media', '/media/folders', '/layouts', '/playlists', '/campaigns']) {
        const result = await request(`${route}?tenantId=${sessions[i].tenantId}`, {}, sessions[i]);
        assert(result.response.ok, `${sessions[i].email} não conseguiu listar ${route}`);
        const ids = Array.isArray(result.body) ? result.body.map((item: any) => item.id) : [];
        const fixtureKey = ({ '/media': 'media', '/media/folders': 'folder', '/layouts': 'layout', '/playlists': 'playlist', '/campaigns': 'campaign' } as Record<string, string>)[route];
        assert(!ids.includes((fixtures[other] as any)[fixtureKey].id), `${route} vazou entre clientes`);
      }
      const foreignMedia = await request(`/media/${fixtures[other].media.id}`, { method: 'PUT', body: JSON.stringify({ tenantId: sessions[i].tenantId, name: 'INVASÃO' }) }, sessions[i]);
      assert(foreignMedia.response.status === 404, 'edição cruzada de mídia não foi bloqueada');
      const foreignLayout = await request('/layouts', { method: 'POST', body: JSON.stringify({ tenantId: sessions[i].tenantId, name: 'Layout invasor', canvasConfigJson: { zones: [{ id: 'main', items: [{ mediaId: fixtures[other].media.id }] }] } }) }, sessions[i]);
      assert(foreignLayout.response.status === 400, 'mídia estrangeira foi aceita dentro do layout');
      const stats = await request(`/proof-of-play/stats?tenantId=${sessions[i].tenantId}`, {}, sessions[i]);
      assert(stats.response.ok && stats.body.totalScreens === 0 && stats.body.totalPlays === 0, 'relatório não respeitou o espaço individual');
    }
    const masterCross = await request(`/media?tenantId=${sessions[0].tenantId}`, {}, master);
    assert(!masterCross.response.ok, 'master conseguiu abrir diretamente a biblioteca do cliente');
    console.log('AUDITORIA APROVADA: master + dois clientes isolados em mídias, pastas, layouts, playlists, campanhas e relatórios.');
  } finally {
    for (const client of clients) await request(`/tenants/${client.tenantId}`, { method: 'PUT', body: JSON.stringify({ status: 'SUSPENDED' }) }, master);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
