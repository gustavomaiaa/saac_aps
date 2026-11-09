const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');

let usuario;
before(async () => {
  await h.iniciar();
  ({ usuario } = await h.novoUsuario('Seguranca Teste'));
});
after(() => h.encerrar());


test('senhas são armazenadas com hash bcrypt (nunca em texto puro)', () => {
  const linha = h.db.prepare('SELECT senha FROM usuarios WHERE id = ?').get(usuario.id);
  assert.notStrictEqual(linha.senha, '123456');
  assert.match(linha.senha, /^\$2[aby]\$\d{2}\$/);
});

test('helmet adiciona cabeçalhos de segurança', async () => {
  const r = await h.req('GET', '/health');
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(r.headers.get('x-frame-options') || r.headers.get('content-security-policy'));
  assert.strictEqual(r.headers.get('x-powered-by'), null);
});

test('CORS: origem do frontend é permitida e origem desconhecida não recebe o cabeçalho', async () => {
  const url = h.urlBase() + '/health';
  const ok = await fetch(url, { headers: { Origin: 'http://localhost:8080' } });
  assert.strictEqual(ok.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  const ruim = await fetch(url, { headers: { Origin: 'http://site-malicioso.example' } });
  assert.strictEqual(ruim.headers.get('access-control-allow-origin'), null);
});

test('login: 5 falhas seguidas bloqueiam o IP com 429 e mensagem clara (mesmo com senha correta)', async () => {
  const email = 'u1@teste.com';
  for (let i = 0; i < 5; i += 1) {
    const r = await h.req('POST', '/auth/login', { body: { email, senha: 'senhaerrada' } });
    assert.strictEqual(r.status, 401, `tentativa ${i + 1}`);
  }
  const bloqueado = await h.req('POST', '/auth/login', { body: { email, senha: '123456' } });
  assert.strictEqual(bloqueado.status, 429);
  assert.match(bloqueado.corpo.erro, /Muitas tentativas de login/);
  assert.ok(Number(bloqueado.headers.get('retry-after')) > 0);
});
