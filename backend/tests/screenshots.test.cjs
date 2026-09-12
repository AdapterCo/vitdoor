const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/never_connect';
process.env.R2_ACCOUNT_ID = 'test-account';
process.env.R2_ACCESS_KEY_ID = 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
process.env.R2_BUCKET_NAME = 'test-bucket';
process.env.R2_PUBLIC_URL = 'https://media.example.invalid';
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { prisma } = require('../dist/lib/prisma.js');
const { saveScreenshot, persistScreenshot, assertStorageConfiguration, legacyScreenshotLocation, readStoredScreenshot } = require('../dist/lib/storage.js');
const { screenDto } = require('../dist/lib/dto.js');
test('legacy screenshot resolver only accepts configured storage and the authorized screen prefix', () => {
  process.env.R2_PUBLIC_URL = 'https://media.example.invalid';
  process.env.PUBLIC_BASE_URL = 'https://api.example.invalid';
  const filename = '1720000000000-10000000-0000-4000-8000-000000000001.jpg';
  const screen = { id: 'screen', tenantId: 'tenant', lastScreenshotUrl: `https://media.example.invalid/tenants/tenant/screenshots/screen/${filename}` };
  assert.deepEqual(legacyScreenshotLocation(screen), { kind: 'r2', key: `tenants/tenant/screenshots/screen/${filename}` });
  for (const url of [`https://evil.invalid/${filename}`, `https://media.example.invalid/tenants/foreign/screenshots/screen/${filename}`, `https://media.example.invalid/tenants/tenant/screenshots/other/${filename}`, `https://media.example.invalid/tenants/tenant/screenshots/screen/../../${filename}`]) assert.equal(legacyScreenshotLocation({ ...screen, lastScreenshotUrl: url }), null);
  assert.deepEqual(legacyScreenshotLocation({ ...screen, lastScreenshotUrl: `https://api.example.invalid/uploads/${filename}` }), { kind: 'local', key: filename });
});
test('legacy stored base64 remains accessible through the authorized endpoint; invalid images fail', async () => {
  const screen = { id: 'screen', tenantId: 'tenant', lastScreenshotUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=' };
  assert.equal((await readStoredScreenshot(screen)).mime, 'image/png');
  await assert.rejects(readStoredScreenshot({ ...screen, lastScreenshotUrl: 'data:image/png;base64,aGVsbG8=' }), e => e.status === 415);
  assert.match(screenDto(screen).lastScreenshotUrl, /^\/api\/screens\/screen\/screenshot\?/);
  assert.equal(screenDto({ id: 'screen' }).lastScreenshotUrl, null);
});

test('R2 screenshots use the original configured bucket, URL and directory without a new cleanup table', async t => {
  const original = S3Client.prototype.send; t.after(() => { S3Client.prototype.send = original; });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
  let uploaded;
  S3Client.prototype.send = async function(command) {
    assert.equal(command.input.Bucket, 'test-bucket');
    if (command instanceof PutObjectCommand) { uploaded = command.input; return {}; }
    assert.ok(command instanceof GetObjectCommand); assert.equal(command.input.Key, uploaded.Key);
    return { ContentLength: png.length, Body: require('node:stream').Readable.from([png]) };
  };
  const stored = await saveScreenshot(png, 'image/png', 'tenant', 'screen');
  assert.match(stored.storagePath, /^tenants\/tenant\/screenshots\/screen\/\d{13}-[0-9a-f-]+\.png$/);
  assert.equal(stored.url, `https://media.example.invalid/${stored.storagePath}`); assert.equal(stored.cleanupId, undefined);
  assert.deepEqual(uploaded.Body, png);
  assert.deepEqual((await readStoredScreenshot({ id: 'screen', tenantId: 'tenant', screenshotPath: stored.storagePath, lastScreenshotUrl: stored.url })).buffer, png);
});
test('R2 validation keeps purge credentials optional, as before the audit', () => {
  const original = { NODE_ENV: process.env.NODE_ENV, STORAGE_DRIVER: process.env.STORAGE_DRIVER };
  try { process.env.NODE_ENV = 'production'; process.env.STORAGE_DRIVER = 'r2'; assert.doesNotThrow(assertStorageConfiguration); }
  finally { for (const [key,value] of Object.entries(original)) if (value == null) delete process.env[key]; else process.env[key] = value; }
});
test('capture upload failure cannot mark its command as successful', async t => {
  const originalSend = S3Client.prototype.send, originalCommand = prisma.remoteCommand.findFirst, originalTx = prisma.$transaction;
  t.after(() => { S3Client.prototype.send = originalSend; prisma.remoteCommand.findFirst = originalCommand; prisma.$transaction = originalTx; });
  let committed = false;
  S3Client.prototype.send = async () => { throw new Error('simulated R2 outage'); };
  prisma.remoteCommand.findFirst = async () => ({ status: 'SENT', expiresAt: new Date(Date.now() + 60000) });
  prisma.$transaction = async () => { committed = true; };
  await assert.rejects(persistScreenshot(Buffer.from('test'), 'image/png', 'tenant', 'screen', 'command'), /simulated R2 outage/);
  assert.equal(committed, false);
});

test('original SCREENSHOT_RESULT WebSocket transport saves to R2 before confirming its command', async t => {
  process.env.JWT_SECRET = 'test-device-secret-only-not-for-production';
  const http = require('node:http'), { once } = require('node:events'), { WebSocket } = require('ws'), jwt = require('jsonwebtoken');
  const { initWebSocketServer } = require('../dist/lib/websocket.js');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
  const undo = [];
  const mock = (target, name, fn) => { const original = target[name]; target[name] = fn; undo.push(() => { target[name] = original; }); };
  let uploaded = false, confirmed = false, capture;
  let resolveStored; const stored = new Promise(resolve => { resolveStored = resolve; });
  const screen = { id: 'screen', tenantId: 'tenant', paired: true, name: 'TV', deviceTokenVersion: 1, volume: 80, orientation: 'HORIZONTAL' };
  mock(S3Client.prototype, 'send', async command => { assert.ok(command instanceof PutObjectCommand); assert.match(command.input.Key, /^tenants\/tenant\/screenshots\/screen\//); uploaded = true; return {}; });
  mock(prisma.screen, 'findFirst', async () => screen);
  mock(prisma.screen, 'update', async ({ data }) => { if (data.lastScreenshotUrl) { assert.equal(confirmed, true); capture = data; resolveStored(); } return { ...screen, ...data }; });
  mock(prisma.tenant, 'findUnique', async () => ({ status: 'ACTIVE' }));
  mock(prisma.screenManifest, 'findUnique', async () => ({ payload: JSON.stringify({ version: 1, activePlaylist: null, activeLayout: null, campaigns: [] }) }));
  mock(prisma.emergencyAlert, 'findFirst', async () => null);
  mock(prisma.remoteCommand, 'findMany', async () => []);
  mock(prisma.remoteCommand, 'findFirst', async () => ({ commandId: 'command', status: 'SENT', expiresAt: new Date(Date.now() + 60000) }));
  mock(prisma.remoteCommand, 'updateMany', async ({ data }) => { if (data.status === 'SUCCEEDED') { assert.equal(uploaded, true); confirmed = true; } return { count: 1 }; });
  mock(prisma, '$transaction', async fn => fn(prisma));
  const server = http.createServer(); const stop = initWebSocketServer(server);
  let ws;
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`); await once(ws, 'open');
    const paired = once(ws, 'message');
    ws.send(JSON.stringify({ type: 'REGISTER_PLAYER', os: 'Android TV (Simulated)', deviceToken: jwt.sign({ type: 'DEVICE', screenId: 'screen', tenantId: 'tenant', version: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' }) }));
    assert.equal(JSON.parse((await paired)[0].toString()).type, 'PAIRING_SUCCESS');
    ws.send(JSON.stringify({ type: 'SCREENSHOT_RESULT', commandId: 'command', imageDataUrl: `data:image/png;base64,${png.toString('base64')}` }));
    await Promise.race([stored, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Legacy capture was not stored')), 5000); timer.unref(); })]);
    assert.match(capture.lastScreenshotUrl, /^https:\/\/media.example.invalid\/tenants\/tenant\/screenshots\/screen\//);
    assert.equal(capture.screenshotPath.startsWith('private:'), false);
  } finally {
    if (ws && ws.readyState !== WebSocket.CLOSED) { const closed = once(ws, 'close'); ws.terminate(); await closed; }
    stop(); await new Promise(resolve => server.close(resolve));
    for (const restore of undo.reverse()) restore();
  }
});
