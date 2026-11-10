// Validação central de entrada, handler global de erros e verificação de configuração
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const h = require('./helpers');
const v = require('../services/validacao');
const { tratadorGlobal, ErroValidacao } = require('../middleware/erros');
const { validarConfiguracao } = require('../config');

let token; let orgao;
before(async () => {
  await h.iniciar();
  ({ token } = await h.novoUsuario());
  orgao = await h.novoOrgao(token);
});
after(() => h.encerrar());

const ok = () => ({ titulo: 'Achado valido', descricao: 'Descricao valida', severidade: 'Alto', orgao_id: orgao.id });
const SEM_VAZAMENTO = /\n\s+at\s|node_modules|\.js:\d+|[A-Z]:\\/;

// Requisição com corpo cru (para JSON inválido, null, array, grande...)
async function bruto(metodo, caminho, { corpo, tipo = 'application/json', autenticado = true } = {}) {
  const headers = { 'Content-Type': tipo };
  if (autenticado) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${h.urlBase()}${caminho}`, { method: metodo, headers, body: corpo });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { j = null; }
  return { status: r.status, tipo: r.headers.get('content-type'), texto: t, corpo: j };
}
// Toda resposta de erro precisa ser JSON, sem stack trace nem caminhos
const jsonLimpo = (r, status) => {
  assert.strictEqual(r.status, status, r.texto.slice(0, 200));
  assert.match(r.tipo, /application\/json/);
  assert.strictEqual(r.corpo.sucesso, false);
  assert.ok(typeof r.corpo.erro === 'string' && r.corpo.erro.length > 0);
  assert.doesNotMatch(r.texto, SEM_VAZAMENTO);
};

// ---------- Achados: tipos e tamanhos ----------
test('achado: tipos errados em título/descrição/severidade/status viram 400 (nunca 500) e sem stack trace', async () => {
  const casos = [
    { ...ok(), titulo: 12345678 }, { ...ok(), titulo: { a: 1 } }, { ...ok(), titulo: ['abcdefgh'] }, { ...ok(), titulo: true },
    { ...ok(), descricao: 123 }, { ...ok(), descricao: { a: 1 } }, { ...ok(), severidade: ['Alto'] }, { ...ok(), severidade: 5 },
    { ...ok(), status: 5 }, { ...ok(), status: { a: 1 } }, { ...ok(), recomendacao: 12345 }, { ...ok(), recomendacao: { a: 1 } },
  ];
  for (const corpo of casos) jsonLimpo(await bruto('POST', '/achados', { corpo: JSON.stringify(corpo) }), 400);
});

test('achado: descrição só com espaços e título só com espaços são rejeitados', async () => {
  const d = await h.req('POST', '/achados', { token, body: { ...ok(), descricao: '      ' } });
  assert.strictEqual(d.status, 400);
  assert.match(d.corpo.erro, /descrição/i);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), titulo: '        ' } })).status, 400);
  // também na edição
  const a = await h.novoAchado(token, orgao.id);
  const put = await h.req('PUT', `/achados/${a.id}`, { token, body: { ...ok(), status: 'Em aberto', descricao: '   ' } });
  assert.strictEqual(put.status, 400);
});

test('achado: limites de tamanho (título 200, descrição 4000, recomendação 2000) — no limite passa, acima falha', async () => {
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), titulo: 'T'.repeat(200) } })).status, 201);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), titulo: 'T'.repeat(201) } })).status, 400);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), descricao: 'D'.repeat(4000) } })).status, 201);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), descricao: 'D'.repeat(4001) } })).status, 400);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), recomendacao: 'R'.repeat(2000) } })).status, 201);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), recomendacao: 'R'.repeat(2001) } })).status, 400);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), titulo: 'T'.repeat(90000) } })).status, 400);
});

test('achado: caracteres de controle são rejeitados; quebra de linha só na descrição/recomendação', async () => {
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), titulo: 'abc\u0000def ghi' } })).status, 400);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), titulo: 'abc\u0007def ghi' } })).status, 400);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), titulo: 'Titulo com\nquebra de linha' } })).status, 400);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), descricao: 'Linha 1\nLinha 2\tcom tab' } })).status, 201);
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), descricao: 'nul\u0000aqui' } })).status, 400);
});

test('achado: orgao_id precisa ser inteiro positivo (booleano, objeto, array, negativo, decimal e texto são 400)', async () => {
  for (const orgao_id of [true, false, { a: 1 }, [orgao.id], -1, 0, 1.5, 'abc', '1.5', '-3', 1e20, '99999999999999999999']) {
    jsonLimpo(await bruto('POST', '/achados', { corpo: JSON.stringify({ ...ok(), orgao_id }) }), 400);
  }
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), orgao_id: String(orgao.id) } })).status, 201, 'texto numérico (formulário) é aceito');
  assert.strictEqual((await h.req('POST', '/achados', { token, body: { ...ok(), orgao_id: 99999 } })).status, 400, 'órgão inexistente');
});

// ---------- Query string: filtros, página, limite ----------
test('listagem: filtros e paginação inválidos geram 400 em JSON (arrays, objetos, texto, zero, negativo)', async () => {
  const invalidos = [
    'orgao_id=abc', 'orgao_id=1&orgao_id=2', 'orgao_id[]=1', 'orgao_id[a]=1', 'orgao_id=-1', 'orgao_id=0',
    'status=x', 'status=Em%20aberto&status=Rejeitado', 'severidade=gravissimo', 'severidade[$ne]=a',
    'q[]=a', 'q[a]=b', 'q=' + 'x'.repeat(101),
    'pagina=abc', 'pagina=0', 'pagina=-1', 'pagina=1e9', 'pagina=1.5', 'pagina[]=1', 'limite=0', 'limite=-5', 'limite=abc', 'limite=1.9', 'limite[]=5',
  ];
  for (const q of invalidos) jsonLimpo(await bruto('GET', `/achados?${q}`), 400);
  // o CSV usa os mesmos filtros
  jsonLimpo(await bruto('GET', '/achados/exportar.csv?orgao_id=1&orgao_id=2'), 400);
});

test('listagem: limite acima de 100 é limitado a 100 e página além do fim é ajustada', async () => {
  const r = await h.req('GET', '/achados?limite=1000&pagina=99999', { token });
  assert.strictEqual(r.status, 200);
  assert.ok(r.corpo.dados.length <= 100);
  assert.strictEqual(r.corpo.pagina, r.corpo.paginas);
  const q100 = await h.req('GET', `/achados?q=${'x'.repeat(100)}`, { token });
  assert.strictEqual(q100.status, 200, 'busca com exatamente 100 caracteres é aceita');
});

// ---------- IDs ----------
test('IDs de rota precisam ser inteiros positivos (400 em vez de 404/500)', async () => {
  for (const id of ['abc', '0', '-1', '1.5', '1e3', '99999999999999999999', '1;DROP%20TABLE%20achados']) {
    jsonLimpo(await bruto('GET', `/achados/${id}`), 400);
    jsonLimpo(await bruto('GET', `/orgaos/${id}`), 400);
  }
  jsonLimpo(await bruto('GET', '/achados/abc/historico'), 400);
  jsonLimpo(await bruto('GET', '/achados/abc/auditoria'), 400);
  jsonLimpo(await bruto('POST', '/achados/abc/desfazer', { corpo: '{}' }), 400);
  jsonLimpo(await bruto('DELETE', '/achados/abc'), 400);
  jsonLimpo(await bruto('PUT', '/achados/abc', { corpo: JSON.stringify({ ...ok(), status: 'Em aberto' }) }), 400);
  jsonLimpo(await bruto('POST', '/ia/uso/abc/resultado', { corpo: JSON.stringify({ resultado: 'aceita' }) }), 400);
  assert.strictEqual((await h.req('GET', '/achados/99999', { token })).status, 404, 'inteiro válido inexistente continua 404');
});

// ---------- Órgãos ----------
test('órgão: tipos e tamanhos inválidos viram 400', async () => {
  for (const corpo of [{ nome: 12345, tipo: 'Autarquia' }, { nome: { a: 1 }, tipo: 'Autarquia' }, { nome: 'O'.repeat(151), tipo: 'Autarquia' },
    { nome: 'Órgão ok', tipo: ['Autarquia'] }, { nome: 'Órgão ok', tipo: 'Inexistente' }, { nome: 'ab', tipo: 'Autarquia' }, { nome: 'Nome\u0000ruim', tipo: 'Autarquia' }]) {
    jsonLimpo(await bruto('POST', '/orgaos', { corpo: JSON.stringify(corpo) }), 400);
  }
  assert.strictEqual((await h.req('POST', '/orgaos', { token, body: { nome: 'O'.repeat(150), tipo: 'Autarquia' } })).status, 201);
});

// ---------- Cadastro e login ----------
test('cadastro: tipos e tamanhos inválidos viram 400 (nome, e-mail, senha, área)', async () => {
  const base = { nome: 'Fulano de Tal', email: 'fulano@teste.com', senha: '123456', area: 'Saúde' };
  const invalidos = [
    { ...base, nome: 12345 }, { ...base, nome: 'N'.repeat(121) }, { ...base, nome: 'ab' }, { ...base, nome: { a: 1 } },
    { ...base, email: ['a@b.com'] }, { ...base, email: 'a@b.c'.padEnd(255, 'x') }, { ...base, email: 'sem-arroba' }, { ...base, email: { $ne: null } },
    { ...base, senha: 1234567 }, { ...base, senha: { a: 1 } }, { ...base, senha: ['123456'] }, { ...base, senha: '123' },
    { ...base, senha: 'é'.repeat(37) }, // 74 bytes > 72
    { ...base, area: ['Saúde'] }, { ...base, area: 'Inexistente' },
  ];
  for (const corpo of invalidos) jsonLimpo(await bruto('POST', '/auth/cadastro', { corpo: JSON.stringify(corpo), autenticado: false }), 400);
});

test('login: e-mail/senha com tipo errado viram 400', async () => {
  for (const corpo of [{ email: { $ne: null }, senha: '123456' }, { email: 'a@b.com', senha: { a: 1 } }, { email: ['a@b.com'], senha: '123456' }, {}]) {
    jsonLimpo(await bruto('POST', '/auth/login', { corpo: JSON.stringify(corpo), autenticado: false }), 400);
  }
});

// ---------- Corpo JSON e rotas ----------
test('JSON malformado, corpo null/array/texto e corpo gigante respondem 400/413 em JSON, sem stack trace', async () => {
  jsonLimpo(await bruto('POST', '/auth/cadastro', { corpo: '{"nome": ', autenticado: false }), 400);
  jsonLimpo(await bruto('POST', '/achados', { corpo: 'null' }), 400);
  jsonLimpo(await bruto('POST', '/achados', { corpo: '[1,2,3]' }), 400);
  jsonLimpo(await bruto('POST', '/achados', { corpo: '"texto"' }), 400);
  jsonLimpo(await bruto('POST', '/orgaos', { corpo: '[]' }), 400);
  jsonLimpo(await bruto('POST', '/auth/cadastro', { corpo: JSON.stringify({ nome: 'N'.repeat(2e6) }), autenticado: false }), 413);
  const semTipo = await bruto('POST', '/achados', { corpo: 'titulo=abc', tipo: 'text/plain' });
  jsonLimpo(semTipo, 400);
});

test('rotas inexistentes e métodos errados respondem 404 em JSON', async () => {
  jsonLimpo(await bruto('GET', '/inexistente', { autenticado: false }), 404);
  jsonLimpo(await bruto('GET', '/auth/cadastro', { autenticado: false }), 404);
  jsonLimpo(await bruto('PUT', '/health', { autenticado: false, corpo: '{}' }), 404);
});

test('tratador global: erro inesperado vira JSON genérico, sem mensagem interna, stack nem caminho', () => {
  let status; let corpo;
  const res = { status(c) { status = c; return this; }, json(o) { corpo = o; return this; } };
  const silenciar = console.error; console.error = () => {};
  try {
    tratadorGlobal(new Error('falha em C:\\saac_aps\\backend\\routes\\x.js:10'), {}, res, () => {});
  } finally { console.error = silenciar; }
  assert.strictEqual(status, 500);
  assert.deepStrictEqual(corpo, { sucesso: false, erro: 'Erro interno do servidor.' });
  tratadorGlobal(new ErroValidacao('Campo inválido.'), {}, res, () => {});
  assert.strictEqual(status, 400);
  tratadorGlobal(Object.assign(new Error('x'), { type: 'entity.too.large' }), {}, res, () => {});
  assert.strictEqual(status, 413);
});

// ---------- Configuração ----------
test('o servidor se recusa a subir sem JWT_SECRET (processo termina com código 1 e mensagem clara)', () => {
  const servidor = path.join(__dirname, '..', 'server.js');
  for (const jwt of ['', '   ']) {
    const r = spawnSync(process.execPath, [servidor], {
      env: { ...process.env, JWT_SECRET: jwt, NODE_ENV: 'production', PORT: '0', SAAC_DB_PATH: ':memory:' },
      encoding: 'utf8', timeout: 15000,
    });
    assert.strictEqual(r.status, 1, `JWT_SECRET="${jwt}" deveria impedir a inicialização; saída: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /JWT_SECRET/);
  }
  assert.throws(() => validarConfiguracao({}), /JWT_SECRET/);
  assert.doesNotThrow(() => validarConfiguracao({ JWT_SECRET: 'a'.repeat(40) }));
});

// ---------- Unidade: funções de validação ----------
test('validacao: texto, inteiros, paginação e limites documentados', () => {
  assert.strictEqual(v.texto('  ola mundo  ', 'O campo', { min: 3, max: 20 }), 'ola mundo');
  assert.throws(() => v.texto(5, 'O campo', {}), /deve ser um texto/);
  assert.throws(() => v.texto('   ', 'O campo', { min: 1 }), /em branco/);
  assert.strictEqual(v.inteiroPositivo('42', 'ID'), 42);
  assert.throws(() => v.inteiroPositivo(true, 'ID'), ErroValidacao);
  assert.strictEqual(v.idParam('7'), 7);
  assert.throws(() => v.idParam('07x'), ErroValidacao);
  assert.deepStrictEqual(v.paginacao({}), { pagina: 1, limite: 10 });
  assert.deepStrictEqual(v.paginacao({ pagina: '3', limite: '500' }), { pagina: 3, limite: 100 });
  assert.deepStrictEqual(Object.keys(v.LIMITES).sort(), ['busca', 'codigoConvite', 'descricao', 'email', 'nomeOrgao', 'nomeUsuario', 'paginaLimiteMax', 'recomendacao', 'senha', 'titulo']);
  assert.strictEqual(v.LIMITES.titulo.max, 200);
  assert.strictEqual(v.LIMITES.descricao.max, 4000);
});

// ---------- IA: entrada ----------
test('IA: corpo/consulta com tipos errados geram 400 (não 500)', async () => {
  const rec = { titulo: 'Titulo da IA', descricao: 'Descricao da IA', severidade: 'Alto', orgao_nome: 'Órgão', orgao_tipo: 'Secretaria' };
  for (const extra of [{ titulo: 123 }, { descricao: { a: 1 } }, { severidade: ['Alto'] }, { orgao_nome: 5 }, { orgao_nome: 'O'.repeat(151) }, { achado_id: 'abc' }, { titulo: 'T'.repeat(201) }]) {
    jsonLimpo(await bruto('POST', '/ia/recomendacao', { corpo: JSON.stringify({ ...rec, ...extra }) }), 400);
  }
  jsonLimpo(await bruto('POST', '/ia/severidade', { corpo: JSON.stringify({ titulo: ['x'], descricao: 'y' }) }), 400);
  jsonLimpo(await bruto('POST', '/ia/severidade', { corpo: 'null' }), 400);
  jsonLimpo(await bruto('GET', '/ia/semelhantes?titulo[]=a&descricao=b'), 400);
  jsonLimpo(await bruto('GET', '/ia/semelhantes?titulo=abc&descricao=def&orgao_id=abc'), 400);
});
