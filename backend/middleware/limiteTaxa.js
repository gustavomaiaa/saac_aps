// middleware/limiteTaxa.js — limite de requisições por janela de tempo (em memória, sem dependência extra).
// Conta TODAS as requisições da chave (IP, usuário...) e responde 429 com Retry-After ao exceder o máximo.
// As entradas expiradas são removidas periodicamente (o mapa não cresce sem limite).

const valorDe = (x) => (typeof x === 'function' ? x() : x);

function numeroEnv(nome, padrao) {
  const n = Number(process.env[nome]);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

// config: { max, janelaMs, chave(req), mensagem({max, minutos, segundos}) } — max e janelaMs podem ser funções
// (lidas a cada requisição, para respeitar variáveis de ambiente alteradas em tempo de execução)
function criarLimitador({ max, janelaMs, chave, mensagem }) {
  const contagens = new Map(); // chave -> { n, inicio }

  const limpeza = setInterval(() => {
    const agora = Date.now();
    const janela = valorDe(janelaMs);
    for (const [k, r] of contagens) if (agora - r.inicio >= janela) contagens.delete(k);
  }, 60 * 1000);
  limpeza.unref(); // não impede o processo de encerrar

  const middleware = (req, res, next) => {
    const janela = valorDe(janelaMs);
    const limite = valorDe(max);
    const agora = Date.now();
    const k = String(chave(req));
    let r = contagens.get(k);
    if (!r || agora - r.inicio >= janela) {
      r = { n: 0, inicio: agora };
      contagens.set(k, r);
    }
    r.n += 1;
    if (r.n > limite) {
      const segundos = Math.max(1, Math.ceil((r.inicio + janela - agora) / 1000));
      res.setHeader('Retry-After', String(segundos));
      return res.status(429).json({
        sucesso: false,
        erro: mensagem({ max: limite, segundos, minutos: Math.ceil(segundos / 60) }),
        retry_after_s: segundos,
      });
    }
    return next();
  };
  middleware.tamanho = () => contagens.size; // para testes
  return middleware;
}

// --- Limites usados pela aplicação (todos configuráveis por variável de ambiente) ---

// Cadastro: por IP (padrão 10 tentativas por hora)
const limitarCadastro = criarLimitador({
  max: () => numeroEnv('CADASTRO_LIMITE_POR_HORA', 10),
  janelaMs: 60 * 60 * 1000,
  chave: (req) => `cadastro:${req.ip}`,
  mensagem: ({ max, minutos }) => `Muitas tentativas de cadastro deste endereço (limite de ${max} por hora). Tente novamente em ${minutos} minuto(s).`,
});

// IA que gera texto (recomendação, severidade, padrões): por USUÁRIO (padrão 10 por minuto)
const limitarIAGeracao = criarLimitador({
  max: () => numeroEnv('IA_LIMITE_POR_MINUTO', 10),
  janelaMs: 60 * 1000,
  chave: (req) => `ia-geracao:${req.usuario.id}`,
  mensagem: ({ max, segundos }) => `Limite de uso da IA atingido (${max} por minuto). Tente novamente em ${segundos} s.`,
});

// IA de achados semelhantes (consulta enquanto o usuário digita): por USUÁRIO (padrão 30 por minuto)
const limitarIASemelhantes = criarLimitador({
  max: () => numeroEnv('IA_LIMITE_SEMELHANTES_POR_MINUTO', 30),
  janelaMs: 60 * 1000,
  chave: (req) => `ia-semelhantes:${req.usuario.id}`,
  mensagem: ({ max, segundos }) => `Limite de consultas de achados parecidos atingido (${max} por minuto). Tente novamente em ${segundos} s.`,
});

module.exports = { criarLimitador, numeroEnv, limitarCadastro, limitarIAGeracao, limitarIASemelhantes };
