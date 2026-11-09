const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');

let token; let orgA; let orgB;
before(async () => {
  await h.iniciar();
  ({ token } = await h.novoUsuario());
  orgA = await h.novoOrgao(token, 'Prefeitura Alfa', 'Prefeitura');
  orgB = await h.novoOrgao(token, 'Secretaria Beta', 'Secretaria');
  for (let i = 1; i <= 12; i += 1) {
    await h.novoAchado(token, i <= 8 ? orgA.id : orgB.id, {
      titulo: `Achado numero ${i}`,
      descricao: i === 3 ? 'Falha no controle de 100% dos contratos' : `Descricao ${i}`,
      severidade: i % 2 ? 'Alto' : 'Baixo',
      status: i <= 4 ? 'Em análise' : 'Em aberto',
    });
  }
});
after(() => h.encerrar());

test('paginação padrão: 10 por página, resposta com total/pagina/paginas', async () => {
  const r = await h.req('GET', '/achados', { token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.dados.length, 10);
  assert.strictEqual(r.corpo.total, 12);
  assert.strictEqual(r.corpo.pagina, 1);
  assert.strictEqual(r.corpo.paginas, 2);
});

test('segunda página traz o restante', async () => {
  const r = await h.req('GET', '/achados?pagina=2', { token });
  assert.strictEqual(r.corpo.dados.length, 2);
  assert.strictEqual(r.corpo.pagina, 2);
});

test('página fora do intervalo é ajustada e limite é respeitado', async () => {
  const r = await h.req('GET', '/achados?pagina=99&limite=5', { token });
  assert.strictEqual(r.corpo.pagina, 3);
  assert.strictEqual(r.corpo.paginas, 3);
  assert.strictEqual(r.corpo.dados.length, 2);
});

test('filtra por órgão, severidade e status', async () => {
  const porOrgao = await h.req('GET', `/achados?orgao_id=${orgB.id}`, { token });
  assert.strictEqual(porOrgao.corpo.total, 4);
  const porSev = await h.req('GET', '/achados?severidade=Alto', { token });
  assert.strictEqual(porSev.corpo.total, 6);
  const porStatus = await h.req('GET', '/achados?status=Em%20an%C3%A1lise', { token });
  assert.strictEqual(porStatus.corpo.total, 4);
  const combinado = await h.req('GET', `/achados?orgao_id=${orgA.id}&severidade=Baixo&status=Em%20aberto`, { token });
  assert.strictEqual(combinado.corpo.total, 2); // 6 e 8
});

test('busca em título e descrição, tratando % literalmente', async () => {
  const titulo = await h.req('GET', '/achados?q=numero%207', { token });
  assert.strictEqual(titulo.corpo.total, 1);
  const desc = await h.req('GET', '/achados?q=contratos', { token });
  assert.strictEqual(desc.corpo.total, 1);
  const pct = await h.req('GET', '/achados?q=100%25', { token });
  assert.strictEqual(pct.corpo.total, 1);
  const nada = await h.req('GET', '/achados?q=%25', { token });
  assert.strictEqual(nada.corpo.total, 1); // só o que contém '%' de verdade
});
