const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');
const fake = require('./fake-ollama');
const semelhantes = require('../services/semelhantes');

let token; let ollama; let orgaoA; let orgaoB;
const urlFalsa = 'http://127.0.0.1:1';

const esperar = async (condicao, ms = 3000) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if (condicao()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};
const qtdEmbeddings = (id) => h.db.prepare('SELECT COUNT(*) n FROM achados_embedding WHERE achado_id = ?').get(id).n;
const ultima = (url) => ollama.requisicoes.filter((q) => q.url === url).pop().corpo;

before(async () => {
  await h.iniciar();
  ollama = await fake.criar();
  process.env.OLLAMA_URL = ollama.url;
  process.env.OLLAMA_MODEL = 'llama3.2:3b';
  process.env.OLLAMA_TIMEOUT_MS = '500';
  ({ token } = await h.novoUsuario());
  orgaoA = await h.novoOrgao(token, 'Prefeitura A', 'Prefeitura');
  orgaoB = await h.novoOrgao(token, 'Secretaria B', 'Secretaria');
});
after(async () => { await ollama.fechar(); await h.encerrar(); });

// ---------------- Severidade sugerida ----------------
const corpoSev = { titulo: 'Pagamentos sem liquidação', descricao: 'Foram pagos 3 contratos antes da liquidação da despesa.' };

test('severidade: resposta válida devolve severidade, justificativa, modelo e tempo; registra uso', async () => {
  ollama.modo = 'ok';
  ollama.resposta = JSON.stringify({ severidade: 'Alto', justificativa: 'Há falha de controle na liquidação. O risco financeiro é relevante.' });
  const r = await h.req('POST', '/ia/severidade', { token, body: corpoSev });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.severidade, 'Alto');
  assert.match(r.corpo.justificativa, /falha de controle/);
  assert.strictEqual(r.corpo.modelo, 'llama3.2:3b');
  assert.strictEqual(typeof r.corpo.tempo_ms, 'number');
  assert.ok(r.corpo.uso_id);
  assert.strictEqual(ultima('/api/generate').format, 'json', 'pede saída em JSON ao Ollama');
  assert.match(ultima('/api/generate').prompt, /não cite leis, decretos, artigos, normas nem números/);
  const uso = h.db.prepare('SELECT tipo FROM ia_uso WHERE id = ?').get(r.corpo.uso_id);
  assert.strictEqual(uso.tipo, 'severidade');
  const m = (await h.req('GET', '/ia/metricas', { token })).corpo;
  assert.strictEqual(m.por_tipo.severidade, 1);
  assert.strictEqual((await h.req('POST', `/ia/uso/${r.corpo.uso_id}/resultado`, { token, body: { resultado: 'aceita' } })).status, 200);
});

test('severidade: valor fora da lista, texto não-JSON e JSON sem campo geram 502 e não entram nas métricas', async () => {
  const antes = (await h.req('GET', '/ia/metricas', { token })).corpo.total_usos;
  for (const resposta of [
    JSON.stringify({ severidade: 'Gravíssimo', justificativa: 'x.' }),
    JSON.stringify({ severidade: 'alto', justificativa: 'x.' }),
    'Eu acho que é alto.',
    JSON.stringify({ justificativa: 'sem severidade.' }),
    '[1,2,3]',
  ]) {
    ollama.resposta = resposta;
    const r = await h.req('POST', '/ia/severidade', { token, body: corpoSev });
    assert.strictEqual(r.status, 502, resposta);
    assert.match(r.corpo.erro, /severidade inválida/);
    assert.match(r.corpo.erro, /Crítico, Alto, Médio, Baixo/);
  }
  assert.strictEqual((await h.req('GET', '/ia/metricas', { token })).corpo.total_usos, antes);
});

test('severidade: JSON cercado de texto ainda é lido; justificativa é cortada em 2 frases', async () => {
  ollama.resposta = 'Claro! {"severidade": "Crítico", "justificativa": "Primeira frase. Segunda frase. Terceira frase."} Espero ter ajudado.';
  const r = await h.req('POST', '/ia/severidade', { token, body: corpoSev });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.severidade, 'Crítico');
  assert.strictEqual(r.corpo.justificativa, 'Primeira frase. Segunda frase.');
});

test('severidade: justificativa com lei, artigo ou número ausente do texto é omitida', async () => {
  for (const justificativa of ['Viola a Lei 8.666.', 'Contraria o artigo 37.', 'Causou prejuízo de 500 mil.', 'Afeta 9 contratos.']) {
    ollama.resposta = JSON.stringify({ severidade: 'Alto', justificativa });
    const r = await h.req('POST', '/ia/severidade', { token, body: corpoSev });
    assert.strictEqual(r.status, 200, justificativa);
    assert.strictEqual(r.corpo.severidade, 'Alto');
    assert.match(r.corpo.justificativa, /Justificativa omitida/, justificativa);
  }
  // número presente no texto do achado (3 contratos) é permitido
  ollama.resposta = JSON.stringify({ severidade: 'Alto', justificativa: 'Foram 3 contratos pagos sem liquidação.' });
  const ok = await h.req('POST', '/ia/severidade', { token, body: corpoSev });
  assert.match(ok.corpo.justificativa, /3 contratos/);
});

test('severidade: validações, autenticação, Ollama fora do ar e modelo ausente', async () => {
  assert.strictEqual((await h.req('POST', '/ia/severidade', { body: corpoSev })).status, 401);
  assert.strictEqual((await h.req('POST', '/ia/severidade', { token, body: { titulo: 'só título' } })).status, 400);
  ollama.modo = 'sem-modelo';
  assert.strictEqual((await h.req('POST', '/ia/severidade', { token, body: corpoSev })).status, 503);
  ollama.modo = 'ok';
  process.env.OLLAMA_URL = urlFalsa;
  const fora = await h.req('POST', '/ia/severidade', { token, body: corpoSev });
  assert.strictEqual(fora.status, 503);
  assert.match(fora.corpo.erro, /IA local indisponível/);
  process.env.OLLAMA_URL = ollama.url;
});

// ---------------- Cosseno ----------------
test('cosseno: vetores conhecidos', () => {
  assert.strictEqual(semelhantes.cosseno([1, 0], [1, 0]), 1);
  assert.strictEqual(semelhantes.cosseno([1, 0], [0, 1]), 0);
  assert.strictEqual(semelhantes.cosseno([1, 0], [-1, 0]), -1);
  assert.ok(Math.abs(semelhantes.cosseno([1, 1], [1, 0]) - Math.SQRT1_2) < 1e-12);
  assert.ok(Math.abs(semelhantes.cosseno([3, 4], [6, 8]) - 1) < 1e-12, 'independe da escala');
  assert.strictEqual(semelhantes.cosseno([0, 0], [1, 1]), 0, 'vetor nulo');
  assert.strictEqual(semelhantes.cosseno([1, 2], [1, 2, 3]), 0, 'tamanhos diferentes');
  assert.strictEqual(semelhantes.cosseno([], []), 0);
});

// ---------------- Embeddings e achados semelhantes ----------------
test('embedding é gerado ao criar, substituído ao editar e removido ao excluir', async () => {
  ollama.modoEmbed = 'ok';
  const a = await h.novoAchado(token, orgaoA.id, { titulo: 'Licitação sem documentação', descricao: 'Licitação conduzida sem documentos. Nova licitação idêntica.' });
  assert.ok(await esperar(() => qtdEmbeddings(a.id) === 1), 'embedding criado em segundo plano');
  const linha = h.db.prepare('SELECT vetor, modelo FROM achados_embedding WHERE achado_id = ?').get(a.id);
  assert.strictEqual(linha.modelo, 'nomic-embed-text');
  const antes = JSON.parse(linha.vetor);
  assert.strictEqual(antes.length, 5);
  assert.match(ultima('/api/embed').input, /^search_document: /);

  await h.req('PUT', `/achados/${a.id}`, { token, body: { titulo: 'Medicamentos vencidos', descricao: 'Medicamentos vencidos no estoque', severidade: 'Alto', orgao_id: orgaoA.id, status: 'Em aberto' } });
  assert.ok(await esperar(() => qtdEmbeddings(a.id) === 1 && JSON.parse(h.db.prepare('SELECT vetor FROM achados_embedding WHERE achado_id = ?').get(a.id).vetor)[1] > 1));

  await h.req('DELETE', `/achados/${a.id}`, { token });
  assert.strictEqual(qtdEmbeddings(a.id), 0);
});

test('semelhantes: top 3 ordenados com percentual; abaixo do limiar não aparece; duplicidade acima do limiar', async () => {
  // base limpa de achados vivos
  const A = await h.novoAchado(token, orgaoA.id, { titulo: 'Licitação sem parecer jurídico', descricao: 'Licitação sem parecer. Licitação irregular.' });
  const E = await h.novoAchado(token, orgaoB.id, { titulo: 'Licitação e contrato irregulares', descricao: 'Licitação com falhas. Outra licitação. Contrato sem fiscal.' });
  const M = await h.novoAchado(token, orgaoA.id, { titulo: 'Medicamentos vencidos', descricao: 'Medicamentos fora da validade no estoque.' });
  assert.ok(await esperar(() => [A, E, M].every((x) => qtdEmbeddings(x.id) === 1)));

  const q = new URLSearchParams({ titulo: 'Licitação sem parecer', descricao: 'Licitação irregular', orgao_id: String(orgaoA.id) });
  const r = await h.req('GET', `/ia/semelhantes?${q}`, { token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.limiar, 0.8);
  const ids = r.corpo.semelhantes.map((s) => s.id);
  assert.ok(ids.includes(A.id) && ids.includes(E.id));
  assert.ok(!ids.includes(M.id), 'tema diferente fica abaixo do limiar');
  assert.ok(r.corpo.semelhantes.length <= 3);
  const s0 = r.corpo.semelhantes[0];
  assert.strictEqual(s0.id, A.id, 'o mais parecido vem primeiro');
  assert.deepStrictEqual(Object.keys(s0).sort(), ['id', 'mesmo_orgao', 'orgao_nome', 'percentual', 'severidade', 'similaridade', 'titulo']);
  assert.ok(s0.percentual >= 90 && s0.percentual <= 100);
  assert.strictEqual(s0.mesmo_orgao, true);
  assert.ok(r.corpo.semelhantes[0].similaridade >= r.corpo.semelhantes[1].similaridade);
  assert.strictEqual(r.corpo.possivel_duplicidade, true);

  // texto de outro assunto: nada parecido
  const outro = await h.req('GET', `/ia/semelhantes?${new URLSearchParams({ titulo: 'Diárias de viagem', descricao: 'Diárias sem comprovação' })}`, { token });
  assert.deepStrictEqual(outro.corpo.semelhantes, []);
  assert.strictEqual(outro.corpo.possivel_duplicidade, false);

  // excluir_id: não sugere o próprio achado em edição
  const sem = await h.req('GET', `/ia/semelhantes?${q}&excluir_id=${A.id}`, { token });
  assert.ok(!sem.corpo.semelhantes.some((s) => s.id === A.id));

  // limiar configurável
  process.env.SEMELHANTES_LIMIAR = '0,999';
  const estrito = await h.req('GET', `/ia/semelhantes?${new URLSearchParams({ titulo: 'Licitação sem parecer', descricao: 'Licitação irregular com contrato' })}`, { token });
  assert.strictEqual(estrito.corpo.limiar, 0.999);
  assert.deepStrictEqual(estrito.corpo.semelhantes, []);
  delete process.env.SEMELHANTES_LIMIAR;

  // achado excluído não é sugerido
  await h.req('DELETE', `/achados/${A.id}`, { token });
  const aposExcluir = await h.req('GET', `/ia/semelhantes?${q}`, { token });
  assert.ok(!aposExcluir.corpo.semelhantes.some((s) => s.id === A.id));
});

test('semelhantes: validações, autenticação e erros claros (modelo ausente, Ollama fora do ar, embedding inválido)', async () => {
  const q = new URLSearchParams({ titulo: 'Licitação', descricao: 'Licitação irregular' });
  assert.strictEqual((await h.req('GET', `/ia/semelhantes?${q}`)).status, 401);
  assert.strictEqual((await h.req('GET', '/ia/semelhantes?titulo=x', { token })).status, 400);

  ollama.modoEmbed = 'sem-modelo';
  const ausente = await h.req('GET', `/ia/semelhantes?${q}`, { token });
  assert.strictEqual(ausente.status, 503);
  assert.match(ausente.corpo.erro, /ollama pull nomic-embed-text/);

  ollama.modoEmbed = 'invalido';
  assert.strictEqual((await h.req('GET', `/ia/semelhantes?${q}`, { token })).status, 502);

  ollama.modoEmbed = 'ok';
  process.env.OLLAMA_URL = urlFalsa;
  const fora = await h.req('GET', `/ia/semelhantes?${q}`, { token });
  assert.strictEqual(fora.status, 503);
  assert.match(fora.corpo.erro, /IA local indisponível/);
  process.env.OLLAMA_URL = ollama.url;
});

test('sem o modelo de embeddings o formulário continua funcionando: criar e editar achado seguem normais', async () => {
  ollama.modoEmbed = 'sem-modelo';
  const a = await h.novoAchado(token, orgaoA.id, { titulo: 'Achado sem embeddings' });
  assert.ok(a && a.id, 'criação funciona (201)');
  const put = await h.req('PUT', `/achados/${a.id}`, { token, body: { titulo: 'Achado sem embeddings v2', descricao: a.descricao, severidade: 'Alto', orgao_id: orgaoA.id, status: 'Em aberto' } });
  assert.strictEqual(put.status, 200);
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(qtdEmbeddings(a.id), 0);
  ollama.modoEmbed = 'ok';
});

test('reindexar: gera embeddings dos achados sem vetor; interrompe com mensagem se a IA estiver fora', async () => {
  ollama.modoEmbed = 'sem-modelo';
  const x = await h.novoAchado(token, orgaoB.id, { titulo: 'Obra paralisada', descricao: 'Obra paralisada sem justificativa' });
  const y = await h.novoAchado(token, orgaoB.id, { titulo: 'Obra sem fiscal', descricao: 'Obra sem fiscal designado' });
  await new Promise((r) => setTimeout(r, 100));
  const falha = await semelhantes.reindexar();
  assert.ok(falha.erro && /ollama pull nomic-embed-text/.test(falha.erro));
  assert.ok(falha.falhas > 0);

  ollama.modoEmbed = 'ok';
  const ok = await semelhantes.reindexar();
  assert.strictEqual(ok.erro, null);
  assert.strictEqual(qtdEmbeddings(x.id), 1);
  assert.strictEqual(qtdEmbeddings(y.id), 1);
  assert.strictEqual((await semelhantes.reindexar()).total, 0, 'idempotente: nada pendente');
  assert.ok((await semelhantes.reindexar({ todos: true })).total >= 2, '--todos regenera');
});
