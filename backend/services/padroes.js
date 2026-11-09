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

const RE_ACAO = /^\s*(?:[-*•]\s*)?\**\s*Ação prioritária\s*\**\s*:/i;
// Um ou mais prefixos numéricos ("2. ", "Fato 2: ", ou "1. 2. " quando o modelo numera a própria lista).
// Vale o ÚLTIMO número, que é o do fato citado.
const RE_PREFIXOS = /^\s*(?:[-*•]\s*)?\**\s*((?:(?:Fato\s*)?\d{1,2}\s*[.):\-–]\s*\**\s*)+)(.*)$/i;
// Linha cortada pelo limite de tokens (num_predict) não termina em pontuação: não é confiável
const RE_FIM_COMPLETO = /[.!?…]["')»*]*$/;

// Valida a resposta da IA contra os fatos. Devolve { linhas, descartadas, interpretado, analise }.
function validarAnalise(texto, fatos) {
  const permitidos = new Set(fatos.flatMap(numeros));
  const validas = [];
  let acao = null;
  let descartadas = 0;

  texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((linha) => {
    if (RE_ACAO.test(linha)) {
      if (RE_FIM_COMPLETO.test(linha) && numeros(linha).every((n) => permitidos.has(n))) acao = linha.replace(/^[-*•]\s*/, '');
      else descartadas += 1;
      return;
    }
    const m = linha.match(RE_PREFIXOS);
    if (!m) return; // introdução, comentário ou texto solto: ignorado
    const indice = Number(m[1].match(/\d{1,2}/g).pop());
    const resto = m[2].trim();
    if (!resto || !RE_FIM_COMPLETO.test(resto) || indice < 1 || indice > fatos.length
      || !numeros(resto).every((n) => permitidos.has(n))) {
      descartadas += 1;
      return;
    }
    validas.push(`${indice}. ${resto}`);
  });

  if (validas.length < 2) {
    return { interpretado: false, descartadas, linhas: [], analise: MSG_SEM_INTERPRETACAO };
  }
  const linhas = acao ? [...validas, acao] : validas;
  return { interpretado: true, descartadas, linhas, analise: linhas.join('\n') };
}

module.exports = { numeros, montarFatos, validarAnalise, MSG_SEM_INTERPRETACAO };
