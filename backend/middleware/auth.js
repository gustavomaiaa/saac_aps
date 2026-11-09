// middleware/auth.js — valida o token JWT em rotas protegidas
const jwt = require('jsonwebtoken');
const db = require('../db');

function autenticarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ sucesso: false, erro: 'Token não informado.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, usuario) => {
    if (err) {
      // 401: o frontend limpa a sessao e volta para o login
      return res.status(401).json({ sucesso: false, erro: 'Token inválido ou expirado.' });
    }
    // O perfil vem do banco (e nao do token) para refletir mudancas de perfil e usuarios removidos
    const atual = db.prepare('SELECT perfil FROM usuarios WHERE id = ?').get(usuario.id);
    if (!atual) {
      return res.status(401).json({ sucesso: false, erro: 'Usuário do token não existe mais.' });
    }
    req.usuario = { ...usuario, perfil: atual.perfil };
    next();
  });
}

module.exports = autenticarToken;
