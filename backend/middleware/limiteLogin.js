// middleware/limiteLogin.js — bloqueio de login por IP + e-mail (em memória, sem dependência extra).
// Conta apenas tentativas FALHAS:
//  - por IP + e-mail: após LOGIN_MAX_TENTATIVAS (padrão 5) falhas na janela LOGIN_JANELA_MS (padrão 15 min), aquele
//    e-mail deixa de ser aceito a partir daquele IP (429). Outros e-mails e outros IPs não são afetados.
//  - por IP (proteção contra tentar muitos e-mails): LOGIN_MAX_TENTATIVAS_IP (padrão 4 × o limite acima).
// Um login correto zera o contador daquele IP + e-mail. Entradas expiradas são removidas periodicamente.
const { numeroEnv } = require('./limiteTaxa');

const porIpEmail = new Map(); // `${ip}|${email}` -> { falhas, inicio }
const porIp = new Map();      // ip -> { falhas, inicio }

const maximo = () => numeroEnv('LOGIN_MAX_TENTATIVAS', 5);
const maximoIp = () => numeroEnv('LOGIN_MAX_TENTATIVAS_IP', maximo() * 4);
const janela = () => numeroEnv('LOGIN_JANELA_MS', 15 * 60 * 1000);

const limpeza = setInterval(() => {
  const agora = Date.now();
  for (const mapa of [porIpEmail, porIp]) for (const [k, r] of mapa) if (agora - r.inicio >= janela()) mapa.delete(k);
}, 60 * 1000);
limpeza.unref();

function emailDaRequisicao(req) {
  const e = req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return e.slice(0, 254);
}
const chaveIpEmail = (req) => `${req.ip}|${emailDaRequisicao(req)}`;

function registroAtual(mapa, chave) {
  const r = mapa.get(chave);
  if (r && Date.now() - r.inicio >= janela()) {
    mapa.delete(chave);
    return null;
  }
  return r || null;
}

// Middleware: bloqueia com 429 quando o IP+e-mail (ou o IP) excedeu as falhas
function limitarLogin(req, res, next) {
  const a = registroAtual(porIpEmail, chaveIpEmail(req));
  const b = registroAtual(porIp, req.ip);
  const bloqueado = [a && a.falhas >= maximo() ? a : null, b && b.falhas >= maximoIp() ? b : null].filter(Boolean);
  if (bloqueado.length) {
    const fim = Math.max(...bloqueado.map((r) => r.inicio + janela()));
    const segundos = Math.max(1, Math.ceil((fim - Date.now()) / 1000));
    res.setHeader('Retry-After', String(segundos));
    return res.status(429).json({
      sucesso: false,
      erro: `Muitas tentativas de login. Aguarde ${Math.ceil(segundos / 60)} minuto(s) e tente novamente.`,
      retry_after_s: segundos,
    });
  }
  return next();
}

function registrarFalha(req) {
  for (const [mapa, chave] of [[porIpEmail, chaveIpEmail(req)], [porIp, req.ip]]) {
    const r = registroAtual(mapa, chave) || { falhas: 0, inicio: Date.now() };
    r.falhas += 1;
    mapa.set(chave, r);
  }
}

function registrarSucesso(req) {
  porIpEmail.delete(chaveIpEmail(req));
}

module.exports = { limitarLogin, registrarFalha, registrarSucesso, _mapas: { porIpEmail, porIp } };
