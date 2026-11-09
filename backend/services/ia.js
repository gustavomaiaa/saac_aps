// services/ia.js — cliente da IA local (Ollama). Nenhum dado sai da máquina:
// a unica chamada de rede e para OLLAMA_URL (por padrao http://localhost:11434).
// Usa o fetch nativo do Node e AbortController para o timeout.

const MSG_INDISPONIVEL = 'IA local indisponível. Verifique se o Ollama está em execução.';

class ErroIA extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.name = 'ErroIA';
    this.status = status;
  }
}

// Lê a configuração a cada chamada (permite alterar o .env / testes sem reiniciar o módulo)
function configuracao() {
  return {
    url: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, ''),
    modelo: process.env.OLLAMA_MODEL || 'llama3.2:3b',
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 120000,
  };
}

// Faz a requisicao com timeout. O timer cobre tambem a leitura do corpo da resposta.
async function requisitar(caminho, opcoes, timeoutMs, lerCorpo) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const resposta = await fetch(`${configuracao().url}${caminho}`, { ...opcoes, signal: controlador.signal });
    const corpo = await lerCorpo(resposta);
    return { resposta, corpo };
  } finally {
    clearTimeout(timer);
  }
}

// POST JSON ao Ollama com tratamento padrão de erros:
// 503 (Ollama fora do ar ou modelo ausente), 504 (timeout), 502 (erro interno do Ollama).
// Devolve o corpo JSON (ou null se ilegível).
async function postarJson(caminho, payload, mensagemModeloAusente) {
  const { timeoutMs } = configuracao();
  let resposta;
  let corpo;
  try {
    ({ resposta, corpo } = await requisitar(caminho, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, timeoutMs, async (r) => {
      const texto = await r.text();
      try { return JSON.parse(texto); } catch (e) { return null; }
    }));
  } catch (erro) {
    if (erro.name === 'AbortError') {
      throw new ErroIA(`A IA local demorou mais de ${Math.round(timeoutMs / 1000)}s para responder (tempo esgotado). Tente novamente.`, 504);
    }
    throw new ErroIA(MSG_INDISPONIVEL, 503);
  }
  if (resposta.status === 404) throw new ErroIA(mensagemModeloAusente, 503);
  if (!resposta.ok) throw new ErroIA('A IA local retornou um erro ao processar a solicitação.', 502);
  return corpo;
}

// Gera texto a partir de um prompt. Devolve { texto, modelo, tempo_ms }.
// opcoes: temperature, num_predict e json (pede saída em JSON ao Ollama).
// Erros: 503 (Ollama fora do ar ou modelo ausente), 504 (timeout), 502 (resposta vazia/invalida).
async function gerar(prompt, opcoes = {}) {
  const { modelo } = configuracao();
  const inicio = Date.now();
  const corpo = await postarJson('/api/generate', {
    model: modelo,
    prompt,
    stream: false,
    ...(opcoes.json ? { format: 'json' } : {}),
    options: { temperature: opcoes.temperature ?? 0.3, ...(opcoes.num_predict ? { num_predict: opcoes.num_predict } : {}) },
  }, `${MSG_INDISPONIVEL} (modelo "${modelo}" não instalado: ollama pull ${modelo})`);

  const texto = corpo && typeof corpo.response === 'string' ? corpo.response.trim() : '';
  if (!texto) throw new ErroIA('A IA local retornou uma resposta vazia. Tente novamente.', 502);

  return { texto, modelo: (corpo && corpo.model) || modelo, tempo_ms: Date.now() - inicio };
}

// Gera o embedding (vetor numérico) de um texto com o modelo de embeddings (padrão nomic-embed-text).
// Devolve { vetor, modelo, tempo_ms }. Mesmos erros de gerar(); modelo ausente => 503 com instrução.
async function embedding(texto) {
  const modelo = modeloEmbedding();
  const inicio = Date.now();
  const corpo = await postarJson('/api/embed', { model: modelo, input: texto },
    `Modelo de embeddings "${modelo}" não instalado. Execute: ollama pull ${modelo}`);
  const vetor = corpo && Array.isArray(corpo.embeddings) ? corpo.embeddings[0] : null;
  if (!Array.isArray(vetor) || vetor.length === 0 || !vetor.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new ErroIA('A IA local retornou um embedding inválido. Tente novamente.', 502);
  }
  return { vetor, modelo, tempo_ms: Date.now() - inicio };
}

function modeloEmbedding() {
  return process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
}

// Informa se o Ollama responde e se o modelo configurado esta instalado.
async function status() {
  const { url, modelo } = configuracao();
  try {
    const { resposta, corpo } = await requisitar('/api/tags', { method: 'GET' }, 5000, (r) => r.json());
    if (!resposta.ok) throw new Error('status http ' + resposta.status);
    const instalados = ((corpo && corpo.models) || []).map((m) => m.name || m.model);
    const instalado = instalados.some((n) => n === modelo || n === `${modelo}:latest`);
    return {
      disponivel: true,
      modelo,
      modelo_instalado: instalado,
      modelo_embedding: modeloEmbedding(),
      embedding_instalado: instalados.some((n) => n === modeloEmbedding() || n === `${modeloEmbedding()}:latest`),
      url,
      mensagem: instalado ? 'IA local pronta para uso.' : `Ollama em execução, mas o modelo "${modelo}" não está instalado (ollama pull ${modelo}).`,
    };
  } catch (erro) {
    return { disponivel: false, modelo, modelo_instalado: false, modelo_embedding: modeloEmbedding(), embedding_instalado: false, url, mensagem: MSG_INDISPONIVEL };
  }
}

// --- Prompts (em portugues) ---

// Recebe SOMENTE os campos que serao enviados ao modelo (a rota devolve essa mesma lista em base_utilizada)
function promptRecomendacao(base) {
  return [
    'Você é um auditor sênior de controle interno e conformidade no setor público.',
    'Com base apenas no achado de auditoria abaixo, escreva uma recomendação objetiva de até 4 frases, em português, com tom técnico.',
    'REGRAS: não cite leis, decretos, normas, artigos ou números de qualquer tipo (valores, prazos, percentuais, datas) que não estejam escritos no achado abaixo; não invente fatos, causas ou nomes. Se precisar de referência, use termos genéricos como "a legislação aplicável".',
    'Responda somente com o texto da recomendação.',
    '',
    `Órgão: ${base.orgao_nome} (${base.orgao_tipo || 'tipo não informado'})`,
    `Severidade: ${base.severidade}`,
    `Título: ${base.titulo}`,
    `Descrição: ${base.descricao}`,
  ].join('\n');
}

// fatos: lista de frases já interpretadas (ver services/padroes.js). A IA deve INTERPRETAR, não repetir.
function promptPadroes(fatos) {
  return [
    'Você é um auditor sênior de controle interno e conformidade no setor público.',
    'Use SOMENTE os fatos numerados abaixo. Não compare números por conta própria, não invente causas, leis, valores nem órgãos.',
    'Escreva exatamente 3 observações de INTERPRETAÇÃO, uma por linha, nesta ordem: "Risco: ...", "Concentração: ...", "Tendência: ...".',
    'Cada observação deve explicar o que os fatos significam para a auditoria, SEM repetir nem copiar as frases dos fatos, com no máximo 25 palavras, e citar entre colchetes o número do(s) fato(s) em que se baseia, por exemplo [2][6]. Evite escrever outros números além das citações.',
    'Termine com uma linha "Ação prioritária:" com uma única frase (pode citar fatos entre colchetes).',
    'Em português, tom técnico.',
    '',
    'FATOS:',
    ...fatos.map((f, k) => `[${k + 1}] ${f}`),
  ].join('\n');
}

// Pede a severidade em JSON. A rota valida o resultado (valor permitido, justificativa curta e sem referências inventadas).
function promptSeveridade(titulo, descricao) {
  return [
    'Você é um auditor sênior de controle interno e conformidade no setor público.',
    'Classifique a severidade do achado de auditoria abaixo usando EXATAMENTE um destes valores: "Crítico", "Alto", "Médio" ou "Baixo".',
    'Critérios: Crítico = risco grave de dano ao erário, fraude ou ilegalidade evidente; Alto = falha relevante de controle com impacto significativo; Médio = falha de controle com impacto moderado; Baixo = falha formal ou de baixo impacto.',
    'Responda SOMENTE com JSON no formato {"severidade": "<um dos quatro valores>", "justificativa": "<no máximo 2 frases curtas>"}.',
    'A justificativa deve usar apenas o que está escrito no achado: não cite leis, decretos, artigos, normas nem números que não apareçam no texto abaixo.',
    '',
    `Título: ${titulo}`,
    `Descrição: ${descricao}`,
  ].join('\n');
}

module.exports = { promptSeveridade, gerar, embedding, modeloEmbedding, status, promptRecomendacao, promptPadroes, ErroIA, MSG_INDISPONIVEL };
