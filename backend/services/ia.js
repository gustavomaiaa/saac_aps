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

// Gera texto a partir de um prompt. Devolve { texto, modelo, tempo_ms }.
// Erros: 503 (Ollama fora do ar ou modelo ausente), 504 (timeout), 502 (resposta vazia/invalida).
async function gerar(prompt) {
  const { modelo, timeoutMs } = configuracao();
  const inicio = Date.now();
  let resposta;
  let corpo;
  try {
    ({ resposta, corpo } = await requisitar('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt, stream: false, options: { temperature: 0.3 } }),
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

  if (resposta.status === 404) throw new ErroIA(`${MSG_INDISPONIVEL} (modelo "${modelo}" não instalado: ollama pull ${modelo})`, 503);
  if (!resposta.ok) throw new ErroIA('A IA local retornou um erro ao processar a solicitação.', 502);

  const texto = corpo && typeof corpo.response === 'string' ? corpo.response.trim() : '';
  if (!texto) throw new ErroIA('A IA local retornou uma resposta vazia. Tente novamente.', 502);

  return { texto, modelo: (corpo && corpo.model) || modelo, tempo_ms: Date.now() - inicio };
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
      url,
      mensagem: instalado ? 'IA local pronta para uso.' : `Ollama em execução, mas o modelo "${modelo}" não está instalado (ollama pull ${modelo}).`,
    };
  } catch (erro) {
    return { disponivel: false, modelo, modelo_instalado: false, url, mensagem: MSG_INDISPONIVEL };
  }
}

// --- Prompts (em portugues) ---

// Recebe SOMENTE os campos que serao enviados ao modelo (a rota devolve essa mesma lista em base_utilizada)
function promptRecomendacao(base) {
  return [
    'Você é um auditor sênior de controle interno e conformidade no setor público.',
    'Com base apenas no achado de auditoria abaixo, escreva uma recomendação objetiva de até 4 frases, em português, com tom técnico.',
    'Não invente leis, normas, artigos, valores, prazos ou números que não constem do achado. Responda somente com o texto da recomendação.',
    '',
    `Órgão: ${base.orgao_nome} (${base.orgao_tipo || 'tipo não informado'})`,
    `Severidade: ${base.severidade}`,
    `Título: ${base.titulo}`,
    `Descrição: ${base.descricao}`,
  ].join('\n');
}

function promptPadroes(estatisticas) {
  const linhas = (obj) => Object.entries(obj).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (sem dados)';
  const reincidentes = estatisticas.orgaos_reincidentes.length
    ? estatisticas.orgaos_reincidentes.map((o) => `- ${o.nome} (${o.tipo}): ${o.total} achados`).join('\n')
    : '- (nenhum órgão com 3 ou mais achados)';
  return [
    'Você é um auditor sênior de controle interno e conformidade no setor público.',
    'Abaixo estão estatísticas calculadas a partir dos achados de auditoria cadastrados. Use SOMENTE estes números.',
    'Escreva de 3 a 5 observações objetivas sobre os padrões que você identifica (uma por linha, iniciando com "- ") e, ao final, uma linha começando com "Ação prioritária:" com uma única ação recomendada.',
    'Em português, tom técnico, sem inventar dados, leis ou números que não estejam abaixo.',
    '',
    `Total de achados: ${estatisticas.total_achados}`,
    'Achados por severidade:', linhas(estatisticas.por_severidade),
    'Achados por tipo de órgão:', linhas(estatisticas.por_tipo_orgao),
    'Órgãos reincidentes (3 ou mais achados):', reincidentes,
    'Achados cadastrados por mês (AAAA-MM):', linhas(estatisticas.por_mes),
  ].join('\n');
}

module.exports = { gerar, status, promptRecomendacao, promptPadroes, ErroIA, MSG_INDISPONIVEL };
