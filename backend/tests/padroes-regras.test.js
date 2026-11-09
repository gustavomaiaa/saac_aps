// Regras determinísticas da validação da interpretação da IA (services/padroes.js):
// status/severidades inexistentes, tendência com meses empatados e ação prioritária inválida.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./helpers');
const fake = require('./fake-ollama');
const padroes = require('../services/padroes');

// ---- Dados de apoio (fatos reais gerados pelo próprio sistema) ----
const base = {
  total_achados: 4, em_aberto: 4,
  por_severidade: { Alto: 2, Baixo: 2 },
  por_tipo_orgao: { Prefeitura: 4 },
  orgaos_reincidentes: [{ nome: 'Prefeitura Y', tipo: 'Prefeitura', total: 4 }],
  por_mes: { '2026-08': 2, '2026-09': 2 }, // EMPATE entre os meses
};
const empate = padroes.montarFatosEMeta(base);
const distinto = padroes.montarFatosEMeta({ ...base, por_mes: { '2026-08': 3, '2026-09': 1 } });
const semReincidentes = padroes.montarFatosEMeta({ ...base, orgaos_reincidentes: [] });

const RISCO = 'Risco: A divisão igual entre severidades altas e baixas indica exposição parcial a falhas de controle [2][4].';
const CONC = 'Concentração: Todos os achados estão num único órgão reincidente, o que indica fragilidade localizada [6].';
const TEND_OK = 'Tendência: O volume mensal parece estável, sem sinais de piora nos registros [7].';
const ACAO_OK = 'Ação prioritária: Revisar os controles internos do órgão reincidente [6].';
const FIXA_TENDENCIA = 'Tendência: Os achados estão distribuídos de forma uniforme entre os meses com mais registros [7].';
const FIXA_ACAO = 'Ação prioritária: Priorizar o acompanhamento dos órgãos reincidentes [6].';

const validar = (linhas, ctx = empate) => padroes.validarAnalise(linhas.join('\n'), ctx.fatos, ctx.meta);

test('meta dos fatos: posição dos fatos de meses e reincidentes e detecção de empate', () => {
  assert.strictEqual(empate.meta.mesesEmpatados, true);
  assert.match(empate.fatos[empate.meta.idxMeses - 1], /^Os meses com mais achados cadastrados, empatados/);
  assert.match(empate.fatos[empate.meta.idxReincidentes - 1], /^Órgãos reincidentes/);
  assert.strictEqual(distinto.meta.mesesEmpatados, false);
  assert.strictEqual(semReincidentes.meta.haReincidentes, false);
});

// ---------------- Regra 1: status e severidades inexistentes ----------------
test('regra 1: linha que cita status inexistente é descartada (Resolvido, Fechado, Concluído, Pendente...)', () => {
  const invalidos = [
    'Risco: Há achados com status "Resolvido" que ainda exigem acompanhamento do órgão [2].',
    'Risco: Os achados Fechados indicam boa resposta do órgão às recomendações [2].',
    'Risco: Os achados Concluídos mostram avanço, mas o risco residual continua relevante [2].',
    'Risco: Muitos achados Pendentes elevam a exposição do órgão a novas falhas [2].',
    'Risco: Achados com status "Em andamento" indicam risco de atrasos na correção [2].',
    'Risco: Achados com status "Arquivado" deixam o risco sem tratamento adequado [2].',
  ];
  for (const linha of invalidos) {
    const r = validar([linha, CONC, TEND_OK]);
    assert.ok(!r.analise.includes(linha), `deveria descartar: ${linha}`);
    assert.strictEqual(padroes.vocabularioInvalido(linha) !== null, true, linha);
    assert.ok(r.descartadas >= 1, linha);
  }
});

test('regra 1: status válidos continuam aceitos', () => {
  for (const status of ['Em aberto', 'Em análise', 'Implementado', 'Rejeitado']) {
    const linha = `Risco: Achados com status "${status}" exigem acompanhamento contínuo do órgão [2].`;
    assert.strictEqual(padroes.vocabularioInvalido(linha), null, status);
    assert.ok(validar([linha, CONC]).analise.includes(linha), status);
  }
});

test('regra 1: severidade fora de Crítico/Alto/Médio/Baixo é descartada; as válidas (inclusive Alta/Média) passam', () => {
  const invalidas = [
    'Risco: Achados de severidade "Grave" indicam exposição elevada do órgão [2].',
    'Risco: A severidade Moderada predomina e sugere falhas de controle [2][4].',
    'Risco: Predominam achados de severidade gravíssima, o que sugere exposição elevada [2].',
    'Risco: O nível leve dos achados sugere falhas apenas formais de controle [2].',
    'Risco: Achados de severidade "Urgente" exigem atenção imediata da gestão [2].',
  ];
  for (const linha of invalidas) {
    assert.ok(padroes.vocabularioInvalido(linha), linha);
    assert.ok(!validar([linha, CONC, TEND_OK]).analise.includes(linha), linha);
  }
  for (const linha of [
    'Risco: Achados de severidade "Alto" indicam exposição relevante a falhas de controle [2].',
    'Risco: Achados de severidade Alta e Média indicam falhas relevantes de controle [2][4].',
    'Risco: A severidade Crítica é rara, mas Baixa é comum nos registros do órgão [3][4].',
  ]) {
    assert.strictEqual(padroes.vocabularioInvalido(linha), null, linha);
  }
});

// ---------------- Regra 2: tendência com meses empatados ----------------
test('regra 2: com meses empatados a linha de Tendência do modelo é trocada pela frase fixa (sem palavras de variação)', () => {
  const variacoes = [
    'Tendência: A tendência de aumentar a frequência de achados em 2026-08 e 2026-09 exige ajustes [7].',
    'Tendência: O aumento de achados nos meses mais carregados sugere piora nos controles [7].',
    'Tendência: Há uma queda gradual dos registros, o que pode indicar melhora [7].',
    'Tendência: Os achados tendem a crescer nos próximos meses se nada for feito [7].',
    'Tendência: É possível diminuir o volume de achados com ajustes nos processos [7].',
  ];
  for (const linha of variacoes) {
    const r = validar([RISCO, CONC, linha]);
    assert.ok(r.analise.includes(FIXA_TENDENCIA), linha);
    assert.ok(!/aument|queda|cresc|diminu|tendência de/i.test(r.analise.split('\n').find((l) => l.startsWith('Tendência'))), linha);
    assert.strictEqual(r.substituidas, 1);
  }
  // mesmo uma Tendência "inofensiva" não é aceita quando há empate: só a frase fixa
  const r = validar([RISCO, CONC, TEND_OK]);
  assert.ok(r.analise.includes(FIXA_TENDENCIA));
  assert.ok(!r.analise.includes('parece estável'));
});

test('regra 2: com meses distintos a Tendência do modelo é mantida (sem frase fixa)', () => {
  const r = validar([RISCO, CONC, TEND_OK], distinto);
  assert.ok(r.analise.includes(TEND_OK));
  assert.ok(!r.analise.includes('uniforme'));
  assert.strictEqual(r.substituidas, 0);
});

// ---------------- Regra 3: ação prioritária ----------------
test('regra 3: ação válida é mantida; ação com status/severidade inválidos vira a ação fixa dos órgãos reincidentes', () => {
  const ok = validar([RISCO, CONC, TEND_OK, ACAO_OK]);
  assert.ok(ok.analise.includes(ACAO_OK));
  assert.ok(!ok.analise.includes(FIXA_ACAO));

  for (const acao of [
    'Ação prioritária: Reduzir os achados Pendentes e aumentar os achados com status "Resolvido" [2].',
    'Ação prioritária: Tratar primeiro os achados de severidade "Grave" do órgão [2].',
    'Ação prioritária: Reabrir os achados Fechados que ainda têm risco [2].',
  ]) {
    const r = validar([RISCO, CONC, TEND_OK, acao]);
    assert.ok(!r.analise.includes(acao), acao);
    assert.ok(r.analise.endsWith(FIXA_ACAO), acao);
    assert.ok(r.substituidas >= 1);
  }
});

test('regra 3: ação descartada por outro motivo (número inventado, cortada) também vira ação fixa; sem reincidentes usa ação neutra', () => {
  assert.ok(validar([RISCO, CONC, TEND_OK, 'Ação prioritária: Auditar os 99 contratos do órgão [6].']).analise.endsWith(FIXA_ACAO));
  assert.ok(validar([RISCO, CONC, TEND_OK, 'Ação prioritária: Priorizar a auditoria do órgão reinc']).analise.endsWith(FIXA_ACAO));
  const sem = validar([RISCO, CONC, TEND_OK, 'Ação prioritária: Fechar os achados Resolvidos [2].'], semReincidentes);
  assert.ok(sem.analise.endsWith('Ação prioritária: Manter o acompanhamento periódico dos achados cadastrados [1].'));
  // sem linha de ação do modelo: nada é inventado
  assert.ok(!validar([RISCO, CONC, TEND_OK]).analise.includes('Ação prioritária'));
});

test('fallback continua valendo: com menos de 2 linhas úteis só os fatos são devolvidos (mesmo com frases fixas disponíveis)', () => {
  const r = validar([RISCO, 'Ação prioritária: Fechar achados Resolvidos [2].']);
  assert.strictEqual(r.interpretado, false);
  assert.strictEqual(r.analise, padroes.MSG_SEM_INTERPRETACAO);
  assert.strictEqual(r.substituidas, 0);
});

// ---------------- Integração pela API ----------------
let token; let ollama;
before(async () => {
  await h.iniciar();
  ollama = await fake.criar();
  process.env.OLLAMA_URL = ollama.url;
  process.env.OLLAMA_TIMEOUT_MS = '1000';
  ({ token } = await h.novoUsuario());
  const org = await h.novoOrgao(token, 'Prefeitura Y', 'Prefeitura');
  const meses = ['2026-08-10 10:00:00', '2026-08-20 10:00:00', '2026-09-05 10:00:00', '2026-09-25 10:00:00'];
  for (let i = 0; i < 4; i += 1) {
    const a = await h.novoAchado(token, org.id, { titulo: `Achado do mês ${i}`, severidade: i < 2 ? 'Alto' : 'Baixo' });
    h.db.prepare('UPDATE achados SET criado_em = ? WHERE id = ?').run(meses[i], a.id);
  }
});
after(async () => { await ollama.fechar(); await h.encerrar(); });

test('API: resposta com "Resolvido" na ação e "tendência de aumentar" com meses empatados sai com frases fixas', async () => {
  ollama.modo = 'ok';
  ollama.resposta = [
    RISCO, CONC,
    'Tendência: A tendência de aumentar a frequência de achados em 2026-08 e 2026-09 exige ajustes [7].',
    'Ação prioritária: Aumentar os achados com status "Resolvido" no órgão [2].',
  ].join('\n');
  const r = (await h.req('GET', '/ia/padroes', { token })).corpo;
  assert.strictEqual(r.interpretado, true);
  assert.strictEqual(r.linhas_substituidas, 2);
  const linhas = r.analise.split('\n');
  assert.strictEqual(linhas.length, 4);
  assert.strictEqual(linhas[2], FIXA_TENDENCIA);
  assert.strictEqual(linhas[3], FIXA_ACAO);
  assert.ok(!/Resolvido|aumentar/i.test(r.analise));
  assert.match(r.fatos[6], /^Os meses com mais achados cadastrados, empatados/);
});
