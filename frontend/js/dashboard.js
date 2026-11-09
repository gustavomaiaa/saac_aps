// dashboard.js — indicadores reais vindos de GET /api/dashboard
document.getElementById('menu').innerHTML = montarMenu('dashboard.html');

const COR_SEVERIDADE = { 'Crítico': 'var(--vermelho)', 'Alto': 'var(--laranja)', 'Médio': 'var(--amarelo)', 'Baixo': 'var(--verde)' };
const COR_STATUS = { 'Em aberto': '#2563eb', 'Em análise': '#ca8a04', 'Implementado': '#16a34a', 'Rejeitado': '#dc2626' };

// Barras horizontais em CSS puro. itens: [{ rotulo, valor, cor }]
function barras(itens) {
  if (itens.length === 0 || itens.every((i) => i.valor === 0)) return '<div class="vazio">Sem dados para exibir.</div>';
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  return itens.map((i) => `
    <div class="barra-linha">
      <span class="barra-rotulo" title="${esc(i.rotulo)}">${esc(i.rotulo)}</span>
      <div class="barra-trilho"><div class="barra-preenchimento" style="width:${(i.valor / maximo) * 100}%; background:${i.cor || 'var(--azul-claro)'};"></div></div>
      <span class="barra-valor">${i.valor}</span>
    </div>`).join('');
}

async function carregarDashboard() {
  const alerta = document.getElementById('alerta-dashboard');
  const carregando = document.getElementById('carregando-dashboard');
  try {
    const { ok, dados } = await api('/dashboard');
    if (!ok) throw new Error(dados.erro || 'Não foi possível carregar o dashboard.');

    document.getElementById('cards-totais').innerHTML = `
      <div class="card-total"><span>${dados.total_achados}</span><p>Achados</p></div>
      <div class="card-total"><span>${dados.total_orgaos}</span><p>Órgãos</p></div>
      <div class="card-total sev-critico"><span>${dados.por_severidade['Crítico']}</span><p>Críticos</p></div>
      <div class="card-total"><span>${dados.por_status['Em aberto']}</span><p>Em aberto</p></div>`;
    document.getElementById('barras-severidade').innerHTML =
      barras(Object.entries(dados.por_severidade).map(([rotulo, valor]) => ({ rotulo, valor, cor: COR_SEVERIDADE[rotulo] })));
    document.getElementById('barras-status').innerHTML =
      barras(Object.entries(dados.por_status).map(([rotulo, valor]) => ({ rotulo, valor, cor: COR_STATUS[rotulo] })));
    document.getElementById('barras-orgaos').innerHTML =
      barras(dados.top_orgaos.map((o) => ({ rotulo: o.nome, valor: o.total_achados })));
    document.getElementById('painel').style.display = 'block';
  } catch (erro) {
    alerta.className = 'alerta erro-geral';
    alerta.textContent = erro instanceof TypeError
      ? 'Erro de conexão com o servidor. Verifique se o backend está rodando.' : erro.message;
  } finally {
    carregando.style.display = 'none';
  }
}

async function carregarUsuario() {
  const { ok, dados } = await api('/auth/verify');
  if (ok && dados.usuario) {
    document.getElementById('boas-vindas').textContent = `Bem-vindo(a) de volta, ${dados.usuario.nome} (${dados.usuario.area}).`;
  }
}

obterToken();
carregarUsuario().catch(() => { document.getElementById('boas-vindas').textContent = 'Erro ao verificar sessão.'; });
carregarDashboard();
