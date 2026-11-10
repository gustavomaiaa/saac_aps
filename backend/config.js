// config.js — verificação das variáveis de ambiente obrigatórias na inicialização.
// O servidor se recusa a subir sem um JWT_SECRET configurado.

function validarConfiguracao(env = process.env) {
  const erros = [];
  const segredo = env.JWT_SECRET;
  if (typeof segredo !== 'string' || segredo.trim() === '') {
    erros.push('JWT_SECRET não está definido. Defina um segredo forte no arquivo .env (ex.: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))").');
  }
  if (erros.length) {
    const erro = new Error(erros.join('\n'));
    erro.name = 'ErroConfiguracao';
    throw erro;
  }
}

module.exports = { validarConfiguracao };
