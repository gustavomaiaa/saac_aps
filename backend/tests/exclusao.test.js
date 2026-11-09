const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');

let token; let orgao;
before(async () => {
  await h.iniciar();
  ({ token } = await h.novoUsuario());
  orgao = await h.novoOrgao(token, 'Órgão com achados');
});
after(() => h.encerrar());

test('exclusão lógica: marca excluido_em, preserva o registro e some das listagens', async () => {
  const achado = await h.novoAchado(token, orgao.id);
  const r = await h.req('DELETE', `/achados/${achado.id}`, { token });
  assert.strictEqual(r.status, 200);

  const linha = h.db.prepare('SELECT excluido_em FROM achados WHERE id = ?').get(achado.id);
  assert.ok(linha, 'registro continua no banco');
  assert.ok(linha.excluido_em, 'excluido_em preenchido');

  const lista = await h.req('GET', '/achados', { token });
  assert.strictEqual(lista.corpo.total, 0);
  assert.strictEqual((await h.req('GET', `/achados/${achado.id}`, { token })).status, 404);
  assert.strictEqual((await h.req('DELETE', `/achados/${achado.id}`, { token })).status, 404);
  const dash = await h.req('GET', '/dashboard', { token });
  assert.strictEqual(dash.corpo.total_achados, 0);
  const orgaos = await h.req('GET', '/orgaos', { token });
  assert.strictEqual(orgaos.corpo.orgaos[0].total_achados, 0);
});

test('409 ao excluir órgão que tem achados ativos', async () => {
  const o = await h.novoOrgao(token, 'Órgão ocupado');
  await h.novoAchado(token, o.id);
  const r = await h.req('DELETE', `/orgaos/${o.id}`, { token });
  assert.strictEqual(r.status, 409);
  assert.match(r.corpo.erro, /achado/);
});

test('409 também quando só restam achados excluídos logicamente (preservados)', async () => {
  const o = await h.novoOrgao(token, 'Órgão só com excluído');
  const a = await h.novoAchado(token, o.id);
  await h.req('DELETE', `/achados/${a.id}`, { token });
  const r = await h.req('DELETE', `/orgaos/${o.id}`, { token });
  assert.strictEqual(r.status, 409);
});

test('órgão sem achados pode ser excluído', async () => {
  const o = await h.novoOrgao(token, 'Órgão vazio');
  const r = await h.req('DELETE', `/orgaos/${o.id}`, { token });
  assert.strictEqual(r.status, 200);
});
