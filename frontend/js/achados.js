// achados.js — CRUD de Achados (listar com filtros, criar, editar, excluir)
let achadoParaExcluir = null;
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
  const resposta = await fetch(`${API_URL}/orgaos`, { headers: headersAutenticados() });
  const dados = await resposta.json();
  if (!resposta.ok) return;
  cacheOrgaos = dados.orgaos;
  const filtroOrgao = document.getElementById('filtro-orgao');
  const formOrgaoSelect = document.getElementById('achado-orgao');
  filtroOrgao.innerHTML = '<option value="">Todos</option>';
  formOrgaoSelect.innerHTML = '<option value="">Selecione...</option>';
  dados.orgaos.forEach((orgao) => {
    filtroOrgao.innerHTML += `<option value="${orgao.id}">${orgao.nome}</option>`;
    formOrgaoSelect.innerHTML += `<option value="${orgao.id}">${orgao.nome}</option>`;
  });
}

async function carregarAchados() {
  try {
    const params = new URLSearchParams();
    const orgaoId = document.getElementById('filtro-orgao').value;
    const severidade = document.getElementById('filtro-severidade').value;
    const status = document.getElementById('filtro-status').value;
    if (orgaoId) params.set('orgao_id', orgaoId);
    if (severidade) params.set('severidade', severidade);
    if (status) params.set('status', status);

    const resposta = await fetch(`${API_URL}/achados?${params.toString()}`, { headers: headersAutenticados() });
    const dados = await resposta.json();
    if (!resposta.ok) {
      if (resposta.status === 401 || resposta.status === 403) return logout();
      throw new Error(dados.erro);
    }

    tbody.innerHTML = '';
    vazio.style.display = dados.achados.length === 0 ? 'block' : 'none';
    dados.achados.forEach((achado) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${achado.titulo}</td><td>${achado.orgao_nome}</td>
        <td><span class="badge ${classeBadgeSeveridade(achado.severidade)}">${achado.severidade}</span></td>
        <td><span class="badge ${classeBadgeStatus(achado.status)}">${achado.status}</span></td>
        <td>${achado.criado_por_nome}</td>
        <td class="acoes">
          <button class="btn btn-secundario btn-pequeno" data-editar="${achado.id}">Editar</button>
          <button class="btn btn-perigo btn-pequeno" data-excluir="${achado.id}" data-titulo="${achado.titulo}">Excluir</button>
        </td>`;
      tbody.appendChild(tr);
    });
    document.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => abrirFormEdicao(btn.dataset.editar, dados.achados));
    });
    document.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', () => abrirConfirmacaoExclusao(btn.dataset.excluir, btn.dataset.titulo));
    });
  } catch (erro) {
    console.error('Erro ao carregar achados:', erro);
  }
}

function limparFormulario() {
  document.getElementById('achado-id').value = '';
  document.getElementById('achado-titulo').value = '';
  document.getElementById('achado-descricao').value = '';
  document.getElementById('achado-orgao').value = '';
  document.getElementById('achado-severidade').value = '';
  document.getElementById('achado-status').value = 'Em aberto';
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
document.getElementById('btn-filtrar').addEventListener('click', carregarAchados);
document.getElementById('btn-limpar-filtro').addEventListener('click', () => {
  document.getElementById('filtro-orgao').value = '';
  document.getElementById('filtro-severidade').value = '';
  document.getElementById('filtro-status').value = '';
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
    const url = id ? `${API_URL}/achados/${id}` : `${API_URL}/achados`;
    const metodo = id ? 'PUT' : 'POST';
    const resposta = await fetch(url, {
      method: metodo, headers: headersAutenticados(),
      body: JSON.stringify({ titulo, descricao, orgao_id, severidade, status }),
    });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.sucesso) {
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
    const resposta = await fetch(`${API_URL}/achados/${achadoParaExcluir}`, { method: 'DELETE', headers: headersAutenticados() });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.sucesso) {
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

obterToken();
carregarOrgaosSelects().then(carregarAchados);
