const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');
const modulo = require('../memento/achado');
const { Achado, AchadoMemento, HistoricoAchado } = modulo;

const base = { titulo: 'Titulo original', descricao: 'Descricao', severidade: 'Alto', status: 'Em aberto', orgao_id: 1, recomendacao: null };

// ---------- Unidade: o estado do memento não pode ser lido nem alterado de fora ----------

test('o módulo não exporta o WeakMap de estados nem o estado', () => {
  assert.deepStrictEqual(Object.keys(modulo).sort(), ['Achado', 'AchadoMemento', 'CAMPOS', 'HistoricoAchado', 'persistencia']);
});

test('memento expõe apenas rotulo e criadoEm (sem estado acessível)', () => {
  const achado = new Achado(base);
  const m = achado.salvar('v1');
  assert.strictEqual(m.rotulo, 'v1');
  assert.ok(m.criadoEm);
  assert.deepStrictEqual(Reflect.ownKeys(m), [], 'nenhuma propriedade própria');
  assert.strictEqual(JSON.stringify(m), '{}');
  ['estado', 'estado_', '_estado', 'dados', 'titulo'].forEach((k) => assert.strictEqual(m[k], undefined));
  assert.deepStrictEqual(Object.getOwnPropertyNames(Object.getPrototypeOf(m)).sort(), ['constructor', 'criadoEm', 'rotulo']);
});

test('memento é congelado: não aceita novas propriedades nem troca de rótulo', () => {
  const m = new Achado(base).salvar('v1');
  assert.ok(Object.isFrozen(m));
  assert.throws(() => { 'use strict'; m.rotulo = 'hack'; }, TypeError);
  assert.throws(() => { 'use strict'; m.estado = { titulo: 'hack' }; }, TypeError);
  assert.strictEqual(m.rotulo, 'v1');
});

test('alterar o achado depois de salvar não muda o que o memento guardou', () => {
  const achado = new Achado(base);
  const m = achado.salvar('antes');
  achado.editar({ titulo: 'Titulo alterado', status: 'Implementado' });
  achado.restaurar(m);
  assert.strictEqual(achado.resumo().titulo, 'Titulo original');
  assert.strictEqual(achado.resumo().status, 'Em aberto');
  // restaurar de novo (mesmo memento) continua dando o mesmo estado original
  achado.editar({ titulo: 'Outro' });
  achado.restaurar(m);
  assert.strictEqual(achado.resumo().titulo, 'Titulo original');
});

test('resumo() devolve cópia: alterar a cópia não afeta o achado', () => {
  const achado = new Achado(base);
  const copia = achado.resumo();
  copia.titulo = 'Hackeado';
  assert.strictEqual(achado.resumo().titulo, 'Titulo original');
});

test('o estado do originador é privado (#estado) e editar() ignora campos desconhecidos', () => {
  const achado = new Achado(base);
  assert.deepStrictEqual(Reflect.ownKeys(achado), []);
  achado.editar({ campo_inexistente: 'x', titulo: 'Novo' });
  assert.strictEqual(achado.resumo().campo_inexistente, undefined);
  assert.strictEqual(achado.resumo().titulo, 'Novo');
});

test('restaurar() rejeita objeto que não é um memento real', () => {
  const achado = new Achado(base);
  assert.throws(() => achado.restaurar({ rotulo: 'falso', estado: { titulo: 'x' } }), TypeError);
});

test('Caretaker: pilha, listar() só com rotulo/criadoEm e desfazer() false quando vazio', () => {
  const achado = new Achado(base);
  const historico = new HistoricoAchado(achado);
  assert.strictEqual(historico.desfazer(), false);
  historico.registrar('primeiro');
  achado.editar({ titulo: 'Segundo titulo' });
  historico.registrar('segundo');
  achado.editar({ titulo: 'Terceiro titulo' });
  assert.deepStrictEqual(historico.listar().map((i) => Object.keys(i).sort()), [['criadoEm', 'rotulo'], ['criadoEm', 'rotulo']]);
  assert.strictEqual(historico.desfazer(), true);
  assert.strictEqual(achado.resumo().titulo, 'Segundo titulo');
  assert.strictEqual(historico.desfazer(), true);
  assert.strictEqual(achado.resumo().titulo, 'Titulo original');
  assert.strictEqual(historico.desfazer(), false);
});

// ---------- API: histórico e desfazer persistidos no banco ----------

let token; let orgao;
before(async () => {
  await h.iniciar();
  ({ token } = await h.novoUsuario('Auditora Teste'));
  orgao = await h.novoOrgao(token);
});
after(() => h.encerrar());

function corpoPut(achado, extra = {}) {
  return { titulo: achado.titulo, descricao: achado.descricao, severidade: achado.severidade, orgao_id: achado.orgao_id, status: achado.status, ...extra };
}

test('API: PUT grava snapshot, histórico lista só rotulo/criado_em, desfazer restaura', async () => {
  const achado = await h.novoAchado(token, orgao.id, { titulo: 'Titulo original v1', severidade: 'Baixo' });
  assert.strictEqual((await h.req('GET', `/achados/${achado.id}/historico`, { token })).corpo.total, 0);

  await h.req('PUT', `/achados/${achado.id}`, { token, body: corpoPut(achado, { titulo: 'Titulo editado v2', severidade: 'Crítico' }) });
  await h.req('PUT', `/achados/${achado.id}`, { token, body: corpoPut(achado, { titulo: 'Titulo editado v3', status: 'Em análise' }) });

  const hist = await h.req('GET', `/achados/${achado.id}/historico`, { token });
  assert.strictEqual(hist.corpo.total, 2);
  assert.deepStrictEqual(Object.keys(hist.corpo.historico[0]).sort(), ['criado_em', 'rotulo']);
  assert.match(hist.corpo.historico[0].rotulo, /Auditora Teste/);
  assert.ok(!hist.texto.includes('estado_json'));

  const d1 = await h.req('POST', `/achados/${achado.id}/desfazer`, { token });
  assert.strictEqual(d1.status, 200);
  assert.strictEqual(d1.corpo.achado.titulo, 'Titulo editado v2');
  assert.strictEqual(d1.corpo.achado.severidade, 'Crítico');
  assert.strictEqual(d1.corpo.achado.status, 'Em aberto');
  // gravou no banco
  assert.strictEqual(h.db.prepare('SELECT titulo FROM achados WHERE id = ?').get(achado.id).titulo, 'Titulo editado v2');

  const d2 = await h.req('POST', `/achados/${achado.id}/desfazer`, { token });
  assert.strictEqual(d2.corpo.achado.titulo, 'Titulo original v1');
  assert.strictEqual(d2.corpo.achado.severidade, 'Baixo');
  assert.strictEqual((await h.req('GET', `/achados/${achado.id}/historico`, { token })).corpo.total, 0);
});

test('API: 409 "Nada a desfazer." com histórico vazio', async () => {
  const achado = await h.novoAchado(token, orgao.id);
  const r = await h.req('POST', `/achados/${achado.id}/desfazer`, { token });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.corpo.erro, 'Nada a desfazer.');
});

test('API: desfazer/histórico em achado inexistente ou excluído retornam 404; sem token, 401', async () => {
  assert.strictEqual((await h.req('POST', '/achados/99999/desfazer', { token })).status, 404);
  assert.strictEqual((await h.req('GET', '/achados/99999/historico', { token })).status, 404);
  const achado = await h.novoAchado(token, orgao.id);
  assert.strictEqual((await h.req('POST', `/achados/${achado.id}/desfazer`)).status, 401);
});

test('API: desfazer restaura também a recomendação', async () => {
  const achado = await h.novoAchado(token, orgao.id, { recomendacao: 'Recomendacao inicial' });
  await h.req('PUT', `/achados/${achado.id}`, { token, body: corpoPut(achado, { recomendacao: 'Recomendacao nova' }) });
  const d = await h.req('POST', `/achados/${achado.id}/desfazer`, { token });
  assert.strictEqual(d.corpo.achado.recomendacao, 'Recomendacao inicial');
});
