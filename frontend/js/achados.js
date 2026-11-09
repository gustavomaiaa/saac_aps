// achados.js — CRUD de Achados (listar com filtros, criar, editar, excluir)
let achadoParaExcluir = null;
let usuarioAtual = usuarioLogado();

// Só o criador do achado ou um administrador pode editar/excluir (o servidor também valida)
function podeModificar(achado) {
  return !!usuarioAtual && (usuarioAtual.perfil === 'admin' || usuarioAtual.id === achado.criado_por_id);
}
let cacheOrgaos = [];

const tbody = document.getElementById('tbody-achados');
const vazio = document.getElementById('vazio-achados');
const overlayForm = document.getElementById('overlay-form');
const overlayExcluir = document.getElementById('overlay-excluir');
const formAchado = document.getElementById('form-achado');
const formTitulo = document.getElementById('form-titulo');
const alertaForm = document.getElementById('alerta-form');

function classeBadgeSeveridade(severidade) {
  return { 'Crítico': 'badge-critico', 'Alto': 'badge-alto', 'Médio': 'badge-medio', 'Baixo': 'badge-baixo' }[severidade] || '';
}
function classeBadgeStatus(status) {
  return {
    'Em aberto': 'badge-status-aberto', 'Em análise': 'badge-status-analise',
    'Implementado': 'badge-status-implementado', 'Rejeitado': 'badge-status-rejeitado',
  }[status] || 'badge-status';
}

async function carregarOrgaosSelects() {
  const { ok, dados } = await api('/orgaos');
  if (!ok) return;
  cacheOrgaos = dados.orgaos;
  const filtroOrgao = document.getElementById('filtro-orgao');
  const formOrgaoSelect = document.getElementById('achado-orgao');
  filtroOrgao.innerHTML = '<option value="">Todos</option>';
  formOrgaoSelect.innerHTML = '<option value="">Selecione...</option>';
  dados.orgaos.forEach((orgao) => {
    filtroOrgao.innerHTML += `<option value="${orgao.id}">${esc(orgao.nome)}</option>`;
    formOrgaoSelect.innerHTML += `<option value="${orgao.id}">${esc(orgao.nome)}</option>`;
  });
}

let paginaAtual = 1;
let achadosDaPagina = [];

function parametrosFiltro() {
  const params = new URLSearchParams();
  const campos = { q: 'filtro-busca', orgao_id: 'filtro-orgao', severidade: 'filtro-severidade', status: 'filtro-status' };
  Object.entries(campos).forEach(([nome, id]) => {
    const valor = document.getElementById(id).value.trim();
    if (valor) params.set(nome, valor);
  });
  return params;
}

async function carregarAchados() {
  const carregando = document.getElementById('carregando-achados');
  const paginacao = document.getElementById('paginacao');
  carregando.style.display = 'block';
  vazio.style.display = 'none';
  try {
    const params = parametrosFiltro();
    params.set('pagina', paginaAtual);
    params.set('limite', 10);

    const { ok, dados } = await api(`/achados?${params.toString()}`);
    if (!ok) throw new Error(dados.erro || 'Não foi possível carregar os achados.');

    paginaAtual = dados.pagina;
    achadosDaPagina = dados.dados;
    tbody.innerHTML = '';
    vazio.style.display = dados.dados.length === 0 ? 'block' : 'none';
    dados.dados.forEach((achado) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(achado.titulo)}</td><td>${esc(achado.orgao_nome)}</td>
        <td><span class="badge ${classeBadgeSeveridade(achado.severidade)}">${esc(achado.severidade)}</span></td>
        <td><span class="badge ${classeBadgeStatus(achado.status)}">${esc(achado.status)}</span></td>
        <td>${esc(achado.criado_por_nome)}</td>
        <td class="acoes">${podeModificar(achado) ? `
          <button class="btn btn-secundario btn-pequeno" data-editar="${achado.id}">Editar</button>
          <button class="btn btn-perigo btn-pequeno" data-excluir="${achado.id}" data-titulo="${esc(achado.titulo)}">Excluir</button>` : '<span class="sem-permissao" title="Apenas o criador do achado ou um administrador pode editar ou excluir">Somente leitura</span>'}
        </td>`;
      tbody.appendChild(tr);
    });
    document.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => abrirFormEdicao(btn.dataset.editar, achadosDaPagina));
    });
    document.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', () => abrirConfirmacaoExclusao(btn.dataset.excluir, btn.dataset.titulo));
    });

    paginacao.style.display = dados.total > 0 ? 'flex' : 'none';
    document.getElementById('info-pagina').textContent = `Página ${dados.pagina} de ${dados.paginas} — ${dados.total} achado(s)`;
    document.getElementById('btn-anterior').disabled = dados.pagina <= 1;
    document.getElementById('btn-proxima').disabled = dados.pagina >= dados.paginas;
  } catch (erro) {
    console.error('Erro ao carregar achados:', erro);
    tbody.innerHTML = '';
    paginacao.style.display = 'none';
    vazio.style.display = 'block';
    vazio.textContent = erro instanceof TypeError
      ? 'Erro de conexão com o servidor. Verifique se o backend está rodando.' : erro.message;
  } finally {
    carregando.style.display = 'none';
  }
}

function limparFormulario() {
  document.getElementById('achado-id').value = '';
  document.getElementById('achado-titulo').value = '';
  document.getElementById('achado-descricao').value = '';
  document.getElementById('achado-orgao').value = '';
  document.getElementById('achado-severidade').value = '';
  document.getElementById('achado-status').value = 'Em aberto';
  document.getElementById('achado-recomendacao').value = '';
  resetarIA();
  resetarSeveridadeIA();
  esconderParecidos();
  document.getElementById('bloco-historico').style.display = 'none';
  document.getElementById('erro-desfazer').textContent = '';
  document.getElementById('abas-achado').style.display = 'none';
  mostrarAba('dados');
  ['titulo', 'descricao', 'orgao', 'severidade'].forEach((c) => { document.getElementById(`erro-${c}`).textContent = ''; });
  alertaForm.className = 'alerta';
  alertaForm.textContent = '';
}

function abrirFormNovo() {
  limparFormulario();
  formTitulo.textContent = 'Novo Achado';
  overlayForm.classList.add('aberto');
}

function abrirFormEdicao(id, achados) {
  limparFormulario();
  const achado = achados.find((a) => String(a.id) === String(id));
  if (!achado) return;
  formTitulo.textContent = 'Editar Achado';
  document.getElementById('achado-id').value = achado.id;
  document.getElementById('achado-titulo').value = achado.titulo;
  document.getElementById('achado-descricao').value = achado.descricao;
  document.getElementById('achado-orgao').value = achado.orgao_id;
  document.getElementById('achado-severidade').value = achado.severidade;
  document.getElementById('achado-status').value = achado.status;
  document.getElementById('achado-recomendacao').value = achado.recomendacao || '';
  document.getElementById('bloco-historico').style.display = 'block';
  document.getElementById('abas-achado').style.display = 'flex';
  carregarHistorico(achado.id);
  overlayForm.classList.add('aberto');
}

function abrirConfirmacaoExclusao(id, titulo) {
  achadoParaExcluir = id;
  document.getElementById('titulo-achado-excluir').textContent = titulo;
  document.getElementById('alerta-excluir').className = 'alerta';
  document.getElementById('alerta-excluir').textContent = '';
  overlayExcluir.classList.add('aberto');
}

document.getElementById('btn-novo-achado').addEventListener('click', abrirFormNovo);
document.getElementById('btn-cancelar-form').addEventListener('click', () => overlayForm.classList.remove('aberto'));
document.getElementById('btn-cancelar-excluir').addEventListener('click', () => overlayExcluir.classList.remove('aberto'));
document.getElementById('btn-filtrar').addEventListener('click', () => { paginaAtual = 1; carregarAchados(); });
document.getElementById('filtro-busca').addEventListener('keydown', (e) => { if (e.key === 'Enter') { paginaAtual = 1; carregarAchados(); } });
document.getElementById('btn-anterior').addEventListener('click', () => { paginaAtual -= 1; carregarAchados(); });
document.getElementById('btn-proxima').addEventListener('click', () => { paginaAtual += 1; carregarAchados(); });
document.getElementById('btn-limpar-filtro').addEventListener('click', () => {
  document.getElementById('filtro-orgao').value = '';
  document.getElementById('filtro-severidade').value = '';
  document.getElementById('filtro-status').value = '';
  document.getElementById('filtro-busca').value = '';
  paginaAtual = 1;
  carregarAchados();
});

formAchado.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('achado-id').value;
  const titulo = document.getElementById('achado-titulo').value.trim();
  const descricao = document.getElementById('achado-descricao').value.trim();
  const orgao_id = document.getElementById('achado-orgao').value;
  const severidade = document.getElementById('achado-severidade').value;
  const status = document.getElementById('achado-status').value;
  const recomendacao = document.getElementById('achado-recomendacao').value.trim();

  let valido = true;
  ['titulo', 'descricao', 'orgao', 'severidade'].forEach((c) => { document.getElementById(`erro-${c}`).textContent = ''; });
  if (titulo.length < 5) { document.getElementById('erro-titulo').textContent = 'Informe pelo menos 5 caracteres.'; valido = false; }
  if (descricao.length < 5) { document.getElementById('erro-descricao').textContent = 'Descreva o achado com mais detalhes.'; valido = false; }
  if (!orgao_id) { document.getElementById('erro-orgao').textContent = 'Selecione um órgão.'; valido = false; }
  if (!severidade) { document.getElementById('erro-severidade').textContent = 'Selecione uma severidade.'; valido = false; }
  if (!valido) return;

  const btnSalvar = document.getElementById('btn-salvar-achado');
  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  try {
    const metodo = id ? 'PUT' : 'POST';
    const { ok, dados } = await api(id ? `/achados/${id}` : '/achados', {
      method: metodo,
      body: JSON.stringify({ titulo, descricao, orgao_id, severidade, status, recomendacao }),
    });
    if (!ok || !dados.sucesso) {
      alertaForm.className = 'alerta erro-geral';
      alertaForm.textContent = dados.erro || 'Não foi possível salvar o achado.';
      return;
    }
    overlayForm.classList.remove('aberto');
    carregarAchados();
  } catch (erro) {
    alertaForm.className = 'alerta erro-geral';
    alertaForm.textContent = 'Erro de conexão com o servidor.';
    console.error(erro);
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = 'Salvar';
  }
});

document.getElementById('btn-confirmar-excluir').addEventListener('click', async () => {
  const btn = document.getElementById('btn-confirmar-excluir');
  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  try {
    const { ok, dados } = await api(`/achados/${achadoParaExcluir}`, { method: 'DELETE' });
    if (!ok || !dados.sucesso) {
      const alertaExcluir = document.getElementById('alerta-excluir');
      alertaExcluir.className = 'alerta erro-geral';
      alertaExcluir.textContent = dados.erro || 'Não foi possível excluir o achado.';
      return;
    }
    overlayExcluir.classList.remove('aberto');
    carregarAchados();
  } catch (erro) {
    console.error(erro);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Excluir';
  }
});

// --- IA local: severidade sugerida ---
let usoSevAtual = null;
let severidadeAntesDaIA = '';

function resetarSeveridadeIA() {
  usoSevAtual = null;
  ['sev-box', 'sev-carregando', 'sev-erro', 'sev-resultado', 'sev-decisao'].forEach((id) => { document.getElementById(id).style.display = 'none'; });
  document.getElementById('sev-acoes').style.display = 'flex';
  document.getElementById('btn-sugerir-sev').disabled = false;
}

document.getElementById('btn-sugerir-sev').addEventListener('click', async () => {
  const titulo = document.getElementById('achado-titulo').value.trim();
  const descricao = document.getElementById('achado-descricao').value.trim();
  const erroEl = document.getElementById('sev-erro');
  const btn = document.getElementById('btn-sugerir-sev');
  resetarSeveridadeIA();
  document.getElementById('sev-box').style.display = 'block';
  if (!titulo || !descricao) {
    erroEl.style.display = 'block';
    erroEl.textContent = 'Preencha título e descrição antes de pedir a sugestão.';
    return;
  }
  btn.disabled = true;
  document.getElementById('sev-carregando').style.display = 'block';
  try {
    const { ok, dados } = await api('/ia/severidade', { method: 'POST', body: JSON.stringify({ titulo, descricao }) });
    document.getElementById('sev-carregando').style.display = 'none';
    if (!ok) {
      erroEl.style.display = 'block';
      erroEl.textContent = dados.erro || 'Não foi possível sugerir a severidade.';
      return;
    }
    const campo = document.getElementById('achado-severidade');
    severidadeAntesDaIA = campo.value;
    campo.value = dados.severidade; // sugestão: o usuário confirma (Aceitar) ou descarta
    usoSevAtual = dados.uso_id;
    document.getElementById('sev-valor').textContent = dados.severidade;
    document.getElementById('sev-justificativa').textContent = dados.justificativa;
    document.getElementById('sev-meta').textContent = `Modelo: ${dados.modelo} · Tempo de resposta: ${(dados.tempo_ms / 1000).toFixed(1)}s · Base: título e descrição informados`;
    document.getElementById('sev-resultado').style.display = 'block';
  } catch (e) {
    document.getElementById('sev-carregando').style.display = 'none';
    erroEl.style.display = 'block';
    erroEl.textContent = 'Erro de conexão com o servidor. O restante do formulário continua funcionando.';
  } finally {
    btn.disabled = false;
  }
});

function decidirSeveridade(resultado) {
  if (usoSevAtual) api(`/ia/uso/${usoSevAtual}/resultado`, { method: 'POST', body: JSON.stringify({ resultado }) }).catch(() => {});
  usoSevAtual = null;
  document.getElementById('sev-acoes').style.display = 'none';
  const decisao = document.getElementById('sev-decisao');
  decisao.style.display = 'block';
  if (resultado === 'descartada') {
    document.getElementById('achado-severidade').value = severidadeAntesDaIA;
    decisao.textContent = 'Sugestão descartada.';
  } else {
    decisao.textContent = 'Sugestão aceita. Revise e salve o achado.';
  }
}
document.getElementById('btn-sev-aceitar').addEventListener('click', () => decidirSeveridade('aceita'));
document.getElementById('btn-sev-descartar').addEventListener('click', () => decidirSeveridade('descartada'));

// --- IA local: achados parecidos (embeddings). Falhas são silenciosas: o formulário segue normal. ---
let temporizadorParecidos = null;
let sequenciaParecidos = 0;

function esconderParecidos() {
  sequenciaParecidos += 1; // ignora respostas em andamento
  clearTimeout(temporizadorParecidos);
  document.getElementById('parecidos-box').style.display = 'none';
}

async function buscarParecidos() {
  const titulo = document.getElementById('achado-titulo').value.trim();
  const descricao = document.getElementById('achado-descricao').value.trim();
  const orgaoId = document.getElementById('achado-orgao').value;
  if (document.getElementById('achado-id').value || titulo.length < 5 || descricao.length < 15) return esconderParecidos();
  const minhaVez = ++sequenciaParecidos;
  try {
    const params = new URLSearchParams({ titulo, descricao });
    if (orgaoId) params.set('orgao_id', orgaoId);
    const { ok, dados } = await api(`/ia/semelhantes?${params.toString()}`);
    if (minhaVez !== sequenciaParecidos) return; // resposta antiga
    if (!ok || !dados.semelhantes || dados.semelhantes.length === 0) {
      document.getElementById('parecidos-box').style.display = 'none';
      return;
    }
    document.getElementById('parecidos-alerta').style.display = dados.possivel_duplicidade ? 'block' : 'none';
    document.getElementById('parecidos-lista').innerHTML = dados.semelhantes.map((s) => `
      <li><a href="achados.html?achado=${s.id}" target="_blank" rel="noopener">#${s.id} ${esc(s.titulo)}</a>
        — <b>${s.percentual}%</b> · ${esc(s.orgao_nome)} · ${esc(s.severidade)}</li>`).join('');
    document.getElementById('parecidos-box').style.display = 'block';
  } catch (e) {
    document.getElementById('parecidos-box').style.display = 'none';
  }
}

function agendarParecidos() {
  clearTimeout(temporizadorParecidos);
  temporizadorParecidos = setTimeout(buscarParecidos, 900);
}
['achado-titulo', 'achado-descricao'].forEach((id) => document.getElementById(id).addEventListener('input', agendarParecidos));
document.getElementById('achado-orgao').addEventListener('change', agendarParecidos);

// --- Exportação CSV (respeita os filtros atuais) ---
document.getElementById('btn-exportar').addEventListener('click', async () => {
  const btn = document.getElementById('btn-exportar');
  btn.disabled = true;
  btn.textContent = 'Exportando...';
  try {
    const resposta = await fetch(`${API_URL}/achados/exportar.csv?${parametrosFiltro().toString()}`, { headers: headersAutenticados() });
    if (resposta.status === 401) return logout();
    if (!resposta.ok) throw new Error('Falha ao exportar');
    const blob = await resposta.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'achados.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  } catch (erro) {
    alert('Não foi possível exportar o CSV. Verifique a conexão com o servidor.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Exportar CSV';
  }
});

// --- Aba "Histórico de auditoria" (quem fez o quê e quando) ---
const NOMES_ACAO = { criar: 'Criou o achado', editar: 'Editou o achado', excluir: 'Excluiu o achado', restaurar: 'Desfez a última edição' };
const NOMES_CAMPO = { titulo: 'Título', descricao: 'Descrição', severidade: 'Severidade', status: 'Status', orgao_id: 'Órgão (id)', recomendacao: 'Recomendação' };

function mostrarAba(aba) {
  const auditoria = aba === 'auditoria';
  formAchado.style.display = auditoria ? 'none' : 'block';
  document.getElementById('painel-auditoria').style.display = auditoria ? 'block' : 'none';
  document.getElementById('aba-dados').classList.toggle('ativa', !auditoria);
  document.getElementById('aba-auditoria').classList.toggle('ativa', auditoria);
}

async function carregarAuditoria(id) {
  const alvo = document.getElementById('lista-auditoria');
  alvo.innerHTML = '<div class="vazio">Carregando...</div>';
  try {
    const { ok, dados } = await api(`/achados/${id}/auditoria`);
    if (!ok) throw new Error(dados.erro);
    alvo.innerHTML = dados.auditoria.length ? dados.auditoria.map((a) => `
      <div class="item-auditoria">
        <b>${esc(a.usuario_nome)}</b> — ${esc(NOMES_ACAO[a.acao] || a.acao)}
        <span class="data-auditoria">${esc(String(a.criado_em).slice(0, 16))}</span>
        ${a.mudancas.length ? '<ul>' + a.mudancas.map((m) => `<li>${esc(NOMES_CAMPO[m.campo] || m.campo)}: <s>${esc(m.antes ?? '—')}</s> → ${esc(m.depois ?? '—')}</li>`).join('') + '</ul>' : ''}
      </div>`).join('') : '<div class="vazio">Nenhum registro de auditoria para este achado (anterior à auditoria).</div>';
  } catch (e) {
    alvo.innerHTML = '<div class="vazio">Não foi possível carregar a auditoria.</div>';
  }
}

document.getElementById('aba-dados').addEventListener('click', () => mostrarAba('dados'));
document.getElementById('aba-auditoria').addEventListener('click', () => {
  mostrarAba('auditoria');
  carregarAuditoria(document.getElementById('achado-id').value);
});
document.getElementById('btn-fechar-auditoria').addEventListener('click', () => overlayForm.classList.remove('aberto'));

// --- Histórico de edições e desfazer (Memento) ---
async function carregarHistorico(id) {
  const lista = document.getElementById('lista-historico');
  const btnDesfazer = document.getElementById('btn-desfazer');
  lista.innerHTML = '<li class="vazio-hist">Carregando...</li>';
  try {
    const { ok, dados } = await api(`/achados/${id}/historico`);
    if (!ok) throw new Error(dados.erro);
    lista.innerHTML = dados.historico.length
      ? dados.historico.map((i) => `<li>${esc(i.rotulo)} — ${esc(i.criado_em.replace('T', ' ').slice(0, 16))}</li>`).join('')
      : '<li class="vazio-hist">Nenhuma edição registrada.</li>';
    btnDesfazer.disabled = dados.historico.length === 0;
  } catch (e) {
    lista.innerHTML = '<li class="vazio-hist">Não foi possível carregar o histórico.</li>';
  }
}

document.getElementById('btn-desfazer').addEventListener('click', async () => {
  const id = document.getElementById('achado-id').value;
  const erroEl = document.getElementById('erro-desfazer');
  const btn = document.getElementById('btn-desfazer');
  erroEl.textContent = '';
  btn.disabled = true;
  try {
    const { ok, dados } = await api(`/achados/${id}/desfazer`, { method: 'POST' });
    if (!ok) { erroEl.textContent = dados.erro || 'Não foi possível desfazer.'; return; }
    const a = dados.achado;
    document.getElementById('achado-titulo').value = a.titulo;
    document.getElementById('achado-descricao').value = a.descricao;
    document.getElementById('achado-orgao').value = a.orgao_id;
    document.getElementById('achado-severidade').value = a.severidade;
    document.getElementById('achado-status').value = a.status;
    document.getElementById('achado-recomendacao').value = a.recomendacao || '';
    carregarAchados();
  } catch (e) {
    erroEl.textContent = 'Erro de conexão com o servidor.';
  } finally {
    await carregarHistorico(id);
  }
});

// --- IA local: recomendação automática ---
let usoIaAtual = null;       // id do registro em ia_uso da sugestão exibida
let textoAntesDaIA = '';     // texto anterior do campo, restaurado ao descartar

function resetarIA() {
  usoIaAtual = null;
  ['ia-box', 'ia-carregando', 'ia-erro', 'ia-resultado', 'ia-decisao'].forEach((id) => { document.getElementById(id).style.display = 'none'; });
  document.getElementById('ia-acoes').style.display = 'flex';
  document.getElementById('btn-gerar-ia').disabled = false;
}

async function informarResultadoIA(resultado) {
  if (!usoIaAtual) return;
  try { await api(`/ia/uso/${usoIaAtual}/resultado`, { method: 'POST', body: JSON.stringify({ resultado }) }); } catch (e) { console.error(e); }
}

document.getElementById('btn-gerar-ia').addEventListener('click', async () => {
  const titulo = document.getElementById('achado-titulo').value.trim();
  const descricao = document.getElementById('achado-descricao').value.trim();
  const orgaoId = document.getElementById('achado-orgao').value;
  const severidade = document.getElementById('achado-severidade').value;
  const caixa = document.getElementById('ia-box');
  const erroIA = document.getElementById('ia-erro');
  resetarIA();
  caixa.style.display = 'block';
  if (!titulo || !descricao || !orgaoId || !severidade) {
    erroIA.style.display = 'block';
    erroIA.textContent = 'Preencha título, descrição, órgão e severidade antes de gerar a recomendação.';
    return;
  }
  const orgao = cacheOrgaos.find((o) => String(o.id) === String(orgaoId));
  const btn = document.getElementById('btn-gerar-ia');
  btn.disabled = true;
  document.getElementById('ia-carregando').style.display = 'block';
  try {
    const idAchado = document.getElementById('achado-id').value;
    const { ok, dados } = await api('/ia/recomendacao', {
      method: 'POST',
      body: JSON.stringify({ titulo, descricao, severidade, orgao_nome: orgao ? orgao.nome : '', orgao_tipo: orgao ? orgao.tipo : '', achado_id: idAchado || undefined }),
    });
    document.getElementById('ia-carregando').style.display = 'none';
    if (!ok) {
      erroIA.style.display = 'block';
      erroIA.textContent = dados.erro || 'Não foi possível gerar a recomendação.';
      return;
    }
    const campo = document.getElementById('achado-recomendacao');
    textoAntesDaIA = campo.value;
    campo.value = dados.recomendacao;
    usoIaAtual = dados.uso_id;
    document.getElementById('ia-meta').textContent = `Modelo: ${dados.modelo} · Tempo de resposta: ${(dados.tempo_ms / 1000).toFixed(1)}s`;
    document.getElementById('ia-base').innerHTML = Object.entries(dados.base_utilizada)
      .map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v ?? '—')}</li>`).join('');
    document.getElementById('ia-resultado').style.display = 'block';
  } catch (erro) {
    document.getElementById('ia-carregando').style.display = 'none';
    erroIA.style.display = 'block';
    erroIA.textContent = 'Erro de conexão com o servidor. O restante do formulário continua funcionando.';
  } finally {
    btn.disabled = false;
  }
});

function decidirIA(resultado) {
  informarResultadoIA(resultado);
  document.getElementById('ia-acoes').style.display = 'none';
  const decisao = document.getElementById('ia-decisao');
  decisao.style.display = 'block';
  if (resultado === 'descartada') {
    document.getElementById('achado-recomendacao').value = textoAntesDaIA;
    decisao.textContent = 'Sugestão descartada.';
  } else {
    decisao.textContent = 'Sugestão aceita. Revise o texto e salve o achado.';
  }
  usoIaAtual = null;
}
document.getElementById('btn-ia-aceitar').addEventListener('click', () => decidirIA('aceita'));
document.getElementById('btn-ia-descartar').addEventListener('click', () => decidirIA('descartada'));

document.getElementById('menu').innerHTML = montarMenu('achados.html');
obterToken();
// Atualiza os dados do usuário (perfil) a partir do servidor antes de montar a lista
api('/auth/verify')
  .then(({ ok, dados }) => {
    if (ok && dados.usuario) {
      usuarioAtual = dados.usuario;
      localStorage.setItem('saac_usuario', JSON.stringify(dados.usuario));
    }
  })
  .catch(() => {})
  .then(carregarOrgaosSelects)
  .then(carregarAchados)
  .then(async () => {
    // Link de "achados parecidos": achados.html?achado=ID abre o achado
    const id = new URLSearchParams(window.location.search).get('achado');
    if (!id) return;
    const { ok, dados } = await api('/achados/' + encodeURIComponent(id));
    if (ok && dados.achado) abrirFormEdicao(dados.achado.id, [dados.achado]);
  });
