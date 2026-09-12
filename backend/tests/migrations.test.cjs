const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
test('all migrations apply to PostgreSQL and preserve uniquely attributable proof history', async () => {
  const db = new PGlite();
  try {
    const root = path.join(__dirname, '../prisma/migrations');
    const migrations = fs.readdirSync(root).filter(name => fs.existsSync(path.join(root, name, 'migration.sql'))).sort();
    for (const name of migrations) {
      if (name === '20260911210000_audit_and_password') {
        await db.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('tenant','Test','test',now());
          INSERT INTO "User" (id,"tenantId",name,email,"passwordHash","updatedAt") VALUES ('user','tenant','Test','test@example.invalid','hash',now());
          INSERT INTO "Media" (id,"tenantId",name,type,url,"updatedAt") VALUES ('media','tenant','Unique media','IMAGE','https://example.invalid/a.png',now());
          INSERT INTO "Screen" (id,"tenantId",name,"pairingCode","updatedAt") VALUES ('screen','tenant','Test screen','123456',now());
          INSERT INTO "ProofOfPlay" (id,"tenantId","screenId","mediaName","durationSeconds",completed,"eventId") VALUES ('proof','tenant','screen','Unique media',3,false,'proof-event');`);
      }
      try { await db.exec(fs.readFileSync(path.join(root, name, 'migration.sql'), 'utf8')); } catch (error) { throw new Error(`Migration ${name}: ${error.message}`, { cause: error }); }
    }
    const proof = (await db.query('SELECT "mediaId", completed FROM "ProofOfPlay" WHERE id = $1', ['proof'])).rows[0];
    assert.deepEqual(proof, { mediaId: 'media', completed: false });
    await db.exec(`UPDATE "Media" SET "archivedAt"=now() WHERE id='media';`);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM "ProofOfPlay"')).rows[0].count, 1);
    assert.equal((await db.query('SELECT "sessionVersion" FROM "User" WHERE id=$1', ['user'])).rows[0].sessionVersion, 1);
    await db.exec(`INSERT INTO "AdminSession" (id,"userId","expiresAt") VALUES ('session','user',now()+interval '1 hour');`);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM "AdminSession"')).rows[0].count, 1);
    const columns = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name='QueueTicket'`)).rows.map(r => r.column_name);
    assert.ok(columns.includes('eventId'));
  } finally { await db.close(); }
});
