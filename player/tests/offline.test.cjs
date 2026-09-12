const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('fake-indexeddb/auto');
// Compile the actual storage module in memory, without a browser or generated test copies.
const source = fs.readFileSync(path.join(__dirname, '../src/services/storageService.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const moduleFixture = { exports: {} }; new Function('exports', 'module', compiled)(moduleFixture.exports, moduleFixture);
const storage = moduleFixture.exports;
test('offline batches cap at 500; ACK preserves new, rejected and other-device records', async () => {
  for (let i = 0; i < 1001; i++) await storage.addProofLog({ eventId: `event-${i}`, screenId: 'screen-a' });
  await storage.addProofLog({ eventId: 'other-tenant-event', screenId: 'screen-b' });
  const first = await storage.getProofBatch('screen-a'); assert.equal(first.length, 500);
  await storage.addProofLog({ eventId: 'arrived-during-upload', screenId: 'screen-a' });
  await storage.acknowledgeProofBatch(first, first.slice(0, 499).map(x => x.eventId), [first[499].eventId]);
  const second = await storage.getProofBatch('screen-a'); assert.equal(second.length, 500); assert.equal(second[0].eventId, 'event-500');
  await storage.acknowledgeProofBatch(second, second.map(x => x.eventId), []);
  const last = await storage.getProofBatch('screen-a'); assert.deepEqual(last.map(x => x.eventId), ['event-1000', 'arrived-during-upload']);
  assert.equal((await storage.getProofBatch('screen-b')).length, 1);
  const db = await storage.openDB();
  const quarantined = await new Promise(resolve => { const r = db.transaction('proofLogs').objectStore('proofLogs').get(first[499].id); r.onsuccess = () => resolve(r.result); }); assert.equal(quarantined.rejected, true);
});
test('empty ACK loses no data and clearing content preserves pending proofs', async () => {
  const before = await storage.getProofBatch('screen-a'); await storage.acknowledgeProofBatch(before, [], []);
  await storage.setCache('content:screen-a', { manifestVersion: 1 }); await storage.clearContentCache();
  assert.equal(await storage.getCache('content:screen-a'), undefined); assert.deepEqual(await storage.getProofBatch('screen-a'), before);
});
