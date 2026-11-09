const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');
const fake = require('./fake-ollama');

let token; let outro; let ollama; let orgao;
const corpoRecomendacao = {
  titulo: 'Licitação sem documentação', descricao: 'Processo licitatório sem os documentos obrigatórios.',
  severidade: 'Alto', orgao_nome: 'Prefeitura X', orgao_tipo: 'Prefeitura',
};

before(async () => {
  await h.iniciar();
  ollama = await fake.criar();
  process.env.OLLAMA_URL = ollama.url;
  process.env.OLLAMA_MODEL = 'llama3.2:3b';
  process.env.OLLAMA_TIMEOUT_MS = '400';
  ({ token } = await h.novoUsuario());
  ({ token: outro } = await h.novoUsuario('Outro'));
  orgao = await h.novoOrgao(token, 'Prefeitura X', 'Prefeitura');
});
after(async () => { await ollama.fechar(); await h.encerrar(); });

test('recomendação: sucesso devolve texto, modelo, tempo e base utilizada', async () => {
  ollama.modo = 'ok';
  const r = await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao });
  assert.strictEqual(r.status, 200);
  assert.match(r.corpo.recomendacao, /Recomendação de teste/);
  assert.strictEqual(r.corpo.modelo, 'llama3.2:3b');
  assert.strictEqual(typeof r.corpo.tempo_ms, 'number');
  assert.deepStrictEqual(Object.keys(r.corpo.base_utilizada).sort(),
    ['descricao', 'orgao_nome', 'orgao_tipo', 'severidade', 'titulo']);
  // a requisição enviada ao Ollama segue o contrato pedido
  const enviada = ollama.requisicoes.filter((q) => q.url === '/api/generate').pop().corpo;
  assert.strictEqual(enviada.stream, false);
  assert.strictEqual(enviada.options.temperature, 0.3);
  assert.match(enviada.prompt, /auditor sênior/);
  assert.match(enviada.prompt, /Licitação sem documentação/);
});

test('recomendação: validações (400) e autenticação (401)', async () => {
  assert.strictEqual((await h.req('POST', '/ia/recomendacao', { body: corpoRecomendacao })).status, 401);
  assert.strictEqual((await h.req('POST', '/ia/recomendacao', { token, body: { titulo: 'x' } })).status, 400);
  assert.strictEqual((await h.req('POST', '/ia/recomendacao', { token, body: { ...corpoRecomendacao, severidade: 'Enorme' } })).status, 400);
});

test('503 quando o modelo não está instalado', async () => {
  ollama.modo = 'sem-modelo';
  const r = await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao });
  assert.strictEqual(r.status, 503);
  assert.match(r.corpo.erro, /IA local indisponível\. Verifique se o Ollama está em execução\./);
});

test('503 quando o Ollama está fora do ar', async () => {
  const urlOriginal = process.env.OLLAMA_URL;
  process.env.OLLAMA_URL = 'http://127.0.0.1:1'; // nada escutando
  const r = await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao });
  assert.strictEqual(r.status, 503);
  assert.match(r.corpo.erro, /IA local indisponível/);
  const st = await h.req('GET', '/ia/status', { token });
  assert.strictEqual(st.corpo.disponivel, false);
  process.env.OLLAMA_URL = urlOriginal;
});

test('504 em timeout', async () => {
  ollama.modo = 'lento';
  ollama.atrasoMs = 1200;
  const r = await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao });
  assert.strictEqual(r.status, 504);
});

test('502 com resposta vazia e com erro interno do modelo', async () => {
  ollama.modo = 'vazio';
  assert.strictEqual((await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao })).status, 502);
  ollama.modo = 'erro';
  assert.strictEqual((await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao })).status, 502);
});

test('status informa disponibilidade e modelo instalado', async () => {
  const r = await h.req('GET', '/ia/status', { token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.disponivel, true);
  assert.strictEqual(r.corpo.modelo_instalado, true);
  process.env.OLLAMA_MODEL = 'outro-modelo';
  assert.strictEqual((await h.req('GET', '/ia/status', { token })).corpo.modelo_instalado, false);
  process.env.OLLAMA_MODEL = 'llama3.2:3b';
});

// Prepara 3 achados (1 Crítico, 2 Alto) no mesmo órgão e devolve a chamada a /ia/padroes
const ultimaRequisicao = () => ollama.requisicoes.filter((q) => q.url === '/api/generate').pop().corpo;

test('padrões: 400 sem achados; com achados calcula estatísticas e fatos em JS e chama a IA', async () => {
  ollama.modo = 'ok';
  assert.strictEqual((await h.req('GET', '/ia/padroes', { token })).status, 400);
  for (let i = 0; i < 3; i += 1) await h.novoAchado(token, orgao.id, { severidade: i === 0 ? 'Crítico' : 'Alto' });
  ollama.resposta = null;
  const r = await h.req('GET', '/ia/padroes', { token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.estatisticas.total_achados, 3);
  assert.deepStrictEqual(r.corpo.estatisticas.por_severidade, { Alto: 2, 'Crítico': 1 });
  assert.deepStrictEqual(r.corpo.estatisticas.por_tipo_orgao, { Prefeitura: 3 });
  assert.strictEqual(r.corpo.estatisticas.orgaos_reincidentes[0].nome, 'Prefeitura X');
  assert.strictEqual(Object.values(r.corpo.estatisticas.por_mes)[0], 3);
  assert.strictEqual(r.corpo.estatisticas.em_aberto, 3);
  assert.ok(r.corpo.modelo && r.corpo.tempo_ms >= 0);

  // fatos já interpretados (a comparação de números é feita em JS)
  assert.ok(r.corpo.fatos.includes('A severidade mais frequente é Alto, com 2 de 3 achados (67%).'));
  assert.ok(r.corpo.fatos.includes('A severidade menos frequente é Crítico, com 1 de 3 achados (33%).'));
  assert.ok(r.corpo.fatos.some((f) => /Ranking de severidades.*Alto \(2\), Crítico \(1\)/.test(f)));
  assert.ok(r.corpo.fatos.some((f) => /Prefeitura X \(Prefeitura\) com 3 achados/.test(f)));
  assert.ok(r.corpo.fatos.some((f) => /Achados com status "Em aberto": 3 de 3 \(100%\)/.test(f)));

  // prompt e opções enviados ao modelo
  const enviada = ultimaRequisicao();
  assert.strictEqual(enviada.options.temperature, 0.2);
  assert.strictEqual(enviada.options.num_predict, 400);
  assert.match(enviada.prompt, /Use SOMENTE os fatos numerados abaixo/);
  assert.match(enviada.prompt, /Não compare números por conta própria/);
  assert.match(enviada.prompt, /1\. O total de achados cadastrados é 3\./);
  assert.match(enviada.prompt, /2\. A severidade mais frequente é Alto, com 2 de 3 achados \(67%\)\./);
});

test('padrões: resposta correta é mantida integralmente', async () => {
  ollama.modo = 'ok';
  ollama.resposta = [
    'Aqui estão as observações:',
    '2. Alto é a severidade mais frequente, com 2 de 3 achados (67%).',
    '5. Prefeitura X é reincidente, com 3 achados.',
    '7. Todos os 3 achados estão em aberto (100%).',
    'Ação prioritária: tratar primeiro os achados reincidentes da Prefeitura X.',
  ].join('\n');
  const r = await h.req('GET', '/ia/padroes', { token });
  assert.strictEqual(r.corpo.interpretado, true);
  assert.strictEqual(r.corpo.linhas_descartadas, 0);
  const linhas = r.corpo.analise.split('\n');
  assert.strictEqual(linhas.length, 4, 'sem a introdução solta');
  assert.match(linhas[0], /^2\. Alto é a severidade mais frequente/);
  assert.match(linhas[3], /^Ação prioritária:/);
});

test('padrões: linha com número inventado é descartada, as válidas permanecem', async () => {
  ollama.modo = 'ok';
  ollama.resposta = [
    '2. Alto é a severidade mais frequente, com 2 de 3 achados (67%).',
    '3. Crítico aparece em 9 de 3 achados.',
    '5. Prefeitura X é reincidente, com 3 achados.',
    'Ação prioritária: tratar a Prefeitura X.',
  ].join('\n');
  const r = await h.req('GET', '/ia/padroes', { token });
  assert.strictEqual(r.corpo.interpretado, true);
  assert.strictEqual(r.corpo.linhas_descartadas, 1);
  assert.ok(!r.corpo.analise.includes('9 de 3'));
  assert.match(r.corpo.analise, /^2\. /);
  assert.match(r.corpo.analise, /\n5\. /);
});

test('padrões: número do fato fora do intervalo ou percentual inventado também é descartado', async () => {
  ollama.modo = 'ok';
  ollama.resposta = [
    '2. Alto é a severidade mais frequente, com 2 de 3 achados (67%).',
    '99. Fato que não existe com 3 achados.',
    '3. Crítico representa 41% dos achados.',
    '5. Prefeitura X é reincidente, com 3 achados.',
  ].join('\n');
  const r = await h.req('GET', '/ia/padroes', { token });
  assert.strictEqual(r.corpo.linhas_descartadas, 2);
  assert.strictEqual(r.corpo.analise.split('\n').length, 2);
});

test('padrões: numeração duplicada do modelo é normalizada e linha cortada (truncada) é descartada', async () => {
  ollama.modo = 'ok';
  ollama.resposta = [
    '1. 2. Alto é a severidade mais frequente, com 2 de 3 achados (67%).',
    '2. 5. Prefeitura X é reincidente, com 3 achados.',
    '3. 7. Todos os 3 achados estão em aberto e a situação exige atenção com',
    'Ação prioritária: tratar a Prefeitura X e reduzir a reinciden',
  ].join('\n');
  const r = await h.req('GET', '/ia/padroes', { token });
  assert.strictEqual(r.corpo.interpretado, true);
  assert.strictEqual(r.corpo.linhas_descartadas, 2, 'a linha truncada e a ação truncada');
  const linhas = r.corpo.analise.split('\n');
  assert.strictEqual(linhas.length, 2);
  assert.ok(linhas[0].startsWith('2. Alto é a severidade'), 'usa o número do fato, não o da lista do modelo');
  assert.ok(linhas[1].startsWith('5. Prefeitura X'));
});

test('padrões: sem pelo menos 2 linhas válidas devolve só os fatos com a mensagem de segurança', async () => {
  ollama.modo = 'ok';
  ollama.resposta = [
    '2. Críticos são mais frequentes que altos, com 8 de 3 achados.',
    '3. Há 12 achados em atraso.',
    '5. Prefeitura X é reincidente, com 3 achados.',
  ].join('\n');
  const r = await h.req('GET', '/ia/padroes', { token });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.corpo.interpretado, false);
  assert.strictEqual(r.corpo.analise, 'A IA não conseguiu interpretar com segurança; veja os fatos acima.');
  assert.ok(r.corpo.fatos.length >= 6, 'fatos continuam disponíveis');
  ollama.resposta = null;
});

test('recomendação: o prompt proíbe citar leis, artigos e números fora dos dados recebidos', async () => {
  ollama.modo = 'ok';
  await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao });
  const prompt = ultimaRequisicao().prompt;
  assert.match(prompt, /não cite leis, decretos, normas, artigos ou números/);
  assert.match(prompt, /que não estejam escritos no achado/);
});

test('métricas: registra usos, tempo médio e taxa de aceitação', async () => {
  ollama.modo = 'ok';
  const antes = (await h.req('GET', '/ia/metricas', { token })).corpo;
  const a = await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao });
  const b = await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao });
  assert.strictEqual((await h.req('POST', `/ia/uso/${a.corpo.uso_id}/resultado`, { token, body: { resultado: 'aceita' } })).status, 200);
  assert.strictEqual((await h.req('POST', `/ia/uso/${b.corpo.uso_id}/resultado`, { token, body: { resultado: 'descartada' } })).status, 200);
  const m = (await h.req('GET', '/ia/metricas', { token })).corpo;
  assert.strictEqual(m.total_usos, antes.total_usos + 2);
  assert.strictEqual(m.aceitas, 1);
  assert.strictEqual(m.descartadas, 1);
  assert.strictEqual(m.taxa_aceitacao, 50);
  assert.strictEqual(typeof m.tempo_medio_ms, 'number');
  // falhas de IA não entram nas métricas
  ollama.modo = 'vazio';
  await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao });
  assert.strictEqual((await h.req('GET', '/ia/metricas', { token })).corpo.total_usos, m.total_usos);
});

test('resultado: valida valor, existência e dono do registro', async () => {
  ollama.modo = 'ok';
  const a = await h.req('POST', '/ia/recomendacao', { token, body: corpoRecomendacao });
  assert.strictEqual((await h.req('POST', `/ia/uso/${a.corpo.uso_id}/resultado`, { token, body: { resultado: 'talvez' } })).status, 400);
  assert.strictEqual((await h.req('POST', '/ia/uso/99999/resultado', { token, body: { resultado: 'aceita' } })).status, 404);
  assert.strictEqual((await h.req('POST', `/ia/uso/${a.corpo.uso_id}/resultado`, { token: outro, body: { resultado: 'aceita' } })).status, 403);
});

test('recomendação é gravada e devolvida pelo CRUD de achados', async () => {
  const achado = await h.novoAchado(token, orgao.id, { recomendacao: '  Revisar controles.  ' });
  assert.strictEqual(achado.recomendacao, 'Revisar controles.');
  const lista = await h.req('GET', `/achados?q=${encodeURIComponent('Achado de teste')}`, { token });
  assert.ok(lista.corpo.dados.every((x) => 'recomendacao' in x));
  const base = { titulo: achado.titulo, descricao: achado.descricao, severidade: 'Alto', orgao_id: orgao.id, status: 'Em aberto' };
  const put = await h.req('PUT', `/achados/${achado.id}`, { token, body: base });
  assert.strictEqual(put.corpo.achado.recomendacao, 'Revisar controles.', 'PUT sem o campo preserva a recomendação');
  const limpa = await h.req('PUT', `/achados/${achado.id}`, { token, body: { ...base, recomendacao: '' } });
  assert.strictEqual(limpa.corpo.achado.recomendacao, null);
  const longa = await h.req('POST', '/achados', { token, body: { titulo: 'Titulo valido', descricao: 'Desc', severidade: 'Alto', orgao_id: orgao.id, recomendacao: 'x'.repeat(2001) } });
  assert.strictEqual(longa.status, 400);
});
