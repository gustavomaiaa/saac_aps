// middleware/erros.js — erros de validação e tratador global de erros (sempre JSON, sem stack trace).

// Erro de entrada do usuário: vira HTTP 400 com a mensagem (em português) para o cliente.
class ErroValidacao extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroValidacao';
    this.status = 400;
  }
}

// Usado nos `catch` das rotas: 400 para erro de validação; qualquer outra coisa é erro interno
// (registrado só no log do servidor) e o cliente recebe uma mensagem genérica.
function tratarErro(res, erro, contexto, mensagemInterna) {
  if (erro instanceof ErroValidacao) {
    return res.status(400).json({ sucesso: false, erro: erro.message });
  }
  console.error(`${contexto}:`, erro);
  return res.status(500).json({ sucesso: false, erro: mensagemInterna });
}

// Permite handlers async lançarem erros (ErroValidacao, etc.) para o tratador global
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// 404 em JSON para rotas inexistentes
function rotaNaoEncontrada(req, res) {
  res.status(404).json({ sucesso: false, erro: 'Rota não encontrada.' });
}

// Tratador global (último middleware). Nunca devolve stack trace nem caminhos de arquivo.
// eslint-disable-next-line no-unused-vars
function tratadorGlobal(erro, req, res, next) {
  if (erro instanceof ErroValidacao) {
    return res.status(400).json({ sucesso: false, erro: erro.message });
  }
  if (erro && erro.type === 'entity.parse.failed') {
    return res.status(400).json({ sucesso: false, erro: 'JSON inválido no corpo da requisição.' });
  }
  if (erro && erro.type === 'entity.too.large') {
    return res.status(413).json({ sucesso: false, erro: 'Corpo da requisição grande demais (máximo de 100 KB).' });
  }
  if (erro && erro.status >= 400 && erro.status < 500) {
    return res.status(erro.status).json({ sucesso: false, erro: 'Requisição inválida.' });
  }
  console.error('Erro não tratado:', erro);
  return res.status(500).json({ sucesso: false, erro: 'Erro interno do servidor.' });
}

module.exports = { ErroValidacao, tratarErro, asyncHandler, rotaNaoEncontrada, tratadorGlobal };
