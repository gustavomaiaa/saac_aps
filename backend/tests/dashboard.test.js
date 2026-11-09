const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');

let token;
before(async () => {
  await h.iniciar();
  ({ token } = await h.novoUsuario());
});
after(() => h.encerrar());

test('dashboard exige autenticação', async () => {
  const r = await h.req('GET', '/dashboard');
  assert.strictEqual(r.status, 401);
});

test('dashboard vazio retorna zeros', async () => {
  const r = await h.req('GET', '/dashboard', { token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.total_achados, 0);
  assert.strictEqual(r.corpo.por_severidade['Crítico'], 0);
  assert.deepStrictEqual(r.corpo.top_orgaos, []);
});

test('dashboard conta por severidade, status e top órgãos', async () => {
  const a = await h.novoOrgao(token, 'Órgão A');
  const b = await h.novoOrgao(token, 'Órgão B');
  await h.novoAchado(token, a.id, { severidade: 'Crítico' });
  await h.novoAchado(token, a.id, { severidade: 'Alto', status: 'Implementado' });
  await h.novoAchado(token, b.id, { severidade: 'Alto' });
  const r = await h.req('GET', '/dashboard', { token });
  assert.strictEqual(r.corpo.total_achados, 3);
  assert.strictEqual(r.corpo.por_severidade['Alto'], 2);
  assert.strictEqual(r.corpo.por_severidade['Crítico'], 1);
  assert.strictEqual(r.corpo.por_status['Implementado'], 1);
  assert.strictEqual(r.corpo.top_orgaos[0].nome, 'Órgão A');
  assert.strictEqual(r.corpo.top_orgaos[0].total_achados, 2);
});
