const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');

let admin; let ana; let bruno; let orgao; let achadoDaAna;
before(async () => {
  await h.iniciar();
  admin = await h.novoUsuario('Administrador');   // primeiro usuário cadastrado
  ana = await h.novoUsuario('Ana Auditora');
  bruno = await h.novoUsuario('Bruno Auditor');
  orgao = await h.novoOrgao(admin.token);
  achadoDaAna = await h.novoAchado(ana.token, orgao.id, { titulo: 'Achado da Ana' });
});
after(() => h.encerrar());

const corpo = (a, extra = {}) => ({ titulo: a.titulo, descricao: a.descricao, severidade: a.severidade, orgao_id: a.orgao_id, status: a.status, ...extra });

test('primeiro usuário vira admin; os demais são auditores', () => {
  assert.strictEqual(admin.usuario.perfil, 'admin');
  assert.strictEqual(ana.usuario.perfil, 'auditor');
  assert.strictEqual(bruno.usuario.perfil, 'auditor');
});

test('login devolve o perfil e /auth/verify também', async () => {
  const login = await h.req('POST', '/auth/login', { body: { email: 'u2@teste.com', senha: '123456' } });
  assert.strictEqual(login.corpo.usuario.perfil, 'auditor');
  const verify = await h.req('GET', '/auth/verify', { token: admin.token });
  assert.strictEqual(verify.corpo.usuario.perfil, 'admin');
});

test('403 ao editar, excluir e desfazer achado de outro auditor', async () => {
  const put = await h.req('PUT', `/achados/${achadoDaAna.id}`, { token: bruno.token, body: corpo(achadoDaAna, { titulo: 'Titulo do Bruno' }) });
  assert.strictEqual(put.status, 403);
  assert.match(put.corpo.erro, /permissão para editar/);
  const del = await h.req('DELETE', `/achados/${achadoDaAna.id}`, { token: bruno.token });
  assert.strictEqual(del.status, 403);
  const undo = await h.req('POST', `/achados/${achadoDaAna.id}/desfazer`, { token: bruno.token });
  assert.strictEqual(undo.status, 403);
  // nada mudou
  assert.strictEqual(h.db.prepare('SELECT titulo, excluido_em FROM achados WHERE id = ?').get(achadoDaAna.id).titulo, 'Achado da Ana');
  assert.strictEqual(h.db.prepare('SELECT COUNT(*) n FROM achados_historico WHERE achado_id = ?').get(achadoDaAna.id).n, 0);
});

test('o criador pode editar e desfazer o próprio achado', async () => {
  const put = await h.req('PUT', `/achados/${achadoDaAna.id}`, { token: ana.token, body: corpo(achadoDaAna, { titulo: 'Editado pela Ana' }) });
  assert.strictEqual(put.status, 200);
  assert.strictEqual((await h.req('POST', `/achados/${achadoDaAna.id}/desfazer`, { token: ana.token })).status, 200);
});

test('o admin pode editar e excluir achado de qualquer um', async () => {
  const put = await h.req('PUT', `/achados/${achadoDaAna.id}`, { token: admin.token, body: corpo(achadoDaAna, { titulo: 'Editado pelo admin' }) });
  assert.strictEqual(put.status, 200);
  assert.strictEqual((await h.req('DELETE', `/achados/${achadoDaAna.id}`, { token: admin.token })).status, 200);
});

test('token inválido responde 401 (frontend limpa a sessão)', async () => {
  const r = await h.req('GET', '/achados', { token: 'token.invalido.aqui' });
  assert.strictEqual(r.status, 401);
});

test('token de usuário inexistente responde 401', async () => {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ id: 9999, nome: 'Fantasma' }, process.env.JWT_SECRET);
  assert.strictEqual((await h.req('GET', '/achados', { token })).status, 401);
});
