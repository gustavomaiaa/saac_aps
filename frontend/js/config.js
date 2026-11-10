// config.js — URL base da API e helper de autenticação compartilhado
const API_URL = 'http://localhost:3000/api';

function obterToken() {
  const token = localStorage.getItem('saac_token');
  if (!token) {
    window.location.href = 'login.html';
    return null;
  }
  return token;
}

function headersAutenticados() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${obterToken()}`,
  };
}

function logout() {
  localStorage.removeItem('saac_token');
  localStorage.removeItem('saac_usuario');
  window.location.href = 'login.html';
}

// --- Sprint V: helpers compartilhados ---

// Escapa texto antes de inserir em innerHTML (evita XSS com dados digitados pelo usuario)
function esc(valor) {
  const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(valor ?? '').replace(/[&<>"']/g, (c) => mapa[c]);
}

// Chamada autenticada a API. Em qualquer 401 limpa a sessao e volta para o login.
// Devolve { ok, status, dados }. Erros de rede lancam excecao (tratada por quem chama).
async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`${API_URL}${caminho}`, {
    ...opcoes,
    headers: { ...headersAutenticados(), ...(opcoes.headers || {}) },
  });
  let dados = {};
  try { dados = await resposta.json(); } catch (e) { dados = {}; }
  if (resposta.status === 401) logout();
  return { ok: resposta.ok, status: resposta.status, dados };
}

function usuarioLogado() {
  try { return JSON.parse(localStorage.getItem('saac_usuario')) || null; } catch (e) { return null; }
}

// Menu de navegacao padrao (com botao Sair) usado em todas as telas
function montarMenu(ativo) {
  const itens = [['dashboard.html', 'Dashboard'], ['orgaos.html', 'Órgãos'], ['achados.html', 'Achados'], ['relatorio.html', 'Relatório']];
  const links = itens.map(([href, nome]) => `<a href="${href}"${ativo === href ? ' class="ativo"' : ''}>${nome}</a>`).join('');
  return `${links}<a href="#" onclick="logout(); return false;">Sair</a>`;
}

// --- Horários: o servidor guarda e devolve UTC; as telas exibem em America/Fortaleza (UTC-3) ---
const FUSO_HORARIO = 'America/Fortaleza';
const FORMATADOR_HORARIO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_HORARIO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// Aceita '2026-11-10 16:34:18' (SQLite, UTC), ISO com ou sem 'Z' e objetos Date. Devolve Date ou null.
function dataDeUtc(valor) {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (valor === null || valor === undefined || valor === '') return null;
  let texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(texto)) texto = texto.replace(' ', 'T') + (texto.length === 16 ? ':00' : '') + 'Z';
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(texto)) texto += 'Z';
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

function partesHorario(d) {
  const p = {};
  FORMATADOR_HORARIO.formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  return p;
}

// 'dd/mm/aaaa hh:mm' em America/Fortaleza
function formatarDataHora(valor) {
  const d = dataDeUtc(valor);
  if (!d) return '';
  const p = partesHorario(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

// 'dd/mm/aaaa' em America/Fortaleza
function formatarData(valor) {
  const d = dataDeUtc(valor);
  if (!d) return '';
  const p = partesHorario(d);
  return `${p.day}/${p.month}/${p.year}`;
}
