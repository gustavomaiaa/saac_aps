// middleware/auth.js — valida o token JWT em rotas protegidas
const jwt = require('jsonwebtoken');

function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ sucesso: false, erro: 'Token não informado.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, usuario) => {
    if (err) {
      return res.status(403).json({ sucesso: false, erro: 'Token inválido ou expirado.' });
    }
    req.usuario = usuario;
    next();
  });
}

module.exports = autenticarToken;
