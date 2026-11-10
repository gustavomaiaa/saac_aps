// routes/auth.js — rotas de cadastro e login (Sprint III)
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const autenticarToken = require('../middleware/auth');
const { limitarLogin, registrarFalha, registrarSucesso } = require('../middleware/limiteLogin');
const { limitarCadastro } = require('../middleware/limiteTaxa');
const { tratarErro, asyncHandler } = require('../middleware/erros');
const v = require('../services/validacao');
const crypto = require('crypto');

// Comparação em tempo constante do código de convite (CODIGO_CONVITE no .env)
function conviteConfere(informado) {
  const esperado = process.env.CODIGO_CONVITE;
  const hash = (t) => crypto.createHash('sha256').update(String(t)).digest();
  return crypto.timingSafeEqual(hash(informado), hash(String(esperado).trim()));
}

// Custo do bcrypt (hash/compare ASSÍNCRONOS: não bloqueiam o event loop)
const BCRYPT_CUSTO = 10;

const router = express.Router();

router.post('/cadastro', limitarCadastro, asyncHandler(async (req, res) => {
  try {
    const corpo = v.corpoJson(req);
    v.exigir(corpo, ['nome', 'email', 'senha', 'area'], 'Todos os campos são obrigatórios: nome, email, senha e área.');
    // Cadastro somente com código de convite (definido pelo administrador em CODIGO_CONVITE)
    if (!process.env.CODIGO_CONVITE || !process.env.CODIGO_CONVITE.trim()) {
      return res.status(403).json({ sucesso: false, erro: 'Cadastro desativado: o administrador ainda não definiu o código de convite (CODIGO_CONVITE) no servidor.' });
    }
    v.exigir(corpo, ['codigo_convite'], 'Informe o código de convite.');
    const codigo = v.texto(corpo.codigo_convite, 'O código de convite', { max: v.LIMITES.codigoConvite.max });
    if (!conviteConfere(codigo)) {
      return res.status(403).json({ sucesso: false, erro: 'Código de convite inválido.' });
    }
    const { nome, email, senha, area } = v.validarCadastro(corpo);

    const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);

    if (existente) {
      return res.status(409).json({ sucesso: false, erro: 'Já existe um usuário cadastrado com este email.' });
    }

    // hash assíncrono; depois dele, a verificação do perfil e o INSERT rodam juntos (sem await entre eles)
    const senhaHash = await bcrypt.hash(senha, BCRYPT_CUSTO);

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
    // e-mail cadastrado por outra requisição simultânea (restrição UNIQUE)
    if (/UNIQUE constraint failed: usuarios\.email/.test(String(erro && erro.message))) {
      return res.status(409).json({ sucesso: false, erro: 'Já existe um usuário cadastrado com este email.' });
    }
    return tratarErro(res, erro, 'Erro ao cadastrar usuário', 'Erro interno ao cadastrar usuário.');
  }
}));

router.post('/login', limitarLogin, asyncHandler(async (req, res) => {
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

    const senhaCorreta = await bcrypt.compare(senha, usuarioDb.senha);

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
}));

router.get('/verify', autenticarToken, (req, res) => {
  return res.status(200).json({ sucesso: true, usuario: req.usuario });
});

module.exports = router;
