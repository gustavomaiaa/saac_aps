// relatorio.js — relatório imprimível: resumo do dashboard, análise de padrões (se já gerada) e tabela de achados
document.getElementById('menu').innerHTML = montarMenu('relatorio.html');
document.getElementById('rel-data').textContent = `Gerado em ${new Date().toLocaleString('pt-BR')}`;
document.getElementById('btn-imprimir').addEventListener('click', () => window.print());

function listaObj(obj) {
  const itens = Object.entries(obj);
  return itens.length ? itens.map(([k, v]) => `${esc(k)}: ${v}`).join('<br>') : '—';
}

// Busca todas as páginas de achados (a API limita 100 por página)
async function buscarTodosAchados() {
  let todos = [];
  let pagina = 1;
  let paginas = 1;
  do {
    const { ok, dados } = await api(`/achados?pagina=${pagina}&limite=100`);
    if (!ok) throw new Error(dados.erro || 'Não foi possível carregar os achados.');
    todos = todos.concat(dados.dados);
    paginas = dados.paginas;
    pagina += 1;
  } while (pagina <= paginas);
  return todos;
}

function renderizarPadroes() {
  const alvo = document.getElementById('rel-padroes');
  let dados = null;
  try { dados = JSON.parse(sessionStorage.getItem('saac_padroes')); } catch (e) { dados = null; }
  if (!dados) {
    alvo.innerHTML = '<p class="ia-meta">A análise de padrões ainda não foi gerada nesta sessão. Gere-a no Dashboard (botão "Analisar") e volte a este relatório.</p>';
    return;
  }
  alvo.innerHTML = `
    <p class="ia-aviso">⚠️ Análise gerada por IA, revise antes de usar.</p>
    <p class="ia-meta">Modelo: ${esc(dados.modelo)} · Tempo de resposta: ${(dados.tempo_ms / 1000).toFixed(1)}s</p>
    <ol class="ia-base">${(dados.fatos || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ol>
    <div class="texto-ia">${esc(dados.analise)}</div>`;
}

async function carregarRelatorio() {
  const alerta = document.getElementById('alerta-relatorio');
  try {
    const [dash, achados] = await Promise.all([api('/dashboard'), buscarTodosAchados()]);
    if (!dash.ok) throw new Error(dash.dados.erro || 'Não foi possível carregar o resumo.');
    const d = dash.dados;
    document.getElementById('rel-resumo').innerHTML = `
      <div><b>Total de achados</b>${d.total_achados}</div>
      <div><b>Órgãos cadastrados</b>${d.total_orgaos}</div>
      <div><b>Por severidade</b>${listaObj(d.por_severidade)}</div>
      <div><b>Por status</b>${listaObj(d.por_status)}</div>
      <div><b>Órgãos com mais achados</b>${d.top_orgaos.length ? d.top_orgaos.map((o) => `${esc(o.nome)}: ${o.total_achados}`).join('<br>') : '—'}</div>`;
    renderizarPadroes();
    document.getElementById('rel-vazio').style.display = achados.length ? 'none' : 'block';
    document.getElementById('rel-achados').innerHTML = achados.map((a) => `
      <tr>
        <td>${a.id}</td><td>${esc(a.titulo)}</td><td>${esc(a.orgao_nome)}</td>
        <td><span class="badge">${esc(a.severidade)}</span></td><td>${esc(a.status)}</td>
        <td>${esc(a.recomendacao || '—')}</td><td>${esc(a.criado_por_nome)}</td><td>${esc(String(a.criado_em).split(' ')[0])}</td>
      </tr>`).join('');
    document.getElementById('relatorio').style.display = 'block';
  } catch (erro) {
    alerta.className = 'alerta erro-geral';
    alerta.textContent = erro instanceof TypeError ? 'Erro de conexão com o servidor. Verifique se o backend está rodando.' : erro.message;
  } finally {
    document.getElementById('carregando-relatorio').style.display = 'none';
  }
}

obterToken();
carregarRelatorio();
