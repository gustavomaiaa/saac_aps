const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

test('seed cria 1 admin, 4 órgãos e 12 achados (e é idempotente)', () => {
  const arquivo = path.join(os.tmpdir(), `saac_seed_${process.pid}.db`);
  const env = { ...process.env, SAAC_DB_PATH: arquivo };
  try {
    execFileSync(process.execPath, [path.join(__dirname, '..', 'seed.js')], { env });
    execFileSync(process.execPath, [path.join(__dirname, '..', 'seed.js')], { env }); // 2ª execução não duplica
    const db = new DatabaseSync(arquivo);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM usuarios').get().n, 1);
    assert.strictEqual(db.prepare("SELECT perfil FROM usuarios").get().perfil, 'admin');
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM orgaos').get().n, 4);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM achados').get().n, 12);
    assert.ok(db.prepare('SELECT COUNT(*) n FROM vw_resumo_orgaos WHERE total_achados >= 3').get().n >= 2, 'há órgãos reincidentes');
    db.close();
  } finally {
    ['', '-wal', '-shm', '-journal'].forEach((s) => fs.rmSync(arquivo + s, { force: true }));
  }
});
