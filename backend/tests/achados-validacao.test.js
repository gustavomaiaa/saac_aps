const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');

let token; let orgao;
before(async () => {
  await h.iniciar();
  ({ token } = await h.novoUsuario());
  orgao = await h.novoOrgao(token);
});
after(() => h.encerrar());

const valido = () => ({ titulo: 'Achado valido', descricao: 'Descricao valida', severidade: 'Alto', orgao_id: orgao.id });

test('cria achado válido (201) com status padrão "Em aberto" e criador registrado', async () => {
  const r = await h.req('POST', '/achados', { token, body: valido() });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.corpo.achado.status, 'Em aberto');
  assert.strictEqual(r.corpo.achado.orgao_nome, orgao.nome);
  assert.ok(r.corpo.achado.criado_por_nome);
});

test('achados exigem autenticação', async () => {
  assert.strictEqual((await h.req('POST', '/achados', { body: valido() })).status, 401);
  assert.strictEqual((await h.req('GET', '/achados')).status, 401);
});

test('400 para campos obrigatórios ausentes', async () => {
  for (const campo of ['titulo', 'descricao', 'severidade', 'orgao_id']) {
    const corpo = valido();
    delete corpo[campo];
    const r = await h.req('POST', '/achados', { token, body: corpo });
    assert.strictEqual(r.status, 400, `sem ${campo}`);
  }
});

test('400 para título curto, severidade inválida, status inválido e órgão inexistente', async () => {
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...valido(), titulo: 'abc' } })).status, 400);
  const sev = await h.req('POST', '/achados', { token, body: { ...valido(), severidade: 'Gravíssimo' } });
  assert.strictEqual(sev.status, 400);
  assert.match(sev.corpo.erro, /Severidade inválida/);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...valido(), status: 'Inventado' } })).status, 400);
  const org = await h.req('POST', '/achados', { token, body: { ...valido(), orgao_id: 99999 } });
  assert.strictEqual(org.status, 400);
  assert.match(org.corpo.erro, /Órgão informado não existe/);
});

test('PUT valida os mesmos campos e responde 404 para achado inexistente', async () => {
  const a = await h.novoAchado(token, orgao.id);
  const base = { ...valido(), status: 'Em aberto' };
  assert.strictEqual((await h.req('PUT', `/achados/${a.id}`, { token, body: { ...base, status: undefined } })).status, 400);
  assert.strictEqual((await h.req('PUT', `/achados/${a.id}`, { token, body: { ...base, severidade: 'X' } })).status, 400);
  assert.strictEqual((await h.req('PUT', '/achados/99999', { token, body: base })).status, 404);
  const ok = await h.req('PUT', `/achados/${a.id}`, { token, body: { ...base, status: 'Implementado' } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.corpo.achado.status, 'Implementado');
});

test('GET /achados/:id devolve o achado e 404 quando não existe', async () => {
  const a = await h.novoAchado(token, orgao.id);
  assert.strictEqual((await h.req('GET', `/achados/${a.id}`, { token })).status, 200);
  assert.strictEqual((await h.req('GET', '/achados/99999', { token })).status, 404);
});

test('validações de órgão: nome curto e tipo inválido', async () => {
  assert.strictEqual((await h.req('POST', '/orgaos', { token, body: { nome: 'ab', tipo: 'Secretaria' } })).status, 400);
  assert.strictEqual((await h.req('POST', '/orgaos', { token, body: { nome: 'Órgão novo', tipo: 'Inexistente' } })).status, 400);
});

test('cadastro: validações e email duplicado (409)', async () => {
  const corpo = { nome: 'Fulano de Tal', email: 'dup@teste.com', senha: '123456', area: 'Saúde', codigo_convite: process.env.CODIGO_CONVITE };
  assert.strictEqual((await h.req('POST', '/auth/cadastro', { body: corpo })).status, 201);
  assert.strictEqual((await h.req('POST', '/auth/cadastro', { body: corpo })).status, 409);
  assert.strictEqual((await h.req('POST', '/auth/cadastro', { body: { ...corpo, email: 'x@y.com', senha: '123' } })).status, 400);
  assert.strictEqual((await h.req('POST', '/auth/login', { body: { email: 'dup@teste.com', senha: 'errada1' } })).status, 401);
});
