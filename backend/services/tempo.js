// services/tempo.js — horários. O banco e a API guardam/devolvem UTC (datetime('now') do SQLite);
// a exibição usa o fuso America/Fortaleza (UTC-3, sem horário de verão).
const FUSO = 'America/Fortaleza';

const formatadorIso = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

// '2026-11-10 16:34:18' (UTC) -> '2026-11-10 13:34:18' (America/Fortaleza). Valor inválido volta como está.
function paraFortaleza(utc) {
  if (utc === null || utc === undefined || utc === '') return '';
  const texto = String(utc).trim();
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(texto) ? `${texto.replace(' ', 'T')}${texto.length === 16 ? ':00' : ''}Z` : texto;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? texto : formatadorIso.format(d);
}

module.exports = { FUSO, paraFortaleza };
