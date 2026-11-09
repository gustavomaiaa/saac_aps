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
function montarFatos(e) {
  const t = e.total_achados;
  const fatos = [`O total de achados cadastrados é ${t}.`];

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
  } else {
    fatos.push('Nenhum órgão tem 3 ou mais achados (não há órgãos reincidentes).');
  }

  const meses = ordenar(e.por_mes);
  if (meses.length) {
    const max = meses[0][1];
    const top = meses.filter((m) => m[1] === max).map((m) => m[0]);
    fatos.push(top.length > 1
      ? `Os meses com mais achados cadastrados, empatados, são ${unir(top)}, com ${max} de ${t} achados (${pct(max, t)}%) cada.`
      : `O mês com mais achados cadastrados é ${top[0]}, com ${max} de ${t} achados (${pct(max, t)}%).`);
  }

  fatos.push(`Achados com status "Em aberto": ${e.em_aberto} de ${t} (${pct(e.em_aberto, t)}%).`);
  return fatos;
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
// Linha cortada pelo limite de tokens (num_predict) não termina em pontuação (ou numa citação [n] ao final)
const RE_FIM_COMPLETO = /(?:[.!?…]|\])["')»*]*\.?$/;

// Palavras "de conteúdo" de um texto (minúsculas, sem acento, sem números nem citações)
function palavras(texto) {
  return semRefs(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((p) => p.length > 2);
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

// Valida a resposta da IA contra os fatos. Devolve { linhas, descartadas, interpretado, analise }.
// Uma observação só é aceita se: cita ao menos um [n] existente, não traz números fora dos fatos,
// não é cópia dos fatos e não foi cortada. Com menos de 2 observações úteis, vale o fallback.
function validarAnalise(texto, fatos) {
  const permitidos = new Set(fatos.flatMap(numeros));
  const validas = [];
  let acao = null;
  let descartadas = 0;

  const aceitavel = (linha) => {
    const refs = extrairRefs(linha);
    if (refs.some((n) => n < 1 || n > fatos.length)) return false;               // [n] inexistente
    if (!numeros(semRefs(linha)).every((n) => permitidos.has(n))) return false;   // número inventado
    return RE_FIM_COMPLETO.test(linha) && !copiaDeFato(linha, fatos);              // truncada ou copiada
  };

  texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((linha) => {
    const limpa = linha.replace(/^[-*•]\s*/, '');
    if (RE_ACAO.test(linha)) {
      if (aceitavel(linha)) acao = limpa; else descartadas += 1;
      return;
    }
    const temRef = extrairRefs(linha).length > 0;
    if (!temRef && !RE_ROTULO.test(linha)) return; // introdução ou texto solto: ignorado
    if (!temRef || !aceitavel(linha)) { descartadas += 1; return; } // observação sem citação de fato não é aceita
    validas.push(limpa);
  });

  if (validas.length < 2) {
    return { interpretado: false, descartadas, linhas: [], analise: MSG_SEM_INTERPRETACAO };
  }
  const linhas = acao ? [...validas, acao] : validas;
  return { interpretado: true, descartadas, linhas, analise: linhas.join('\n') };
}

module.exports = { numeros, montarFatos, validarAnalise, MSG_SEM_INTERPRETACAO };
