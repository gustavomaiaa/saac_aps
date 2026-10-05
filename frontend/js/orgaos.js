// orgaos.js — CRUD de Orgaos (listar, criar, editar, excluir)
let orgaoParaExcluir = null;

const tbody = document.getElementById('tbody-orgaos');
const vazio = document.getElementById('vazio-orgaos');
const overlayForm = document.getElementById('overlay-form');
const overlayExcluir = document.getElementById('overlay-excluir');
const formOrgao = document.getElementById('form-orgao');
const formTitulo = document.getElementById('form-titulo');
const alertaForm = document.getElementById('alerta-form');

async function carregarOrgaos() {
  try {
    const resposta = await fetch(`${API_URL}/orgaos`, { headers: headersAutenticados() });
    const dados = await resposta.json();
    if (!resposta.ok) {
      if (resposta.status === 401 || resposta.status === 403) return logout();
      throw new Error(dados.erro);
    }
    tbody.innerHTML = '';
    vazio.style.display = dados.orgaos.length === 0 ? 'block' : 'none';
    dados.orgaos.forEach((orgao) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${orgao.nome}</td><td>${orgao.tipo}</td><td>${orgao.total_achados}</td>
        <td>${orgao.criado_em.split(' ')[0]}</td>
        <td class="acoes">
          <button class="btn btn-secundario btn-pequeno" data-editar="${orgao.id}">Editar</button>
          <button class="btn btn-perigo btn-pequeno" data-excluir="${orgao.id}" data-nome="${orgao.nome}">Excluir</button>
        </td>`;
      tbody.appendChild(tr);
    });
    document.querySelectorAll('[data-editar]').forEach((btn) => {
      btn.addEventListener('click', () => abrirFormEdicao(btn.dataset.editar, dados.orgaos));
    });
    document.querySelectorAll('[data-excluir]').forEach((btn) => {
      btn.addEventListener('click', () => abrirConfirmacaoExclusao(btn.dataset.excluir, btn.dataset.nome));
    });
  } catch (erro) {
    console.error('Erro ao carregar órgãos:', erro);
  }
}

function limparFormulario() {
  document.getElementById('orgao-id').value = '';
  document.getElementById('orgao-nome').value = '';
  document.getElementById('orgao-tipo').value = '';
  document.getElementById('erro-nome').textContent = '';
  document.getElementById('erro-tipo').textContent = '';
  alertaForm.className = 'alerta';
  alertaForm.textContent = '';
}

function abrirFormNovo() {
  limparFormulario();
  formTitulo.textContent = 'Novo Órgão';
  overlayForm.classList.add('aberto');
}

function abrirFormEdicao(id, orgaos) {
  limparFormulario();
  const orgao = orgaos.find((o) => String(o.id) === String(id));
  if (!orgao) return;
  formTitulo.textContent = 'Editar Órgão';
  document.getElementById('orgao-id').value = orgao.id;
  document.getElementById('orgao-nome').value = orgao.nome;
  document.getElementById('orgao-tipo').value = orgao.tipo;
  overlayForm.classList.add('aberto');
}

function abrirConfirmacaoExclusao(id, nome) {
  orgaoParaExcluir = id;
  document.getElementById('nome-orgao-excluir').textContent = nome;
  document.getElementById('alerta-excluir').className = 'alerta';
  document.getElementById('alerta-excluir').textContent = '';
  overlayExcluir.classList.add('aberto');
}

document.getElementById('btn-novo-orgao').addEventListener('click', abrirFormNovo);
document.getElementById('btn-cancelar-form').addEventListener('click', () => overlayForm.classList.remove('aberto'));
document.getElementById('btn-cancelar-excluir').addEventListener('click', () => overlayExcluir.classList.remove('aberto'));

formOrgao.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('orgao-id').value;
  const nome = document.getElementById('orgao-nome').value.trim();
  const tipo = document.getElementById('orgao-tipo').value;

  let valido = true;
  document.getElementById('erro-nome').textContent = '';
  document.getElementById('erro-tipo').textContent = '';
  if (nome.length < 3) { document.getElementById('erro-nome').textContent = 'Informe pelo menos 3 caracteres.'; valido = false; }
  if (!tipo) { document.getElementById('erro-tipo').textContent = 'Selecione um tipo.'; valido = false; }
  if (!valido) return;

  const btnSalvar = document.getElementById('btn-salvar-orgao');
  btnSalvar.disabled = true;
  btnSalvar.textContent = 'Salvando...';

  try {
    const url = id ? `${API_URL}/orgaos/${id}` : `${API_URL}/orgaos`;
    const metodo = id ? 'PUT' : 'POST';
    const resposta = await fetch(url, { method: metodo, headers: headersAutenticados(), body: JSON.stringify({ nome, tipo }) });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.sucesso) {
      alertaForm.className = 'alerta erro-geral';
      alertaForm.textContent = dados.erro || 'Não foi possível salvar o órgão.';
      return;
    }
    overlayForm.classList.remove('aberto');
    carregarOrgaos();
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
    const resposta = await fetch(`${API_URL}/orgaos/${orgaoParaExcluir}`, { method: 'DELETE', headers: headersAutenticados() });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.sucesso) {
      const alertaExcluir = document.getElementById('alerta-excluir');
      alertaExcluir.className = 'alerta erro-geral';
      alertaExcluir.textContent = dados.erro || 'Não foi possível excluir o órgão.';
      return;
    }
    overlayExcluir.classList.remove('aberto');
    carregarOrgaos();
  } catch (erro) {
    console.error(erro);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Excluir';
  }
});

obterToken();
carregarOrgaos();
