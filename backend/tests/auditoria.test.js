const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');

let ana; let admin; let orgao;
before(async () => {
  await h.iniciar();
  admin = await h.novoUsuario('Administrador');
  ana = await h.novoUsuario('Ana Auditora');
  orgao = await h.novoOrgao(admin.token);
});
after(() => h.encerrar());

const put = (a, extra) => ({ titulo: a.titulo, descricao: a.descricao, severidade: a.severidade, orgao_id: a.orgao_id, status: a.status, ...extra });

test('auditoria registra criar, editar, restaurar e excluir, com autor e campos alterados', async () => {
  const achado = await h.novoAchado(ana.token, orgao.id, { titulo: 'Achado auditado', severidade: 'Baixo' });
  await h.req('PUT', `/achados/${achado.id}`, { token: ana.token, body: put(achado, { severidade: 'Crítico', status: 'Em análise' }) });
  await h.req('POST', `/achados/${achado.id}/desfazer`, { token: ana.token });
  await h.req('DELETE', `/achados/${achado.id}`, { token: admin.token }); // admin exclui o achado da Ana

  const r = await h.req('GET', `/achados/${achado.id}/auditoria`, { token: ana.token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.total, 4);
  assert.deepStrictEqual(r.corpo.auditoria.map((a) => a.acao), ['excluir', 'restaurar', 'editar', 'criar']); // mais recente primeiro
  assert.deepStrictEqual(r.corpo.auditoria.map((a) => a.usuario_nome), ['Administrador', 'Ana Auditora', 'Ana Auditora', 'Ana Auditora']);

  const editar = r.corpo.auditoria[2];
  assert.strictEqual(editar.antes.severidade, 'Baixo');
  assert.strictEqual(editar.depois.severidade, 'Crítico');
  assert.deepStrictEqual(editar.mudancas.map((m) => m.campo).sort(), ['severidade', 'status']);
  const restaurar = r.corpo.auditoria[1];
  assert.strictEqual(restaurar.depois.severidade, 'Baixo');
  assert.deepStrictEqual(r.corpo.auditoria[3].antes, null);
  assert.deepStrictEqual(r.corpo.auditoria[0].depois, { excluido: true });
  assert.ok(r.corpo.auditoria.every((a) => a.criado_em));
});

test('edição negada (403) não gera registro de auditoria', async () => {
  const achado = await h.novoAchado(admin.token, orgao.id);
  const negado = await h.req('PUT', `/achados/${achado.id}`, { token: ana.token, body: put(achado, { titulo: 'Tentativa indevida' }) });
  assert.strictEqual(negado.status, 403);
  const r = await h.req('GET', `/achados/${achado.id}/auditoria`, { token: admin.token });
  assert.deepStrictEqual(r.corpo.auditoria.map((a) => a.acao), ['criar']);
});

test('auditoria: 401 sem token e 404 para achado que nunca existiu', async () => {
  assert.strictEqual((await h.req('GET', '/achados/1/auditoria')).status, 401);
  assert.strictEqual((await h.req('GET', '/achados/99999/auditoria', { token: admin.token })).status, 404);
});
