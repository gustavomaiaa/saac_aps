const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');

let token; let orgao;
before(async () => {
  await h.iniciar();
  ({ token } = await h.novoUsuario('Maria Auditora'));
  orgao = await h.novoOrgao(token, 'Secretaria de Obras', 'Secretaria');
  await h.novoAchado(token, orgao.id, { titulo: 'Contrato com; ponto e vírgula', descricao: 'Linha 1\nLinha 2 com "aspas"', severidade: 'Crítico', recomendacao: 'Revisar' });
  await h.novoAchado(token, orgao.id, { titulo: '=SOMA(1+1) formula', descricao: 'Descrição normal', severidade: 'Baixo' });
});
after(() => h.encerrar());

test('CSV exige autenticação', async () => {
  assert.strictEqual((await h.req('GET', '/achados/exportar.csv')).status, 401);
});

test('CSV: UTF-8 com BOM, separador ";", cabeçalhos em português e campos pedidos', async () => {
  const r = await h.req('GET', '/achados/exportar.csv', { token });
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv; charset=utf-8/);
  assert.match(r.headers.get('content-disposition'), /achados\.csv/);
  assert.strictEqual(r.texto.charCodeAt(0), 0xFEFF, 'BOM no início');
  const linhas = r.texto.slice(1).split('\r\n');
  assert.strictEqual(linhas[0], 'ID;Título;Descrição;Severidade;Status;Recomendação;Órgão;Criado por;Criado em');
  assert.match(r.texto, /Secretaria de Obras;Maria Auditora;/);
});

test('CSV: escapa ;, aspas e quebras de linha, e neutraliza fórmulas', async () => {
  const r = await h.req('GET', '/achados/exportar.csv', { token });
  assert.match(r.texto, /"Contrato com; ponto e vírgula"/);
  assert.match(r.texto, /"Linha 1\nLinha 2 com ""aspas"""/);
  assert.match(r.texto, /;'=SOMA\(1\+1\) formula;/);
});

test('CSV: respeita os mesmos filtros da listagem', async () => {
  const r = await h.req('GET', '/achados/exportar.csv?severidade=Crítico', { token });
  const linhas = r.texto.trim().split('\r\n').filter((l) => /^\d+;/.test(l) || l.includes('Contrato'));
  assert.ok(r.texto.includes('Contrato com'));
  assert.ok(!r.texto.includes('SOMA'));
  assert.ok(linhas.length >= 1);
  const vazio = await h.req('GET', '/achados/exportar.csv?q=inexistente', { token });
  assert.strictEqual(vazio.texto.trim().split('\r\n').length, 1, 'só o cabeçalho');
});
