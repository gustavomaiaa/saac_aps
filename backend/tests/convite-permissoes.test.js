// Segredo JWT, cadastro por convite e órgãos restritos ao admin (401/403)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const h = require('./helpers');
const { validarConfiguracao, SEGREDOS_DE_EXEMPLO } = require('../config');

let admin; let auditor; let orgao;
before(async () => {
  await h.iniciar();
  admin = await h.novoUsuario('Administrador');   // 1º usuário (com convite) = admin
  auditor = await h.novoUsuario('Auditor Comum');
  orgao = await h.novoOrgao(admin.token, 'Órgão do admin', 'Secretaria');
});
after(() => h.encerrar());

// ---------------- Segredo JWT ----------------
test('config: segredo de exemplo, com "troque" ou curto é recusado fora de NODE_ENV=test', () => {
  for (const segredo of [...SEGREDOS_DE_EXEMPLO, 'troque-por-um-segredo-bem-longo-e-aleatorio-123456', 'curto', 'a'.repeat(31)]) {
    assert.throws(() => validarConfiguracao({ JWT_SECRET: segredo, NODE_ENV: 'production' }), /JWT_SECRET/, segredo);
  }
  assert.doesNotThrow(() => validarConfiguracao({ JWT_SECRET: 'f3a9'.repeat(16), NODE_ENV: 'production' }));
  assert.doesNotThrow(() => validarConfiguracao({ JWT_SECRET: 'segredo_de_teste', NODE_ENV: 'test' }), 'em testes o segredo curto é permitido');
});

test('servidor não inicia com o segredo de exemplo público nem com segredo curto (código 1 e mensagem)', () => {
  const servidor = path.join(__dirname, '..', 'server.js');
  for (const segredo of ['saac_sprint3_super_secreto_troque_em_producao', 'troque_este_segredo_em_producao', 'curto123']) {
    const r = spawnSync(process.execPath, [servidor], {
      env: { ...process.env, JWT_SECRET: segredo, NODE_ENV: 'production', PORT: '0', SAAC_DB_PATH: ':memory:' },
      encoding: 'utf8', timeout: 15000,
    });
    assert.strictEqual(r.status, 1, `${segredo}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /JWT_SECRET/);
  }
});

test('docker-compose exige JWT_SECRET e CODIGO_CONVITE (sem valor padrão) e o README explica', () => {
  const compose = fs.readFileSync(path.join(__dirname, '..', '..', 'docker-compose.yml'), 'utf8');
  assert.match(compose, /JWT_SECRET: \$\{JWT_SECRET:\?/);
  assert.match(compose, /CODIGO_CONVITE: \$\{CODIGO_CONVITE:\?/);
  assert.ok(!/troque_este_segredo/.test(compose));
  const exemplo = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  assert.match(exemplo, /^JWT_SECRET=$/m, '.env.example não traz segredo');
  assert.match(exemplo, /^CODIGO_CONVITE=$/m);
});

// ---------------- Cadastro por convite ----------------
const corpoCadastro = (extra = {}) => ({ nome: 'Pessoa Convidada', email: `conv${Math.random().toString(36).slice(2, 8)}@teste.com`, senha: '123456', area: 'Saúde', ...extra });

test('cadastro: sem código → 400; código errado → 403; código correto → 201 (auditor)', async () => {
  const sem = await h.req('POST', '/auth/cadastro', { body: corpoCadastro() });
  assert.strictEqual(sem.status, 400);
  assert.match(sem.corpo.erro, /código de convite/i);
  const vazio = await h.req('POST', '/auth/cadastro', { body: corpoCadastro({ codigo_convite: '' }) });
  assert.strictEqual(vazio.status, 400);
  const errado = await h.req('POST', '/auth/cadastro', { body: corpoCadastro({ codigo_convite: 'codigo-errado' }) });
  assert.strictEqual(errado.status, 403);
  assert.match(errado.corpo.erro, /Código de convite inválido/);
  assert.strictEqual((await h.req('POST', '/auth/cadastro', { body: corpoCadastro({ codigo_convite: ['convite-de-teste'] }) })).status, 400, 'tipo errado');
  const ok = await h.req('POST', '/auth/cadastro', { body: corpoCadastro({ codigo_convite: process.env.CODIGO_CONVITE }) });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(ok.corpo.usuario.perfil, 'auditor');
  assert.ok(ok.corpo.token);
});

test('cadastro: código com espaços nas pontas é aceito; e-mail duplicado só é revelado com convite válido', async () => {
  const e = corpoCadastro();
  assert.strictEqual((await h.req('POST', '/auth/cadastro', { body: { ...e, codigo_convite: `  ${process.env.CODIGO_CONVITE}  ` } })).status, 201);
  const semConvite = await h.req('POST', '/auth/cadastro', { body: { ...e, codigo_convite: 'errado' } });
  assert.strictEqual(semConvite.status, 403, 'sem convite não é possível descobrir se o e-mail existe');
  assert.strictEqual((await h.req('POST', '/auth/cadastro', { body: { ...e, codigo_convite: process.env.CODIGO_CONVITE } })).status, 409);
});

test('cadastro fica desativado (403) se CODIGO_CONVITE não estiver configurado', async () => {
  const guardado = process.env.CODIGO_CONVITE;
  try {
    delete process.env.CODIGO_CONVITE;
    const r = await h.req('POST', '/auth/cadastro', { body: corpoCadastro({ codigo_convite: 'qualquer' }) });
    assert.strictEqual(r.status, 403);
    assert.match(r.corpo.erro, /desativado/);
    process.env.CODIGO_CONVITE = '   ';
    assert.strictEqual((await h.req('POST', '/auth/cadastro', { body: corpoCadastro({ codigo_convite: '   ' }) })).status, 403);
  } finally {
    process.env.CODIGO_CONVITE = guardado;
  }
});

test('login não exige convite: usuário já cadastrado e o admin do seed continuam entrando', async () => {
  const r = await h.req('POST', '/auth/login', { body: { email: 'u2@teste.com', senha: '123456' } });
  assert.strictEqual(r.status, 200);
  // admin do seed (hash bcrypt de admin123, perfil admin) — autenticação independente do convite
  const { spawnSync: sp } = require('node:child_process');
  const os = require('node:os');
  const arquivo = path.join(os.tmpdir(), `saac_conv_${process.pid}.db`);
  try {
    const env = { ...process.env, SAAC_DB_PATH: arquivo, OLLAMA_URL: 'http://127.0.0.1:1' };
    sp(process.execPath, [path.join(__dirname, '..', 'seed.js')], { env });
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(arquivo);
    const u = db.prepare("SELECT senha, perfil FROM usuarios WHERE email = 'admin@saac.demo'").get();
    assert.ok(bcrypt.compareSync('admin123', u.senha));
    assert.strictEqual(u.perfil, 'admin');
    db.close();
  } finally {
    ['', '-wal', '-shm', '-journal'].forEach((s) => fs.rmSync(arquivo + s, { force: true }));
  }
});

// ---------------- Órgãos: somente admin altera ----------------
test('órgãos: sem token → 401 em todas as rotas', async () => {
  for (const [m, p, body] of [['GET', '/orgaos'], ['POST', '/orgaos', { nome: 'Xxx', tipo: 'Autarquia' }], ['GET', `/orgaos/${orgao.id}`],
    ['PUT', `/orgaos/${orgao.id}`, { nome: 'Xxx', tipo: 'Autarquia' }], ['DELETE', `/orgaos/${orgao.id}`]]) {
    assert.strictEqual((await h.req(m, p, { body })).status, 401, `${m} ${p}`);
  }
});

test('órgãos: auditor lê (200) mas criar/editar/excluir retornam 403 e nada muda', async () => {
  assert.strictEqual((await h.req('GET', '/orgaos', { token: auditor.token })).status, 200);
  assert.strictEqual((await h.req('GET', `/orgaos/${orgao.id}`, { token: auditor.token })).status, 200);
  const post = await h.req('POST', '/orgaos', { token: auditor.token, body: { nome: 'Órgão do auditor', tipo: 'Autarquia' } });
  assert.strictEqual(post.status, 403);
  assert.match(post.corpo.erro, /administradores/);
  const put = await h.req('PUT', `/orgaos/${orgao.id}`, { token: auditor.token, body: { nome: 'Renomeado indevido', tipo: 'Autarquia' } });
  assert.strictEqual(put.status, 403);
  const vazio = await h.novoOrgao(admin.token, 'Órgão vazio do admin', 'Fundação');
  assert.strictEqual((await h.req('DELETE', `/orgaos/${vazio.id}`, { token: auditor.token })).status, 403);
  assert.strictEqual(h.db.prepare('SELECT nome FROM orgaos WHERE id = ?').get(orgao.id).nome, 'Órgão do admin');
  assert.ok(h.db.prepare('SELECT id FROM orgaos WHERE id = ?').get(vazio.id), 'órgão não foi excluído');
  assert.strictEqual(h.db.prepare("SELECT COUNT(*) n FROM orgaos WHERE nome = 'Órgão do auditor'").get().n, 0);
});

test('órgãos: o 403 vale mesmo com corpo inválido (permissão antes da validação) e o admin segue podendo tudo', async () => {
  assert.strictEqual((await h.req('POST', '/orgaos', { token: auditor.token, body: {} })).status, 403);
  const novo = await h.req('POST', '/orgaos', { token: admin.token, body: { nome: 'Criado pelo admin', tipo: 'Prefeitura' } });
  assert.strictEqual(novo.status, 201);
  assert.strictEqual((await h.req('PUT', `/orgaos/${novo.corpo.orgao.id}`, { token: admin.token, body: { nome: 'Renomeado pelo admin', tipo: 'Prefeitura' } })).status, 200);
  assert.strictEqual((await h.req('DELETE', `/orgaos/${novo.corpo.orgao.id}`, { token: admin.token })).status, 200);
});

test('auditor continua criando achados em órgãos existentes (permissão de órgão não afeta achados)', async () => {
  const a = await h.novoAchado(auditor.token, orgao.id);
  assert.ok(a && a.id);
});
