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

// --- IA local: análise de padrões e métricas ---
function listaObj(obj) {
  const itens = Object.entries(obj);
  return itens.length ? itens.map(([k, v]) => `${esc(k)}: ${v}`).join('<br>') : '—';
}

async function carregarMetricas() {
  const alvo = document.getElementById('metricas-ia');
  try {
    const { ok, dados } = await api('/ia/metricas');
    if (!ok) throw new Error(dados.erro);
    const taxa = dados.taxa_aceitacao === null ? '—' : `${dados.taxa_aceitacao}%`;
    alvo.innerHTML = `
      <div class="card-total"><span>${dados.total_usos}</span><p>Usos da IA</p></div>
      <div class="card-total"><span>${dados.total_usos ? (dados.tempo_medio_ms / 1000).toFixed(1) + 's' : '—'}</span><p>Tempo médio</p></div>
      <div class="card-total"><span>${taxa}</span><p>Taxa de aceitação (${dados.aceitas} aceitas / ${dados.descartadas} descartadas)</p></div>`;
  } catch (e) {
    alvo.innerHTML = '<div class="vazio">Não foi possível carregar as métricas.</div>';
  }
}

document.getElementById('btn-analisar').addEventListener('click', async () => {
  const btn = document.getElementById('btn-analisar');
  const erroEl = document.getElementById('padroes-erro');
  erroEl.style.display = 'none';
  document.getElementById('padroes-resultado').style.display = 'none';
  document.getElementById('padroes-carregando').style.display = 'block';
  btn.disabled = true;
  try {
    const { ok, dados } = await api('/ia/padroes');
    if (!ok) throw new Error(dados.erro || 'Não foi possível analisar os padrões.');
    const e = dados.estatisticas;
    document.getElementById('padroes-meta').textContent = `Modelo: ${dados.modelo} · Tempo de resposta: ${(dados.tempo_ms / 1000).toFixed(1)}s`;
    document.getElementById('padroes-estatisticas').innerHTML = `
      <div><b>Total de achados</b>${e.total_achados}</div>
      <div><b>Por severidade</b>${listaObj(e.por_severidade)}</div>
      <div><b>Por tipo de órgão</b>${listaObj(e.por_tipo_orgao)}</div>
      <div><b>Órgãos reincidentes (3+)</b>${e.orgaos_reincidentes.length ? e.orgaos_reincidentes.map((o) => `${esc(o.nome)}: ${o.total}`).join('<br>') : '—'}</div>
      <div><b>Por mês</b>${listaObj(e.por_mes)}</div>`;
    document.getElementById('padroes-texto').textContent = dados.analise;
    document.getElementById('padroes-resultado').style.display = 'block';
    try { sessionStorage.setItem('saac_padroes', JSON.stringify(dados)); } catch (err) { /* opcional (usado no relatório) */ }
    carregarMetricas();
  } catch (erro) {
    erroEl.style.display = 'block';
    erroEl.textContent = erro instanceof TypeError ? 'Erro de conexão com o servidor. Verifique se o backend está rodando.' : erro.message;
  } finally {
    document.getElementById('padroes-carregando').style.display = 'none';
    btn.disabled = false;
  }
});

obterToken();
carregarMetricas();
carregarUsuario().catch(() => { document.getElementById('boas-vindas').textContent = 'Erro ao verificar sessão.'; });
carregarDashboard();
