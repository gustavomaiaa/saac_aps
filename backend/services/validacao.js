// services/validacao.js — validação central de entrada (tipos, tamanhos, enums e IDs).
// Todas as funções lançam ErroValidacao (HTTP 400, mensagem em português) e devolvem valores já normalizados.
const { ErroValidacao } = require('../middleware/erros');
const { SEVERIDADES, STATUS, TIPOS_ORGAO, AREAS } = require('./dominio');

// Limites documentados (README, seção "Limites de entrada")
const LIMITES = {
  titulo: { min: 5, max: 200 },
  descricao: { min: 1, max: 4000 },
  recomendacao: { max: 2000 },
  nomeUsuario: { min: 3, max: 120 },
  nomeOrgao: { min: 3, max: 150 },
  email: { max: 254 },
  senha: { min: 6, maxBytes: 72 },   // o bcrypt só considera os 72 primeiros bytes
  busca: { max: 100 },
  codigoConvite: { max: 100 },
  paginaLimiteMax: 100,
};

// Caracteres de controle (exceto tab, quebra de linha e retorno de carro)
const RE_CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Corpo JSON precisa ser um objeto (não null, array ou texto)
function corpoJson(req) {
  const corpo = req.body;
  if (corpo === undefined) return {};
  if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroValidacao('O corpo da requisição deve ser um objeto JSON.');
  }
  return corpo;
}

// Campos obrigatórios presentes (não undefined/null/"")
function exigir(corpo, campos, mensagem) {
  if (campos.some((c) => corpo[c] === undefined || corpo[c] === null || corpo[c] === '')) {
    throw new ErroValidacao(mensagem);
  }
}

// Texto: tipo string, sem caracteres de controle, tamanho dentro do limite (após trim).
// `rotulo` entra na mensagem (ex.: "O título").
function texto(valor, rotulo, { min = 1, max, multilinha = false } = {}) {
  if (typeof valor !== 'string') throw new ErroValidacao(`${rotulo} deve ser um texto.`);
  const t = valor.trim();
  if (RE_CONTROLE.test(t) || (!multilinha && /[\r\n\t]/.test(t))) {
    throw new ErroValidacao(`${rotulo} contém caracteres inválidos.`);
  }
  if (t.length < min) {
    throw new ErroValidacao(min <= 1 ? `${rotulo} não pode ficar em branco.` : `${rotulo} deve ter pelo menos ${min} caracteres.`);
  }
  if (max !== undefined && t.length > max) {
    throw new ErroValidacao(`${rotulo} deve ter no máximo ${max} caracteres.`);
  }
  return t;
}

// Inteiro positivo vindo do corpo (número inteiro ou texto só com dígitos). Booleanos, objetos e arrays são recusados.
function inteiroPositivo(valor, rotulo) {
  if (typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0) return valor;
  if (typeof valor === 'string' && /^[1-9]\d{0,15}$/.test(valor.trim())) {
    const n = Number(valor.trim());
    if (Number.isSafeInteger(n)) return n;
  }
  throw new ErroValidacao(`${rotulo} inválido (informe um número inteiro positivo).`);
}

// ID de rota (/:id)
function idParam(valor) {
  if (typeof valor === 'string' && /^[1-9]\d{0,15}$/.test(valor) && Number.isSafeInteger(Number(valor))) return Number(valor);
  throw new ErroValidacao('ID inválido (informe um número inteiro positivo).');
}

// Parâmetro de query (sempre string; arrays/objetos virados por `?a=1&a=2` ou `a[]=1` são recusados)
function inteiroQuery(valor, nome) {
  if (typeof valor === 'string' && /^[1-9]\d{0,9}$/.test(valor)) return Number(valor);
  throw new ErroValidacao(`Parâmetro "${nome}" inválido (informe um número inteiro positivo).`);
}

function textoQuery(valor, nome, max) {
  if (typeof valor !== 'string') throw new ErroValidacao(`Parâmetro "${nome}" inválido.`);
  const t = valor.trim();
  if (RE_CONTROLE.test(t)) throw new ErroValidacao(`Parâmetro "${nome}" contém caracteres inválidos.`);
  if (t.length > max) throw new ErroValidacao(`Parâmetro "${nome}" deve ter no máximo ${max} caracteres.`);
  return t;
}

function opcao(valor, lista, mensagemBase) {
  if (typeof valor !== 'string' || !lista.includes(valor)) {
    throw new ErroValidacao(`${mensagemBase}. Opções: ${lista.join(', ')}.`);
  }
  return valor;
}

// pagina/limite: inteiros positivos; limite acima do máximo é limitado a 100
function paginacao(query) {
  const pagina = query.pagina === undefined ? 1 : inteiroQuery(query.pagina, 'pagina');
  const limite = query.limite === undefined ? 10 : inteiroQuery(query.limite, 'limite');
  return { pagina, limite: Math.min(limite, LIMITES.paginaLimiteMax) };
}

// Filtros da listagem/CSV de achados: devolve só os que foram informados, já validados
function filtrosAchados(query) {
  const f = {};
  if (query.orgao_id !== undefined) f.orgao_id = inteiroQuery(query.orgao_id, 'orgao_id');
  if (query.status !== undefined) f.status = opcao(query.status, STATUS, 'Status inválido');
  if (query.severidade !== undefined) f.severidade = opcao(query.severidade, SEVERIDADES, 'Severidade inválida');
  if (query.q !== undefined) {
    const q = textoQuery(query.q, 'q', LIMITES.busca.max);
    if (q) f.q = q;
  }
  return f;
}

// Recomendação opcional: undefined = "não enviada" (preserva o valor atual); vazio vira null
function recomendacaoOpcional(valor) {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const t = texto(valor, 'A recomendação', { min: 0, max: LIMITES.recomendacao.max, multilinha: true });
  return t || null;
}

// Corpo de achado (POST/PUT). No PUT o status é obrigatório; `versao` é opcional (controle de conflito).
function validarAchado(corpo, { statusObrigatorio }) {
  const dados = {
    titulo: texto(corpo.titulo, 'O título', LIMITES.titulo),
    descricao: texto(corpo.descricao, 'A descrição', { ...LIMITES.descricao, multilinha: true }),
    severidade: opcao(corpo.severidade, SEVERIDADES, 'Severidade inválida'),
    orgao_id: inteiroPositivo(corpo.orgao_id, 'Órgão'),
    recomendacao: recomendacaoOpcional(corpo.recomendacao),
  };
  if (statusObrigatorio || (corpo.status !== undefined && corpo.status !== null && corpo.status !== '')) {
    dados.status = opcao(corpo.status, STATUS, 'Status inválido');
  } else {
    dados.status = 'Em aberto';
  }
  if (corpo.versao !== undefined && corpo.versao !== null) dados.versao = inteiroPositivo(corpo.versao, 'Versão');
  return dados;
}

function validarOrgao(corpo) {
  return {
    nome: texto(corpo.nome, 'O nome', LIMITES.nomeOrgao),
    tipo: opcao(corpo.tipo, TIPOS_ORGAO, 'Tipo inválido'),
  };
}

function email(valor) {
  const e = texto(valor, 'O e-mail', { min: 1, max: LIMITES.email.max }).toLowerCase();
  if (!RE_EMAIL.test(e)) throw new ErroValidacao('Email inválido.');
  return e;
}

// Senha: texto (sem trim), mínimo de caracteres e máximo de 72 bytes (limite do bcrypt)
function senha(valor) {
  if (typeof valor !== 'string') throw new ErroValidacao('A senha deve ser um texto.');
  if (valor.length < LIMITES.senha.min) throw new ErroValidacao(`A senha deve ter pelo menos ${LIMITES.senha.min} caracteres.`);
  if (Buffer.byteLength(valor, 'utf8') > LIMITES.senha.maxBytes) {
    throw new ErroValidacao(`A senha deve ter no máximo ${LIMITES.senha.maxBytes} bytes (cerca de ${LIMITES.senha.maxBytes} caracteres).`);
  }
  return valor;
}

function validarCadastro(corpo) {
  return {
    nome: texto(corpo.nome, 'O nome', LIMITES.nomeUsuario),
    email: email(corpo.email),
    senha: senha(corpo.senha),
    area: opcao(corpo.area, AREAS, 'Área inválida'),
  };
}

module.exports = {
  LIMITES, corpoJson, exigir, texto, inteiroPositivo, idParam, inteiroQuery, textoQuery, opcao,
  paginacao, filtrosAchados, recomendacaoOpcional, validarAchado, validarOrgao, email, senha, validarCadastro,
};
