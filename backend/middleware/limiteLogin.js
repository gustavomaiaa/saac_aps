// middleware/limiteLogin.js — limite de tentativas de login por IP (em memória, sem dependência extra).
// Conta apenas tentativas FALHAS: após LOGIN_MAX_TENTATIVAS (padrão 5) falhas dentro da janela
// LOGIN_JANELA_MS (padrão 15 min), o IP recebe 429 até a janela expirar. Um login correto zera o contador.

const tentativas = new Map(); // ip -> { falhas, inicio }

function maximo() { return Number(process.env.LOGIN_MAX_TENTATIVAS) || 5; }
function janela() { return Number(process.env.LOGIN_JANELA_MS) || 15 * 60 * 1000; }

function registroAtual(ip) {
  const r = tentativas.get(ip);
  if (r && Date.now() - r.inicio >= janela()) {
    tentativas.delete(ip);
    return null;
  }
  return r || null;
}

// Middleware: bloqueia com 429 quando o IP excedeu as falhas
function limitarLogin(req, res, next) {
  const r = registroAtual(req.ip);
  if (r && r.falhas >= maximo()) {
    const segundos = Math.max(1, Math.ceil((r.inicio + janela() - Date.now()) / 1000));
    const minutos = Math.ceil(segundos / 60);
    res.setHeader('Retry-After', String(segundos));
    return res.status(429).json({
      sucesso: false,
      erro: `Muitas tentativas de login. Aguarde ${minutos} minuto(s) e tente novamente.`,
      retry_after_s: segundos,
    });
  }
  return next();
}

function registrarFalha(req) {
  const r = registroAtual(req.ip) || { falhas: 0, inicio: Date.now() };
  r.falhas += 1;
  tentativas.set(req.ip, r);
}

function registrarSucesso(req) {
  tentativas.delete(req.ip);
}

module.exports = { limitarLogin, registrarFalha, registrarSucesso };
