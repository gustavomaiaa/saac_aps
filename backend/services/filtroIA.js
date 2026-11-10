// services/filtroIA.js — filtro determinístico aplicado ao texto livre gerado pela IA (recomendação e justificativa da
// severidade): nada de lei, artigo, decreto etc. nem de números que não apareçam no achado.
// O modelo é só uma sugestão: se a saída violar a regra, ela é SUBSTITUÍDA por uma mensagem padrão.
const { numeros } = require('./padroes');

// Referências normativas (lei, artigo, decreto, inciso, parágrafo, portaria, resolução, instrução normativa, §)
const RE_REFERENCIA_NORMATIVA = /\b(leis?|artigos?|art\.|decretos?|incisos?|par[áa]grafos?|portarias?|resolu[çc][ãõ]\w*|instru[çc][ãõ]o normativa|medidas? provis[óo]rias?)\b|§/i;

const MSG_RECOMENDACAO_OMITIDA = 'Recomendação omitida: o modelo citou lei, artigo, decreto ou números ausentes do achado. '
  + 'Escreva a recomendação manualmente ou gere novamente.';
const MSG_JUSTIFICATIVA_OMITIDA = 'Justificativa omitida: o modelo citou referências ou números ausentes do texto do achado.';

// { citaReferencia, numeroInventado, invalido } — `textoBase` é tudo o que o usuário informou (números ali são permitidos)
function avaliar(texto, textoBase) {
  const permitidos = new Set(numeros(String(textoBase)));
  const citaReferencia = RE_REFERENCIA_NORMATIVA.test(texto);
  const numeroInventado = numeros(texto).some((n) => !permitidos.has(n));
  return { citaReferencia, numeroInventado, invalido: citaReferencia || numeroInventado };
}

// Limita o tamanho cortando, se possível, no fim de uma frase
function limitarTamanho(texto, max) {
  if (texto.length <= max) return { texto, truncada: false };
  const corte = texto.slice(0, max);
  const fim = Math.max(corte.lastIndexOf('.'), corte.lastIndexOf('!'), corte.lastIndexOf('?'));
  return { texto: fim > max * 0.5 ? corte.slice(0, fim + 1) : `${corte.slice(0, max - 1).trimEnd()}…`, truncada: true };
}

// Remove do texto do usuário qualquer tag <achado> / </achado> (impede "fechar" o bloco de dados dentro do prompt)
function neutralizarDelimitador(texto) {
  return String(texto).replace(/<\s*\/?\s*achado\s*>/gi, '');
}

module.exports = {
  avaliar, limitarTamanho, neutralizarDelimitador, RE_REFERENCIA_NORMATIVA, MSG_RECOMENDACAO_OMITIDA, MSG_JUSTIFICATIVA_OMITIDA,
};
