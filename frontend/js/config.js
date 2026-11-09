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
