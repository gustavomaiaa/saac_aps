// tests/helpers.js — ambiente de teste: banco em memoria + servidor Express em porta aleatoria.
// Deve ser o PRIMEIRO require dos arquivos de teste (define as variaveis de ambiente antes do app).
process.env.SAAC_DB_PATH = ':memory:';
process.env.JWT_SECRET = 'segredo_de_teste';
process.env.OLLAMA_TIMEOUT_MS = process.env.OLLAMA_TIMEOUT_MS || '2000';

const app = require('../server');
const db = require('../db');

let servidor;
let base;
let contador = 0;

async function iniciar() {
  await new Promise((resolve) => { servidor = app.listen(0, resolve); });
  base = `http://127.0.0.1:${servidor.address().port}/api`;
}

async function encerrar() {
  await new Promise((resolve) => servidor.close(resolve));
}

// Faz uma requisicao JSON. Devolve { status, corpo, texto, headers }.
async function req(metodo, caminho, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const resposta = await fetch(`${base}${caminho}`, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined });
  const texto = await resposta.text();
  let corpo = null;
  try { corpo = JSON.parse(texto); } catch (e) { corpo = null; }
  return { status: resposta.status, corpo, texto, headers: resposta.headers };
}

// Cadastra um usuario novo e devolve { token, usuario }
async function novoUsuario(nome = 'Usuario Teste') {
  contador += 1;
  const r = await req('POST', '/auth/cadastro', {
    body: { nome, email: `u${contador}@teste.com`, senha: '123456', area: 'Compliance' },
  });
  return { token: r.corpo.token, usuario: r.corpo.usuario };
}

async function novoOrgao(token, nome = 'Secretaria de Teste', tipo = 'Secretaria') {
  const r = await req('POST', '/orgaos', { token, body: { nome, tipo } });
  return r.corpo.orgao;
}

async function novoAchado(token, orgaoId, extra = {}) {
  const r = await req('POST', '/achados', {
    token,
    body: { titulo: 'Achado de teste', descricao: 'Descricao do achado de teste', severidade: 'Alto', orgao_id: orgaoId, ...extra },
  });
  return r.corpo.achado;
}

module.exports = { iniciar, encerrar, req, novoUsuario, novoOrgao, novoAchado, db };
