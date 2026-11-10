// Fuso America/Fortaleza, conflito de edição (409 por versão) e embeddings sem corrida
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const h = require('./helpers');
const fake = require('./fake-ollama');
const { paraFortaleza } = require('../services/tempo');

let token; let outro; let orgao; let ollama;
before(async () => {
  await h.iniciar();
  ollama = await fake.criar();
  process.env.OLLAMA_URL = ollama.url;
  process.env.OLLAMA_TIMEOUT_MS = '3000';
  ({ token } = await h.novoUsuario('Primeiro Admin'));
  ({ token: outro } = await h.novoUsuario('Outro Admin'));
  h.db.prepare("UPDATE usuarios SET perfil = 'admin' WHERE email = 'u2@teste.com'").run(); // 2º usuário também edita (conflito entre pessoas)
  orgao = await h.novoOrgao(token);
});
after(async () => { await ollama.fechar(); await h.encerrar(); });

const esperar = async (cond, ms = 4000) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) { if (cond()) return true; await new Promise((r) => setTimeout(r, 25)); }
  return false;
};
const corpoPut = (a, extra = {}) => ({ titulo: a.titulo, descricao: a.descricao, severidade: a.severidade, orgao_id: a.orgao_id, status: a.status, ...extra });
const qtdVetores = (id) => h.db.prepare('SELECT COUNT(*) n FROM achados_embedding WHERE achado_id = ?').get(id).n;

// ---------------- Conflito de edição (409) ----------------
test('versão: novo achado começa na versão 1 e cada alteração incrementa', async () => {
  const a = await h.novoAchado(token, orgao.id);
  assert.strictEqual(a.versao, 1);
  const put = await h.req('PUT', `/achados/${a.id}`, { token, body: corpoPut(a, { titulo: 'Titulo alterado v2', versao: 1 }) });
  assert.strictEqual(put.status, 200);
  assert.strictEqual(put.corpo.achado.versao, 2);
  assert.strictEqual((await h.req('GET', `/achados/${a.id}`, { token })).corpo.achado.versao, 2);
});

test('conflito: salvar com a versão antiga → 409 com mensagem clara, versão atual e dados atuais; nada é gravado', async () => {
  const a = await h.novoAchado(token, orgao.id, { titulo: 'Achado do conflito', severidade: 'Baixo' });
  const visto = (await h.req('GET', `/achados/${a.id}`, { token })).corpo.achado; // pessoa A abre o formulário (versão 1)
  const b = await h.req('PUT', `/achados/${a.id}`, { token: outro, body: corpoPut(visto, { severidade: 'Crítico', versao: visto.versao }) }); // pessoa B salva
  assert.strictEqual(b.status, 200);

  const historicoAntes = h.db.prepare('SELECT COUNT(*) n FROM achados_historico WHERE achado_id = ?').get(a.id).n;
  const auditoriaAntes = h.db.prepare('SELECT COUNT(*) n FROM auditoria WHERE entidade_id = ?').get(a.id).n;
  const conflito = await h.req('PUT', `/achados/${a.id}`, { token, body: corpoPut(visto, { titulo: 'Titulo da pessoa A (desatualizado)', versao: visto.versao }) });
  assert.strictEqual(conflito.status, 409);
  assert.match(conflito.corpo.erro, /alterado por outra pessoa enquanto você o editava/);
  assert.match(conflito.corpo.erro, /Recarregue/);
  assert.strictEqual(conflito.corpo.versao_atual, 2);
  assert.strictEqual(conflito.corpo.achado.severidade, 'Crítico', 'devolve os dados atuais para o cliente recarregar');
  assert.strictEqual(conflito.corpo.achado.titulo, 'Achado do conflito');

  const atual = (await h.req('GET', `/achados/${a.id}`, { token })).corpo.achado;
  assert.strictEqual(atual.severidade, 'Crítico', 'a alteração da pessoa B NÃO foi sobrescrita');
  assert.strictEqual(atual.titulo, 'Achado do conflito');
  assert.strictEqual(h.db.prepare('SELECT COUNT(*) n FROM achados_historico WHERE achado_id = ?').get(a.id).n, historicoAntes, 'sem snapshot novo');
  assert.strictEqual(h.db.prepare('SELECT COUNT(*) n FROM auditoria WHERE entidade_id = ?').get(a.id).n, auditoriaAntes, 'sem auditoria nova');

  // depois de recarregar (versão atual), o salvamento passa
  const ok = await h.req('PUT', `/achados/${a.id}`, { token, body: corpoPut(atual, { titulo: 'Titulo da pessoa A refeito', versao: atual.versao }) });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.corpo.achado.versao, 3);
});

test('conflito: 5 PUTs simultâneos com a mesma versão → exatamente 1 sucesso e 4 conflitos (409)', async () => {
  const a = await h.novoAchado(token, orgao.id);
  const rs = await Promise.all(Array.from({ length: 5 }, (_, i) => h.req('PUT', `/achados/${a.id}`, { token, body: corpoPut(a, { titulo: `Edicao simultanea ${i}`, versao: 1 }) })));
  const status = rs.map((r) => r.status).sort();
  assert.deepStrictEqual(status, [200, 409, 409, 409, 409]);
  assert.strictEqual(h.db.prepare('SELECT versao FROM achados WHERE id = ?').get(a.id).versao, 2);
});

test('versão: desfazer também incrementa (quem tem a versão antiga recebe 409); PUT sem versão continua aceito', async () => {
  const a = await h.novoAchado(token, orgao.id);
  await h.req('PUT', `/achados/${a.id}`, { token, body: corpoPut(a, { titulo: 'Alterado para desfazer' }) }); // sem versão: permitido, versão 2
  const d = await h.req('POST', `/achados/${a.id}/desfazer`, { token });
  assert.strictEqual(d.status, 200);
  assert.strictEqual(d.corpo.achado.versao, 3);
  const velho = await h.req('PUT', `/achados/${a.id}`, { token, body: corpoPut(a, { versao: 2 }) });
  assert.strictEqual(velho.status, 409);
});

test('versão inválida (texto, zero, negativa, booleana) → 400', async () => {
  const a = await h.novoAchado(token, orgao.id);
  for (const versao of ['abc', 0, -1, true, [1], 1.5]) {
    assert.strictEqual((await h.req('PUT', `/achados/${a.id}`, { token, body: corpoPut(a, { versao }) })).status, 400, JSON.stringify(versao));
  }
});

test('migração: banco antigo (sem coluna versao) recebe a coluna com valor 1 e continua funcionando', () => {
  const { DatabaseSync } = require('node:sqlite');
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');
  const arquivo = path.join(os.tmpdir(), `saac_versao_${process.pid}.db`);
  try {
    const antigo = new DatabaseSync(arquivo);
    antigo.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE, senha TEXT NOT NULL, area TEXT NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE orgaos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, tipo TEXT NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE achados (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, descricao TEXT NOT NULL, severidade TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Em aberto', orgao_id INTEGER NOT NULL, criado_por_id INTEGER NOT NULL, criado_em TEXT NOT NULL DEFAULT (datetime('now')), atualizado_em TEXT);
      INSERT INTO usuarios (nome,email,senha,area) VALUES ('A','a@a.com','x','Saúde');
      INSERT INTO orgaos (nome,tipo) VALUES ('Antigo','Secretaria');
      INSERT INTO achados (titulo,descricao,severidade,orgao_id,criado_por_id) VALUES ('Achado antigo 1','d','Alto',1,1);`);
    antigo.close();
    const script = `const db=require(${JSON.stringify(path.join(__dirname, '..', 'db.js'))});require(${JSON.stringify(path.join(__dirname, '..', 'db.js'))});
      console.log(JSON.stringify({v:db.prepare('SELECT versao FROM achados').get().versao, oe:db.prepare('SELECT excluido_em FROM orgaos').get().excluido_em, view:db.prepare('SELECT COUNT(*) n FROM vw_resumo_orgaos').get().n}));`;
    const r = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, SAAC_DB_PATH: arquivo }, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.deepStrictEqual(JSON.parse(r.stdout.trim().split('\n').pop()), { v: 1, oe: null, view: 1 });
  } finally {
    ['', '-wal', '-shm', '-journal'].forEach((s) => fs.rmSync(arquivo + s, { force: true }));
  }
});

// ---------------- Fuso America/Fortaleza ----------------
test('services/tempo: UTC → America/Fortaleza (UTC-3), inclusive virada de dia e formato ISO', () => {
  assert.strictEqual(paraFortaleza('2026-11-10 16:34:18'), '2026-11-10 13:34:18');
  assert.strictEqual(paraFortaleza('2026-11-10 02:30:00'), '2026-11-09 23:30:00');
  assert.strictEqual(paraFortaleza('2026-11-10 03:00:00'), '2026-11-10 00:00:00');
  assert.strictEqual(paraFortaleza('2026-11-10T16:34:18.000Z'), '2026-11-10 13:34:18');
  assert.strictEqual(paraFortaleza(null), '');
  assert.strictEqual(paraFortaleza('lixo'), 'lixo');
});

test('CSV: a coluna "Criado em" sai em America/Fortaleza (a API continua em UTC)', async () => {
  const a = await h.novoAchado(token, orgao.id, { titulo: 'Achado do fuso horario' });
  h.db.prepare("UPDATE achados SET criado_em = '2026-11-10 02:30:00' WHERE id = ?").run(a.id);
  const csv = await h.req('GET', '/achados/exportar.csv?q=fuso%20horario', { token });
  const linha = csv.texto.split('\r\n').find((l) => l.includes('Achado do fuso horario'));
  assert.ok(linha.endsWith(';2026-11-09 23:30:00'), linha);
  assert.strictEqual((await h.req('GET', `/achados/${a.id}`, { token })).corpo.achado.criado_em, '2026-11-10 02:30:00');
});

// carrega o config.js do frontend em um contexto isolado para testar as funções de data
function carregarConfigFrontend() {
  const codigo = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'js', 'config.js'), 'utf8');
  return vm.runInNewContext(`${codigo}\n({ formatarDataHora, formatarData, dataDeUtc })`, {
    window: { location: {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, fetch: () => {}, console,
  });
}

test('frontend: formatarDataHora/formatarData exibem America/Fortaleza (UTC-3) para os formatos do servidor', () => {
  const f = carregarConfigFrontend();
  assert.strictEqual(f.formatarDataHora('2026-11-10 16:34:18'), '10/11/2026 13:34');
  assert.strictEqual(f.formatarDataHora('2026-11-10 02:30:00'), '09/11/2026 23:30');
  assert.strictEqual(f.formatarDataHora('2026-11-10 03:00:00'), '10/11/2026 00:00', 'meia-noite local, não "24:00"');
  assert.strictEqual(f.formatarDataHora('2026-11-10T16:34:18.123Z'), '10/11/2026 13:34', 'ISO do Memento (com Z)');
  assert.strictEqual(f.formatarDataHora('2026-11-10T16:34:18'), '10/11/2026 13:34', 'ISO sem fuso é tratado como UTC');
  assert.strictEqual(f.formatarData('2026-11-10 02:30:00'), '09/11/2026', 'a data também vem do fuso local');
  assert.strictEqual(f.formatarDataHora(new Date('2026-11-10T16:34:00Z')), '10/11/2026 13:34');
  for (const ruim of [null, undefined, '', 'lixo']) assert.strictEqual(f.formatarDataHora(ruim), '');
});

test('frontend: nenhuma tela exibe criado_em sem passar pelas funções de fuso', () => {
  const dir = path.join(__dirname, '..', '..', 'frontend', 'js');
  for (const arq of fs.readdirSync(dir)) {
    fs.readFileSync(path.join(dir, arq), 'utf8').split('\n').forEach((linha, i) => {
      if (/criado_em/.test(linha) && !/^\s*\/\//.test(linha)) {
        assert.match(linha, /formatarData/, `${arq}:${i + 1} usa criado_em sem formatar: ${linha.trim()}`);
      }
    });
  }
});

// ---------------- Embeddings sem corrida ----------------
test('embedding: achado excluído enquanto o vetor era gerado NÃO ganha vetor depois', async () => {
  ollama.modoEmbed = 'ok';
  ollama.atrasoEmbedFn = () => 200;
  try {
    const a = await h.novoAchado(token, orgao.id, { titulo: 'Licitação para excluir logo', descricao: 'licitacao' });
    const del = await h.req('DELETE', `/achados/${a.id}`, { token });
    assert.strictEqual(del.status, 200);
    await new Promise((r) => setTimeout(r, 600));
    assert.strictEqual(qtdVetores(a.id), 0, 'nenhum vetor para achado excluído');
  } finally { ollama.atrasoEmbedFn = null; }
});

test('embedding: ao excluir um achado que já tinha vetor, o vetor é apagado', async () => {
  const a = await h.novoAchado(token, orgao.id, { titulo: 'Contrato com vetor', descricao: 'contrato sem fiscal' });
  assert.ok(await esperar(() => qtdVetores(a.id) === 1));
  await h.req('DELETE', `/achados/${a.id}`, { token });
  assert.strictEqual(qtdVetores(a.id), 0);
});

test('embedding: geração antiga e lenta não sobrescreve o vetor do texto novo (edição rápida em seguida)', async () => {
  ollama.modoEmbed = 'ok';
  ollama.atrasoEmbedFn = (texto) => (texto.includes('LENTO') ? 400 : 10);
  try {
    const a = await h.novoAchado(token, orgao.id, { titulo: 'LENTO licitacao irregular', descricao: 'licitacao licitacao' }); // geração lenta (texto A)
    await h.req('PUT', `/achados/${a.id}`, { token, body: corpoPut(a, { titulo: 'Medicamentos vencidos', descricao: 'medicamento vencido no estoque' }) }); // texto B, rápida
    assert.ok(await esperar(() => qtdVetores(a.id) === 1), 'vetor do texto novo gravado');
    await new Promise((r) => setTimeout(r, 700)); // a geração lenta (texto A) termina depois
    const vetor = JSON.parse(h.db.prepare('SELECT vetor FROM achados_embedding WHERE achado_id = ?').get(a.id).vetor);
    // dimensões do fake: [licita, medicament, contrato, diaria, obra]
    assert.ok(vetor[1] > 1, `vetor deve refletir "medicamento" (texto atual): ${vetor}`);
    assert.ok(vetor[0] < 1, `vetor NÃO deve refletir "licitação" (texto antigo): ${vetor}`);
  } finally { ollama.atrasoEmbedFn = null; }
});
