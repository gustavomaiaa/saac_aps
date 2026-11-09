// services/padroes.js — fatos interpretados (calculados em JS) e validação da resposta da IA.
// Modelos pequenos comparam números de forma errada; por isso a comparação é feita aqui, e a IA
// só redige observações sobre FATOS PRONTOS. Linhas que citam números fora dos fatos são descartadas.

const MSG_SEM_INTERPRETACAO = 'A IA não conseguiu interpretar com segurança; veja os fatos acima.';

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);
const ordenar = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
const unir = (nomes) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0]);

// Frase sobre o item mais (ou menos) frequente, tratando empates
function fraseExtremo(itens, total, maior, singular, plural, generoF) {
  const alvo = maior ? Math.max(...itens.map((i) => i[1])) : Math.min(...itens.map((i) => i[1]));
  const nomes = itens.filter((i) => i[1] === alvo).map((i) => i[0]);
  const adj = maior ? 'mais' : 'menos';
  if (nomes.length > 1) {
    const art = generoF ? 'As' : 'Os';
    return `${art} ${plural} ${adj} frequentes, empatad${generoF ? 'a' : 'o'}s, são ${unir(nomes)}, com ${alvo} de ${total} achados (${pct(alvo, total)}%) cada.`;
  }
  const art = generoF ? 'A' : 'O';
  return `${art} ${singular} ${adj} frequente é ${nomes[0]}, com ${alvo} de ${total} achados (${pct(alvo, total)}%).`;
}

// Devolve a lista de frases (sem numeração) a partir das estatísticas
// Devolve { fatos, meta }: meta indica onde estão os fatos de meses/reincidentes e se os meses estão empatados
function montarFatosEMeta(e) {
  const t = e.total_achados;
  const fatos = [`O total de achados cadastrados é ${t}.`];
  const meta = { idxMeses: null, mesesEmpatados: false, idxReincidentes: null, haReincidentes: false };

  const sev = ordenar(e.por_severidade);
  if (sev.length === 1) {
    fatos.push(`Todos os ${t} achados têm severidade ${sev[0][0]}.`);
  } else if (sev.length > 1) {
    fatos.push(fraseExtremo(sev, t, true, 'severidade', 'severidades', true));
    fatos.push(fraseExtremo(sev, t, false, 'severidade', 'severidades', true));
    fatos.push(`Ranking de severidades, da mais para a menos frequente: ${sev.map(([k, v]) => `${k} (${v})`).join(', ')}.`);
  }

  const tipos = ordenar(e.por_tipo_orgao);
  if (tipos.length) {
    fatos.push(`Ranking de tipos de órgão por número de achados: ${tipos.map(([k, v]) => `${k} (${v})`).join(', ')}.`);
  }

  if (e.orgaos_reincidentes.length) {
    fatos.push(`Órgãos reincidentes (3 ou mais achados): ${e.orgaos_reincidentes.map((o) => `${o.nome} (${o.tipo}) com ${o.total} achados`).join('; ')}.`);
    meta.haReincidentes = true;
    meta.idxReincidentes = fatos.length;
  } else {
    fatos.push('Nenhum órgão tem 3 ou mais achados (não há órgãos reincidentes).');
    meta.idxReincidentes = fatos.length;
  }

  const meses = ordenar(e.por_mes);
  if (meses.length) {
    const max = meses[0][1];
    const top = meses.filter((m) => m[1] === max).map((m) => m[0]);
    meta.mesesEmpatados = top.length > 1;
    fatos.push(top.length > 1
      ? `Os meses com mais achados cadastrados, empatados, são ${unir(top)}, com ${max} de ${t} achados (${pct(max, t)}%) cada.`
      : `O mês com mais achados cadastrados é ${top[0]}, com ${max} de ${t} achados (${pct(max, t)}%).`);
    meta.idxMeses = fatos.length;
  }

  fatos.push(`Achados com status "Em aberto": ${e.em_aberto} de ${t} (${pct(e.em_aberto, t)}%).`);
  return { fatos, meta };
}

function montarFatos(e) {
  return montarFatosEMeta(e).fatos;
}

function numeros(texto) {
  return (texto.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'));
}

// Referências a fatos entre colchetes: [2], [2][6] ou [2, 6]
const RE_REFS = /\[\s*(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\s*\]/g;

function extrairRefs(linha) {
  const refs = [];
  for (const m of linha.matchAll(RE_REFS)) m[1].split(/[,;]/).forEach((n) => refs.push(Number(n)));
  return refs;
}
const semRefs = (linha) => linha.replace(RE_REFS, ' ');

const RE_ACAO = /^\s*(?:[-*•]\s*)?\**\s*Ação prioritária\s*\**\s*:/i;
const RE_ROTULO = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?\**\s*(Risco|Concentra[çc][ãa]o|Tend[êe]ncia)\s*\**\s*[:\-–]/i;
const RE_TENDENCIA = /^\s*(?:[-*•]\s*|\d+[.)]\s*)?\**\s*Tend[êe]ncia\s*\**\s*[:\-–]/i;
// Linha cortada pelo limite de tokens (num_predict) não termina em pontuação (ou numa citação [n] ao final)
const RE_FIM_COMPLETO = /(?:[.!?…]|\])["')»*]*\.?$/;

// ---------- Regras determinísticas de vocabulário (status, severidade, variação) ----------
const STATUS_VALIDOS = ['Em aberto', 'Em análise', 'Implementado', 'Rejeitado'];
const SEVERIDADES_VALIDAS = ['Crítico', 'Alto', 'Médio', 'Baixo'];

const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Formas válidas de severidade (com flexão de gênero: Alta, Média, Baixa, Crítica)
const SEVERIDADES_FLEXIONADAS = new Set(['critico', 'critica', 'alto', 'alta', 'medio', 'media', 'baixo', 'baixa']);
const STATUS_VALIDOS_NORM = new Set(STATUS_VALIDOS.map(semAcento));

// Status que NÃO existem no sistema (sinônimos comuns que o modelo inventa)
const RE_STATUS_INVALIDO = /\b(resolvid[oa]s?|fechad[oa]s?|conclu[ií]d[oa]s?|pendentes?|finalizad[oa]s?|encerrad[oa]s?|cancelad[oa]s?|arquivad[oa]s?|solucionad[oa]s?|reaberto[s]?|aprovad[oa]s?|em andamento|em progresso|em tratamento|em execu[cç][aã]o)\b/i;
// Severidades que NÃO existem no sistema
const RE_SEVERIDADE_INVALIDA = /\b(gravissim[oa]s?|grave[s]?|moderad[oa]s?|leve[s]?|urgentes?|extrem[oa]s?|sever[oa]s?|altissim[oa]s?|muito (?:alt[oa]|baix[oa]|grave)|irrelevantes?|insignificantes?|catastr[oó]fic[oa]s?)\b/i;
// Valor entre aspas logo após as palavras "status" ou "severidade": status "X" / severidade "X"
const RE_VALOR_CITADO = /\b(status|severidades?)\s*[:=]?\s*["“'‘]([^"”'’]+)["”'’]/gi;

// Devolve o motivo (string) se a linha cita status/severidade inexistentes; senão null
function vocabularioInvalido(linha) {
  const t = semAcento(semRefs(linha));
  for (const m of t.matchAll(new RegExp(RE_VALOR_CITADO.source, 'gi'))) {
    const valor = m[2].trim();
    if (m[1].startsWith('status') && !STATUS_VALIDOS_NORM.has(valor)) return `status inválido "${valor}"`;
    if (m[1].startsWith('severidade') && !SEVERIDADES_FLEXIONADAS.has(valor)) return `severidade inválida "${valor}"`;
  }
  const s = t.match(RE_STATUS_INVALIDO);
  if (s) return `status inválido "${s[0]}"`;
  if (/severidade|nivel|criticidade/.test(t)) {
    const v = t.match(RE_SEVERIDADE_INVALIDA);
    if (v) return `severidade inválida "${v[0]}"`;
  }
  return null;
}

// Palavras de variação temporal que não podem ser usadas quando os meses estão empatados
const RE_VARIACAO = /\b(aumentar|aumentando|aumento|aumentou|crescer|crescimento|crescente|cresceu|queda|cair|diminuir|diminuicao|diminuiu|reduzir|reducao|subir|subida|tendencia de)\b/;
const temVariacao = (linha) => RE_VARIACAO.test(semAcento(linha));

// Frases fixas geradas em JS (sempre ligadas a um fato real)
function fraseTendenciaUniforme(meta) {
  return `Tendência: Os achados estão distribuídos de forma uniforme entre os meses com mais registros [${meta.idxMeses}].`;
}
function fraseAcaoFixa(meta) {
  return meta.haReincidentes
    ? `Ação prioritária: Priorizar o acompanhamento dos órgãos reincidentes [${meta.idxReincidentes}].`
    : 'Ação prioritária: Manter o acompanhamento periódico dos achados cadastrados [1].';
}

// Palavras "de conteúdo" de um texto (minúsculas, sem acento, sem números nem citações)
function palavras(texto) {
  return semAcento(semRefs(texto)).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((p) => p.length > 2);
}

// A linha é "cópia quase idêntica" de algum fato? (≥ 80% das palavras da linha aparecem no mesmo fato)
function copiaDeFato(linha, fatos) {
  const w = palavras(linha.replace(RE_ROTULO, '').replace(RE_ACAO, ''));
  if (w.length < 4) return false;
  return fatos.some((fato) => {
    const conjunto = new Set(palavras(fato));
    return w.filter((p) => conjunto.has(p)).length / w.length >= 0.8;
  });
}

// Valida a resposta da IA contra os fatos. Devolve { linhas, descartadas, substituidas, interpretado, analise }.
// Uma observação só é aceita se: cita ao menos um [n] existente, não traz números fora dos fatos, não cita
// status/severidade inexistentes, não é cópia dos fatos e não foi cortada. Regras especiais:
//  - Tendência com meses empatados: a linha do modelo é substituída por uma frase fixa (sem palavras de variação);
//  - Ação prioritária descartada: substituída por uma ação fixa baseada nos órgãos reincidentes.
// Com menos de 2 observações úteis, vale o fallback.
function validarAnalise(texto, fatos, meta = {}) {
  const permitidos = new Set(fatos.flatMap(numeros));
  const validas = [];
  let acao = null;
  let acaoDescartada = false;
  let descartadas = 0;
  let substituidas = 0;

  const aceitavel = (linha) => {
    const refs = extrairRefs(linha);
    if (refs.some((n) => n < 1 || n > fatos.length)) return false;               // [n] inexistente
    if (!numeros(semRefs(linha)).every((n) => permitidos.has(n))) return false;   // número inventado
    if (vocabularioInvalido(linha)) return false;                                   // status/severidade inexistente
    return RE_FIM_COMPLETO.test(linha) && !copiaDeFato(linha, fatos);              // truncada ou copiada
  };

  texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((linha) => {
    const limpa = linha.replace(/^[-*•]\s*/, '');
    if (RE_ACAO.test(linha)) {
      if (aceitavel(linha)) acao = limpa; else { acaoDescartada = true; descartadas += 1; }
      return;
    }
    // Tendência com meses empatados: não há variação a interpretar -> frase fixa no lugar da linha do modelo
    if (RE_TENDENCIA.test(linha) && meta.mesesEmpatados && meta.idxMeses) {
      validas.push(fraseTendenciaUniforme(meta));
      substituidas += 1;
      if (temVariacao(linha)) descartadas += 1; // a linha do modelo usava palavras de variação
      return;
    }
    const temRef = extrairRefs(linha).length > 0;
    if (!temRef && !RE_ROTULO.test(linha)) return; // introdução ou texto solto: ignorado
    if (!temRef || !aceitavel(linha)) { descartadas += 1; return; } // observação sem citação de fato não é aceita
    validas.push(limpa);
  });

  if (acaoDescartada && !acao) {
    acao = fraseAcaoFixa(meta);
    substituidas += 1;
  }

  if (validas.length < 2) {
    return { interpretado: false, descartadas, substituidas: 0, linhas: [], analise: MSG_SEM_INTERPRETACAO };
  }
  const linhas = acao ? [...validas, acao] : validas;
  return { interpretado: true, descartadas, substituidas, linhas, analise: linhas.join('\n') };
}

module.exports = {
  numeros, montarFatos, montarFatosEMeta, validarAnalise, vocabularioInvalido, MSG_SEM_INTERPRETACAO,
  STATUS_VALIDOS, SEVERIDADES_VALIDAS,
};
