// config.js — verificação das variáveis de ambiente obrigatórias na inicialização.
// O servidor se recusa a subir sem um JWT_SECRET forte (e recusa os segredos de exemplo publicados no repositório).

// Segredos de exemplo que já foram publicados (README, .env.example antigo, docker-compose antigo)
const SEGREDOS_DE_EXEMPLO = [
  'saac_sprint3_super_secreto_troque_em_producao',
  'troque_este_segredo_em_producao',
];
const TAMANHO_MINIMO_SEGREDO = 32;

const COMANDO_GERAR = 'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"';

function validarConfiguracao(env = process.env) {
  const erros = [];
  const segredo = env.JWT_SECRET;
  if (typeof segredo !== 'string' || segredo.trim() === '') {
    erros.push(`JWT_SECRET não está definido. Defina um segredo forte no arquivo .env (gere um com: ${COMANDO_GERAR}).`);
  } else if (env.NODE_ENV !== 'test') {
    // Fora do ambiente de testes: recusa o segredo de exemplo e segredos curtos
    if (SEGREDOS_DE_EXEMPLO.includes(segredo.trim()) || /troque/i.test(segredo)) {
      erros.push(`JWT_SECRET é um valor de exemplo público (qualquer pessoa poderia forjar tokens). Gere um segredo próprio: ${COMANDO_GERAR}`);
    } else if (segredo.trim().length < TAMANHO_MINIMO_SEGREDO) {
      erros.push(`JWT_SECRET é curto demais (${segredo.trim().length} caracteres; mínimo ${TAMANHO_MINIMO_SEGREDO}). Gere um segredo próprio: ${COMANDO_GERAR}`);
    }
  }
  if (erros.length) {
    const erro = new Error(erros.join('\n'));
    erro.name = 'ErroConfiguracao';
    throw erro;
  }
}

module.exports = { validarConfiguracao, SEGREDOS_DE_EXEMPLO, TAMANHO_MINIMO_SEGREDO };
