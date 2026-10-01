// routes/auth.js — rotas de cadastro e login (Sprint III)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const autenticarToken = require('../middleware/auth');

const router = express.Router();

const AREAS_VALIDAS = [
  'Educação',
  'Saúde',
  'Obras',
  'Finanças',
  'Administração',
  'Compliance',
  'Outra',
];

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/cadastro', (req, res) => {
  const { nome, email, senha, area } = req.body;

  if (!nome || !email || !senha || !area) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Todos os campos são obrigatórios: nome, email, senha e área.',
    });
  }

  if (nome.trim().length < 3) {
    return res.status(400).json({ sucesso: false, erro: 'O nome deve ter pelo menos 3 caracteres.' });
  }

  if (!emailValido(email)) {
    return res.status(400).json({ sucesso: false, erro: 'Email inválido.' });
  }

  if (senha.length < 6) {
    return res.status(400).json({ sucesso: false, erro: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  if (!AREAS_VALIDAS.includes(area)) {
    return res.status(400).json({
      sucesso: false,
      erro: `Área inválida. Opções: ${AREAS_VALIDAS.join(', ')}.`,
    });
  }

  try {
    const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email.toLowerCase());

    if (existente) {
      return res.status(409).json({ sucesso: false, erro: 'Já existe um usuário cadastrado com este email.' });
    }

    const senhaHash = bcrypt.hashSync(senha, 10);

    const resultado = db
      .prepare('INSERT INTO usuarios (nome, email, senha, area) VALUES (?, ?, ?, ?)')
      .run(nome.trim(), email.toLowerCase(), senhaHash, area);

    const usuario = {
      id: resultado.lastInsertRowid,
      nome: nome.trim(),
      email: email.toLowerCase(),
      area,
    };

    const token = jwt.sign(usuario, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    });

    return res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado com sucesso!', token, usuario });
  } catch (erro) {
    console.error('Erro ao cadastrar usuário:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao cadastrar usuário.' });
  }
});

router.post('/login', (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ sucesso: false, erro: 'Email e senha são obrigatórios.' });
  }

  try {
    const usuarioDb = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.toLowerCase());

    if (!usuarioDb) {
      return res.status(401).json({ sucesso: false, erro: 'Email ou senha incorretos.' });
    }

    const senhaCorreta = bcrypt.compareSync(senha, usuarioDb.senha);

    if (!senhaCorreta) {
      return res.status(401).json({ sucesso: false, erro: 'Email ou senha incorretos.' });
    }

    const usuario = { id: usuarioDb.id, nome: usuarioDb.nome, email: usuarioDb.email, area: usuarioDb.area };

    const token = jwt.sign(usuario, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    });

    return res.status(200).json({ sucesso: true, mensagem: 'Login realizado com sucesso!', token, usuario });
  } catch (erro) {
    console.error('Erro ao fazer login:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao fazer login.' });
  }
});

router.get('/verify', autenticarToken, (req, res) => {
  return res.status(200).json({ sucesso: true, usuario: req.usuario });
});

module.exports = router;
