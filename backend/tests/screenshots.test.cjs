const { test } = require('node:test');
const assert = require('node:assert/strict');
const { legacyScreenshotLocation, readStoredScreenshot } = require('../dist/lib/storage.js');
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
