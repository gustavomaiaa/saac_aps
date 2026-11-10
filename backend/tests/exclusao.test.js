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

test('órgão cujos achados estão TODOS excluídos pode ser removido (exclusão lógica; achados e auditoria preservados)', async () => {
  const o = await h.novoOrgao(token, 'Órgão só com excluído');
  const a = await h.novoAchado(token, o.id);
  assert.strictEqual((await h.req('DELETE', `/orgaos/${o.id}`, { token })).status, 409, 'com achado ativo continua 409');
  await h.req('DELETE', `/achados/${a.id}`, { token });
  const r = await h.req('DELETE', `/orgaos/${o.id}`, { token });
  assert.strictEqual(r.status, 200);
  assert.match(r.corpo.mensagem, /removido/);
  // some das telas e do dashboard, mas o registro e o achado excluído continuam no banco
  const lista = await h.req('GET', '/orgaos', { token });
  assert.ok(!lista.corpo.orgaos.some((x) => x.id === o.id));
  assert.strictEqual((await h.req('GET', `/orgaos/${o.id}`, { token })).status, 404);
  assert.strictEqual((await h.req('PUT', `/orgaos/${o.id}`, { token, body: { nome: 'Revivido', tipo: 'Fundação' } })).status, 404);
  assert.strictEqual((await h.req('DELETE', `/orgaos/${o.id}`, { token })).status, 404);
  assert.ok(h.db.prepare('SELECT excluido_em FROM orgaos WHERE id = ?').get(o.id).excluido_em);
  assert.ok(h.db.prepare('SELECT excluido_em FROM achados WHERE id = ?').get(a.id).excluido_em);
  assert.strictEqual(h.db.prepare("SELECT COUNT(*) n FROM auditoria WHERE entidade_id = ? AND acao = 'excluir'").get(a.id).n, 1);
  const dash = await h.req('GET', '/dashboard', { token });
  assert.ok(!dash.corpo.top_orgaos.some((x) => x.orgao_id === o.id));
  // não aceita achados novos nesse órgão
  const novo = await h.req('POST', '/achados', { token, body: { titulo: 'Achado novo', descricao: 'Descricao', severidade: 'Alto', orgao_id: o.id } });
  assert.strictEqual(novo.status, 400);
  assert.match(novo.corpo.erro, /Órgão informado não existe/);
});

test('órgão sem achados pode ser excluído', async () => {
  const o = await h.novoOrgao(token, 'Órgão vazio');
  const r = await h.req('DELETE', `/orgaos/${o.id}`, { token });
  assert.strictEqual(r.status, 200);
});
