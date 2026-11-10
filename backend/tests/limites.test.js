// bcrypt assíncrono, limite de cadastro (por IP), limite de IA (por usuário) e bloqueio de login por IP + e-mail
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const h = require('./helpers');
const fake = require('./fake-ollama');
const { criarLimitador } = require('../middleware/limiteTaxa');
const limiteLogin = require('../middleware/limiteLogin');

let ollama;
before(async () => {
  await h.iniciar();
  ollama = await fake.criar();
  process.env.OLLAMA_URL = ollama.url;
  process.env.OLLAMA_TIMEOUT_MS = '1000';
});
after(async () => { await ollama.fechar(); await h.encerrar(); });

let tentativasCadastro = 0;
const cadastrar = (extra = {}) => {
  tentativasCadastro += 1;
  const id = Math.random().toString(36).slice(2, 10);
  return h.req('POST', '/auth/cadastro', {
    body: { nome: 'Pessoa Teste', email: `p${id}@teste.com`, senha: '123456', area: 'Saúde', codigo_convite: process.env.CODIGO_CONVITE, ...extra },
  });
};

// ---------------- bcrypt assíncrono ----------------
test('cadastro simultâneo no banco vazio: exatamente 1 admin (hash assíncrono não abre corrida no perfil)', async () => {
  const rs = await Promise.all(Array.from({ length: 6 }, () => cadastrar()));
  assert.ok(rs.every((r) => r.status === 201), rs.map((r) => r.status).join());
  assert.strictEqual(rs.filter((r) => r.corpo.usuario.perfil === 'admin').length, 1);
  assert.strictEqual(h.db.prepare("SELECT COUNT(*) n FROM usuarios WHERE perfil = 'admin'").get().n, 1);
});

test('cadastro e login usam bcrypt ASSÍNCRONO (as versões síncronas, que bloqueiam o event loop, nunca são chamadas)', async () => {
  const { hashSync, compareSync } = bcrypt;
  bcrypt.hashSync = () => { throw new Error('hashSync não deve ser usado'); };
  bcrypt.compareSync = () => { throw new Error('compareSync não deve ser usado'); };
  try {
    const email = 'async@teste.com';
    const c = await cadastrar({ email });
    assert.strictEqual(c.status, 201);
    const l = await h.req('POST', '/auth/login', { body: { email, senha: '123456' } });
    assert.strictEqual(l.status, 200);
    const ruim = await h.req('POST', '/auth/login', { body: { email, senha: 'senha-errada' } });
    assert.strictEqual(ruim.status, 401);
  } finally {
    bcrypt.hashSync = hashSync; bcrypt.compareSync = compareSync;
  }
});

test('e-mail duplicado em cadastros simultâneos: um 201 e os demais 409 (nunca 500)', async () => {
  const email = 'duplo@teste.com';
  const rs = await Promise.all(Array.from({ length: 4 }, () => cadastrar({ email })));
  assert.strictEqual(rs.filter((r) => r.status === 201).length, 1, rs.map((r) => r.status).join());
  assert.ok(rs.filter((r) => r.status !== 201).every((r) => r.status === 409), rs.map((r) => r.status).join());
});

// ---------------- Limite de cadastro (por IP) ----------------
test('cadastro: após o limite por hora do IP responde 429 claro (com Retry-After), mesmo com convite válido', async () => {
  process.env.CADASTRO_LIMITE_POR_HORA = String(tentativasCadastro + 2); // mais 2 tentativas permitidas
  try {
    const a = await cadastrar({ codigo_convite: 'errado' }); // tentativas inválidas também contam (protege o convite contra adivinhação)
    const b = await cadastrar();
    assert.strictEqual(a.status, 403);
    assert.strictEqual(b.status, 201);
    const c = await cadastrar();
    assert.strictEqual(c.status, 429);
    assert.match(c.corpo.erro, /Muitas tentativas de cadastro/);
    assert.match(c.corpo.erro, /minuto/);
    assert.ok(Number(c.headers.get('retry-after')) > 0);
    assert.ok(c.corpo.retry_after_s > 0);
    assert.strictEqual((await cadastrar()).status, 429);
  } finally {
    process.env.CADASTRO_LIMITE_POR_HORA = '100000';
  }
  assert.strictEqual((await cadastrar()).status, 201, 'com o limite normal volta a funcionar');
});

// ---------------- Limite de IA (por usuário) ----------------
test('IA: limite por usuário — 429 com mensagem clara; outro usuário e as demais rotas não são afetados', async () => {
  const A = await h.novoUsuario('Usuario A');
  const B = await h.novoUsuario('Usuario B');
  const sev = (t) => h.req('POST', '/ia/severidade', { token: t, body: { titulo: 'Falha de controle', descricao: 'Falha de controle em compras' } });
  ollama.modo = 'ok';
  ollama.resposta = JSON.stringify({ severidade: 'Alto', justificativa: 'Falha de controle.' });
  process.env.IA_LIMITE_POR_MINUTO = '2';
  process.env.IA_LIMITE_SEMELHANTES_POR_MINUTO = '1';
  try {
    assert.strictEqual((await sev(A.token)).status, 200);
    assert.strictEqual((await sev(A.token)).status, 200);
    const bloqueada = await sev(A.token);
    assert.strictEqual(bloqueada.status, 429);
    assert.match(bloqueada.corpo.erro, /Limite de uso da IA atingido \(2 por minuto\)\. Tente novamente em \d+ s\./);
    assert.ok(Number(bloqueada.headers.get('retry-after')) >= 1);

    // recomendação e padrões dividem o mesmo limite de geração do usuário A
    const rec = await h.req('POST', '/ia/recomendacao', { token: A.token, body: { titulo: 'Titulo da IA', descricao: 'Descricao da IA', severidade: 'Alto', orgao_nome: 'Órgão' } });
    assert.strictEqual(rec.status, 429);
    assert.strictEqual((await h.req('GET', '/ia/padroes', { token: A.token })).status, 429);

    // outro usuário tem o seu próprio limite; status, métricas e resultado não são limitados
    assert.strictEqual((await sev(B.token)).status, 200);
    assert.strictEqual((await h.req('GET', '/ia/status', { token: A.token })).status, 200);
    assert.strictEqual((await h.req('GET', '/ia/metricas', { token: A.token })).status, 200);

    // semelhantes tem limite próprio (1 por minuto neste teste)
    const q = new URLSearchParams({ titulo: 'Falha de controle', descricao: 'Falha de controle em compras' });
    assert.strictEqual((await h.req('GET', `/ia/semelhantes?${q}`, { token: B.token })).status, 200);
    const sem = await h.req('GET', `/ia/semelhantes?${q}`, { token: B.token });
    assert.strictEqual(sem.status, 429);
    assert.match(sem.corpo.erro, /Limite de consultas de achados parecidos atingido \(1 por minuto\)/);
    assert.strictEqual((await sev(B.token)).status, 200, 'o limite de semelhantes não consome o de geração');
  } finally {
    process.env.IA_LIMITE_POR_MINUTO = '100000';
    process.env.IA_LIMITE_SEMELHANTES_POR_MINUTO = '100000';
  }
  assert.strictEqual((await sev(A.token)).status, 200, 'sem o limite reduzido volta a funcionar');
  ollama.resposta = null;
});

test('limitador genérico: a janela expira e o contador recomeça; entradas distintas não se misturam', async () => {
  const lim = criarLimitador({ max: 2, janelaMs: 60, chave: (req) => req.k, mensagem: () => 'limite' });
  const chamar = (k) => new Promise((resolve) => {
    const res = { setHeader() {}, status(c) { this.c = c; return this; }, json() { resolve(this.c); } };
    lim({ k }, res, () => resolve(200));
  });
  assert.deepStrictEqual([await chamar('a'), await chamar('a'), await chamar('a')], [200, 200, 429]);
  assert.strictEqual(await chamar('b'), 200);
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(await chamar('a'), 200, 'janela expirou');
});

// ---------------- Login: bloqueio por IP + e-mail ----------------
const login = (email, senha) => h.req('POST', '/auth/login', { body: { email, senha } });

test('login: 5 falhas bloqueiam aquele e-mail naquele IP (429) — outros e-mails não são afetados', async () => {
  await cadastrar({ email: 'alvo@teste.com' });
  await cadastrar({ email: 'outro@teste.com' });
  for (let i = 0; i < 5; i += 1) assert.strictEqual((await login('alvo@teste.com', 'senha-errada')).status, 401);
  const bloqueado = await login('alvo@teste.com', '123456'); // senha certa, mas bloqueado
  assert.strictEqual(bloqueado.status, 429);
  assert.match(bloqueado.corpo.erro, /Muitas tentativas de login/);
  assert.ok(Number(bloqueado.headers.get('retry-after')) > 0);
  // caixa alta não contorna o bloqueio
  assert.strictEqual((await login('ALVO@TESTE.COM', '123456')).status, 429);
  // outro e-mail, mesmo IP: segue funcionando
  assert.strictEqual((await login('outro@teste.com', 'errada')).status, 401);
  assert.strictEqual((await login('outro@teste.com', '123456')).status, 200);
});

test('login: sucesso zera o contador daquele e-mail', async () => {
  await cadastrar({ email: 'zera@teste.com' });
  for (let i = 0; i < 3; i += 1) assert.strictEqual((await login('zera@teste.com', 'errada')).status, 401);
  assert.strictEqual((await login('zera@teste.com', '123456')).status, 200);
  for (let i = 0; i < 3; i += 1) assert.strictEqual((await login('zera@teste.com', 'errada')).status, 401, 'contador recomeçou');
});

test('login: tentar muitos e-mails diferentes também esbarra no limite por IP', async () => {
  const falhasIp = [...limiteLogin._mapas.porIp.values()].reduce((s, r) => s + r.falhas, 0);
  process.env.LOGIN_MAX_TENTATIVAS_IP = String(falhasIp + 2);
  try {
    assert.strictEqual((await login('spray1@teste.com', 'x12345')).status, 401);
    assert.strictEqual((await login('spray2@teste.com', 'x12345')).status, 401);
    assert.strictEqual((await login('spray3@teste.com', 'x12345')).status, 429, 'e-mail novo, mas o IP já passou do limite');
  } finally {
    delete process.env.LOGIN_MAX_TENTATIVAS_IP;
  }
});
