// routes/auth.js — rotas de cadastro e login (Sprint III)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const autenticarToken = require('../middleware/auth');
const { limitarLogin, registrarFalha, registrarSucesso } = require('../middleware/limiteLogin');
const { tratarErro } = require('../middleware/erros');
const v = require('../services/validacao');

const router = express.Router();

router.post('/cadastro', (req, res) => {
  try {
    const corpo = v.corpoJson(req);
    v.exigir(corpo, ['nome', 'email', 'senha', 'area'], 'Todos os campos são obrigatórios: nome, email, senha e área.');
    const { nome, email, senha, area } = v.validarCadastro(corpo);

    const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);

    if (existente) {
      return res.status(409).json({ sucesso: false, erro: 'Já existe um usuário cadastrado com este email.' });
    }

    const senhaHash = bcrypt.hashSync(senha, 10);

    // O primeiro usuario cadastrado vira administrador; os demais sao auditores
    const perfil = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total === 0 ? 'admin' : 'auditor';

    const resultado = db
      .prepare('INSERT INTO usuarios (nome, email, senha, area, perfil) VALUES (?, ?, ?, ?, ?)')
      .run(nome, email, senhaHash, area, perfil);

    const usuario = {
      id: Number(resultado.lastInsertRowid),
      nome,
      email,
      area,
      perfil,
    };

    const token = jwt.sign(usuario, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    });

    return res.status(201).json({ sucesso: true, mensagem: 'Usuário cadastrado com sucesso!', token, usuario });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao cadastrar usuário', 'Erro interno ao cadastrar usuário.');
  }
});

router.post('/login', limitarLogin, (req, res) => {
  try {
    const corpo = v.corpoJson(req);
    if (typeof corpo.email !== 'string' || typeof corpo.senha !== 'string' || !corpo.email || !corpo.senha) {
      return res.status(400).json({ sucesso: false, erro: 'Email e senha são obrigatórios.' });
    }
    const email = corpo.email.trim().toLowerCase();
    const { senha } = corpo;

    const usuarioDb = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);

    if (!usuarioDb) {
      registrarFalha(req);
      return res.status(401).json({ sucesso: false, erro: 'Email ou senha incorretos.' });
    }

    const senhaCorreta = bcrypt.compareSync(senha, usuarioDb.senha);

    if (!senhaCorreta) {
      registrarFalha(req);
      return res.status(401).json({ sucesso: false, erro: 'Email ou senha incorretos.' });
    }

    registrarSucesso(req);
    const usuario = { id: usuarioDb.id, nome: usuarioDb.nome, email: usuarioDb.email, area: usuarioDb.area, perfil: usuarioDb.perfil };

    const token = jwt.sign(usuario, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    });

    return res.status(200).json({ sucesso: true, mensagem: 'Login realizado com sucesso!', token, usuario });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao fazer login', 'Erro interno ao fazer login.');
  }
});

router.get('/verify', autenticarToken, (req, res) => {
  return res.status(200).json({ sucesso: true, usuario: req.usuario });
});

module.exports = router;
