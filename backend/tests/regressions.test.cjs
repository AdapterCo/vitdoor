const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
process.env.JWT_SECRET = 'test-device-secret-only-not-for-production';
process.env.ADMIN_JWT_SECRET = 'test-admin-secret-only-not-for-production';
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/never_connect';
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../dist/lib/prisma.js');
const { Router } = require('../dist/lib/router.js');
const { errorHandler } = require('../dist/middleware/errors.js');
const { HttpError, passwordError } = require('../dist/lib/validation.js');
const { createAdminSession, verifyAdminSession } = require('../dist/lib/adminSessions.js');
const { authenticate } = require('../dist/middleware/auth.js');
const { authRoutes } = require('../dist/routes/authRoutes.js');
const { emergencyRoutes } = require('../dist/routes/emergencyRoutes.js');
const { queueRoutes } = require('../dist/routes/queueRoutes.js');
const { qrRoutes } = require('../dist/routes/qrRoutes.js');
const { publicReportRoutes } = require('../dist/routes/publicReportRoutes.js');
const { completeCommand } = require('../dist/lib/websocket.js');
const { localStoragePath } = require('../dist/lib/storage.js');
const { proofOfPlayRoutes, normalizeProofEvent } = require('../dist/routes/proofOfPlayRoutes.js');
const { safeFeedUrl, isPublicAddress } = require('../dist/lib/safeHttp.js');
const { campaignIsActive } = require('../dist/lib/schedule.js');
const { validateCampaign } = require('../dist/lib/campaignValidation.js');
const users = new Map(), sessions = new Map();
for (const [model, methods] of [['media', ['findFirst']], ['qrScan', ['create']], ['remoteCommand', ['findFirst', 'updateMany']]]) {
  for (const method of methods) prisma[model][method] = async () => { throw new Error('Unexpected fixture call'); };
}
let mutations = 0, server, base, deviceFailure = false;
// Explicit in-memory fixture: these tests never connect to a developer database.
prisma.user.findUnique = async ({ where }) => [...users.values()].find(u => u.id === where.id || u.email === where.email) || null;
prisma.user.findUniqueOrThrow = async q => { const u = await prisma.user.findUnique(q); if (!u) throw new Error('Fixture user missing'); return { ...u }; };
prisma.user.updateMany = async ({ where, data }) => {
  const u = users.get(where.id); if (!u || u.passwordHash !== where.passwordHash || u.sessionVersion !== where.sessionVersion) return { count: 0 };
  Object.assign(u, { passwordHash: data.passwordHash, sessionVersion: u.sessionVersion + 1 }); return { count: 1 };
};
prisma.adminSession.create = async ({ data }) => { const s = { ...data, id: randomUUID() }; sessions.set(s.id, s); return s; };
prisma.adminSession.findUnique = async ({ where }) => { const s = sessions.get(where.id); return s ? { ...s, user: users.get(s.userId) } : null; };
prisma.adminSession.deleteMany = async ({ where }) => { let count = 0; for (const [id, s] of sessions) if (id === where.id || s.userId === where.userId) { sessions.delete(id); count++; } return { count }; };
prisma.$transaction = async fn => fn(prisma);
prisma.screen.count = async ({ where }) => where.id.in.every(id => id === 'own-screen') ? where.id.in.length : 0;
prisma.screen.findFirst = async () => { if (deviceFailure) throw new Error('Database unavailable'); return { id: 'screen', tenantId: 'tenant', tenant: { status: 'ACTIVE' } }; };
prisma.emergencyAlertTarget.deleteMany = async () => { mutations++; return { count: 1 }; };
prisma.emergencyAlert.findMany = async () => [];
prisma.emergencyAlert.updateMany = async () => { mutations++; return { count: 1 }; };
before(async () => {
  const app = express(); app.use(express.json(), cookieParser());
  app.use('/auth', authRoutes); app.use('/emergency', authenticate, emergencyRoutes); app.use('/queues', queueRoutes); app.use('/proof', proofOfPlayRoutes);
  app.use('/r', qrRoutes); app.use('/report', publicReportRoutes);
  const router = Router(); router.get('/expected', async () => { await Promise.resolve(); throw new HttpError(409, 'conflict'); });
  router.get('/unexpected', async () => { throw new Error('secret internal error'); }); app.use('/errors', router); app.use(errorHandler);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); }); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });
function mockMethod(t, object, name, fn) { const original = object[name]; object[name] = fn; t.after(() => { object[name] = original; }); }
async function fixture(role = 'ADMIN_CLIENT') {
  const id = randomUUID(); const u = { id, tenantId: 'tenant', name: 'Test', email: `${id}@example.invalid`, passwordHash: await bcrypt.hash('current-password-123', 4), sessionVersion: 1, role, active: true, tenant: { id: 'tenant', status: 'ACTIVE', name: 'Test tenant' } };
  users.set(id, u); return { user: u, token: await createAdminSession(u) };
}
async function request(path, token, body) { return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
test('async router forwards rejected promises and hides internal errors', async () => {
  const expected = await request('/errors/expected'); assert.equal(expected.status, 409); assert.equal((await expected.json()).error, 'conflict');
  const unexpected = await request('/errors/unexpected'); assert.equal(unexpected.status, 500); assert.doesNotMatch(await unexpected.text(), /secret internal/);
});
test('password policy rejects short and bcrypt-truncated UTF-8 passwords', () => {
  assert.ok(passwordError('short')); assert.ok(passwordError('é'.repeat(37))); assert.equal(passwordError('é'.repeat(36)), null);
});
test('password change requires current password, rotates hash and revokes ALL previous sessions', async () => {
  const { user, token } = await fixture(); const other = await createAdminSession(user); const oldHash = user.passwordHash;
  const wrong = await request('/auth/change-password', token, { currentPassword: 'wrong', newPassword: 'new-password-456' }); assert.equal(wrong.status, 400); assert.equal(user.passwordHash, oldHash);
  const same = await request('/auth/change-password', token, { currentPassword: 'current-password-123', newPassword: 'current-password-123' }); assert.equal(same.status, 400);
  const changed = await request('/auth/change-password', token, { currentPassword: 'current-password-123', newPassword: 'new-password-456', userId: 'someone-else' }); assert.equal(changed.status, 200);
  assert.ok(await bcrypt.compare('new-password-456', user.passwordHash)); assert.equal(await bcrypt.compare('current-password-123', user.passwordHash), false);
  await assert.rejects(verifyAdminSession(token)); await assert.rejects(verifyAdminSession(other));
  const cookie = changed.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Strict/i);
  const fresh = decodeURIComponent(cookie.split(';')[0].split('=')[1]); assert.equal((await verifyAdminSession(fresh)).user.id, user.id);
  assert.equal([...sessions.values()].filter(s => s.userId === user.id).length, 1);
});
test('password endpoint is authenticated and rate-limited per account', async () => {
  assert.equal((await request('/auth/change-password', '', {})).status, 401);
  const { token } = await fixture(); for (let i = 0; i < 5; i++) assert.equal((await request('/auth/change-password', token, { newPassword: 'short' })).status, 400);
  assert.equal((await request('/auth/change-password', token, { newPassword: 'short' })).status, 429);
});
test('logout revokes current session and authorization reads current database role', async () => {
  const { user, token } = await fixture(); user.role = 'VIEWER'; assert.equal((await verifyAdminSession(token)).user.role, 'VIEWER');
  assert.equal((await request('/auth/logout', token, {})).status, 204); await assert.rejects(verifyAdminSession(token));
});
test('expired and pre-migration admin JWTs cannot authorize', async () => {
  const { user, token } = await fixture(); const claims = jwt.decode(token); sessions.get(claims.sessionId).expiresAt = new Date(0); await assert.rejects(verifyAdminSession(token));
  const legacy = jwt.sign({ userId: user.id, tenantId: user.tenantId, type: 'ADMIN' }, process.env.ADMIN_JWT_SECRET); await assert.rejects(verifyAdminSession(legacy));
});
test('clearing another tenant screen is rejected before any side effect; own screen succeeds', async () => {
  const { token } = await fixture(); mutations = 0;
  assert.equal((await request('/emergency/clear', token, { screenIds: ['foreign-screen'] })).status, 403); assert.equal(mutations, 0);
  assert.equal((await request('/emergency/clear', token, { screenIds: ['own-screen'] })).status, 200); assert.equal(mutations, 1);
});
test('VIEWER cannot read queue admin secrets or mutate queues', async () => {
  const { token } = await fixture('VIEWER'); assert.equal((await request('/queues/admin', token)).status, 403); assert.equal((await request('/queues/admin', token, {})).status, 403);
});
test('RSS rejects private/reserved addresses, encoded IPs, credentials and non-HTTPS URLs', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254', '172.16.0.1', '192.168.0.1', '198.18.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  for (const url of ['http://example.com/rss', 'https://2130706433/rss', 'https://0x7f000001/', 'https://127.1/', 'https://user:pass@example.com', 'https://example.com:8443', 'https://[::1]/']) assert.throws(() => safeFeedUrl(url), url);
  for (const ip of ['2001::1', '2001:0000::1', '2001:0db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('2001:4860:4860::8888'), true);
  assert.equal(safeFeedUrl('https://example.com/rss').hostname, 'example.com'); assert.equal(isPublicAddress('8.8.8.8'), true);
});
test('campaign validation preserves paused/null limit and rejects invalid dates/status/hours', () => {
  const valid = { name: 'Campaign', startDate: '2026-09-01', endDate: '2026-09-30', status: 'PAUSED', maxImpressions: null };
  const result = validateCampaign(valid); assert.equal(result.status, 'PAUSED'); assert.equal(result.maxImpressions, null);
  for (const bad of [{ startDate: '2026-02-30' }, { endDate: '2025-01-01' }, { startTime: '24:00' }, { status: 'BOGUS' }, { daysOfWeek: '1,1' }, { maxImpressions: -1 }, { timezone: 'not/a-zone' }]) assert.throws(() => validateCampaign({ ...valid, ...bad }));
});
test('overnight campaign uses start day in declared timezone across midnight', () => {
  const c = { startDate: '2026-09-11', endDate: '2026-09-11', daysOfWeek: '5', startTime: '22:00', endTime: '02:00', timezone: 'America/Sao_Paulo' };
  assert.equal(campaignIsActive(c, new Date('2026-09-12T04:00:00Z')), true); assert.equal(campaignIsActive(c, new Date('2026-09-12T06:00:00Z')), false);
});
test('proof validation preserves identity and incomplete status, rejects invented IDs and stale events', () => {
  const good = { eventId: randomUUID(), screenId: randomUUID(), mediaId: randomUUID(), mediaName: 'Media', manifestVersion: 1, durationSeconds: 3, completed: false, playedAt: new Date().toISOString() };
  assert.equal(normalizeProofEvent(good).eventId, good.eventId); assert.equal(normalizeProofEvent(good).completed, false);
  for (const bad of [{ eventId: 'invalid' }, { mediaId: null }, { manifestVersion: 0 }, { durationSeconds: -1 }, { completed: 'true' }, { playedAt: '2000-01-01' }]) assert.equal(normalizeProofEvent({ ...good, ...bad }), null);
});
test('database outage returns 500, not credential revocation that would erase player pairing', async () => {
  deviceFailure = true;
  const token = jwt.sign({ type: 'DEVICE', screenId: 'screen', tenantId: 'tenant', version: 1 }, process.env.JWT_SECRET);
  try { assert.equal((await request('/proof/log', token, {})).status, 500); } finally { deviceFailure = false; }
});
test('QR validates screen tenancy and never invents a screen for a generic link', async t => {
  const mediaId = randomUUID(), ownScreen = randomUUID(), foreignScreen = randomUUID(); const scans = [];
  mockMethod(t, prisma.media, 'findFirst', async () => ({ id: mediaId, tenantId: 'tenant', name: 'CTA', ctaJson: JSON.stringify({ enabled: true, mode: 'DIRECT', type: 'URL', target: 'https://example.com/' }) }));
  mockMethod(t, prisma.screen, 'findFirst', async ({ where }) => { assert.equal(where.tenantId, 'tenant'); return where.id === ownScreen ? { id: ownScreen } : null; });
  mockMethod(t, prisma.qrScan, 'create', async ({ data }) => { scans.push(data); return data; });
  const foreign = await fetch(`${base}/r/${mediaId}?s=${foreignScreen}`, { redirect: 'manual' }); assert.equal(foreign.status, 404); assert.equal(scans.length, 0);
  const own = await fetch(`${base}/r/${mediaId}?s=${ownScreen}`, { redirect: 'manual' }); assert.equal(own.status, 302); assert.equal(scans[0].screenId, ownScreen);
  const generic = await fetch(`${base}/r/${mediaId}`, { redirect: 'manual' }); assert.equal(generic.status, 302); assert.equal(scans[1].screenId, null);
});
test('media UUID alone does not expose a report; token lookup requires hash, expiry and active tenant', async t => {
  let queries = 0;
  mockMethod(t, prisma.media, 'findFirst', async ({ where }) => { queries++; assert.equal(where.reportTokenHash.length, 64); assert.ok(where.reportExpiresAt.gt instanceof Date); assert.equal(where.tenant.status, 'ACTIVE'); return null; });
  const id = randomUUID(); assert.equal((await request(`/report/media/${id}`)).status, 404); assert.equal(queries, 0);
  assert.equal((await request(`/report/media/${id}?token=${'a'.repeat(43)}`)).status, 404); assert.equal(queries, 1);
});
test('command acknowledgement is conditional and cannot fake successful screenshot upload', async t => {
  let writes = 0; let action = 'REBOOT';
  mockMethod(t, prisma.remoteCommand, 'findFirst', async () => ({ action, status: 'SENT', expiresAt: new Date(Date.now() + 60000) }));
  mockMethod(t, prisma.remoteCommand, 'updateMany', async ({ where }) => { writes++; assert.deepEqual(where.status.in, ['PENDING', 'SENT']); assert.ok(where.expiresAt.gt instanceof Date); return { count: 0 }; });
  assert.equal(await completeCommand('screen', 'command', true, 'done', 'REBOOT'), null); assert.equal(writes, 1);
  action = 'TAKE_SCREENSHOT'; assert.equal(await completeCommand('screen', 'command', true, 'done', action), null); assert.equal(writes, 1);
});
test('storage rejects traversal outside public and private roots', () => {
  for (const key of ['../escape', '..\\escape']) { assert.throws(() => localStoragePath(key)); assert.throws(() => localStoragePath(key, true)); }
  assert.match(localStoragePath('tenants/test/media/file.jpg'), /file\.jpg$/);
});
