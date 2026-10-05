// routes/achados.js — CRUD de Achados (Sprint IV)
// Cada Achado pertence a um Orgao (FK orgao_id) e registra quem o criou.
const express = require('express');
const db = require('../db');
const autenticarToken = require('../middleware/auth');

const router = express.Router();
router.use(autenticarToken);

const SEVERIDADES_VALIDAS = ['Crítico', 'Alto', 'Médio', 'Baixo'];
const STATUS_VALIDOS = ['Em aberto', 'Em análise', 'Implementado', 'Rejeitado'];
function severidadeValida(s) { return SEVERIDADES_VALIDAS.includes(s); }
function statusValido(s) { return STATUS_VALIDOS.includes(s); }

router.post('/', (req, res) => {
  const { titulo, descricao, severidade, orgao_id, status } = req.body;
  if (!titulo || !descricao || !severidade || !orgao_id) {
    return res.status(400).json({ sucesso: false, erro: 'Título, descrição, severidade e órgão são obrigatórios.' });
  }
  if (titulo.trim().length < 5) {
    return res.status(400).json({ sucesso: false, erro: 'O título deve ter pelo menos 5 caracteres.' });
  }
  if (!severidadeValida(severidade)) {
    return res.status(400).json({ sucesso: false, erro: `Severidade inválida. Opções: ${SEVERIDADES_VALIDAS.join(', ')}.` });
  }
  if (status && !statusValido(status)) {
    return res.status(400).json({ sucesso: false, erro: `Status inválido. Opções: ${STATUS_VALIDOS.join(', ')}.` });
  }
  try {
    const orgao = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(orgao_id);
    if (!orgao) return res.status(400).json({ sucesso: false, erro: 'Órgão informado não existe.' });

    const resultado = db.prepare(
      `INSERT INTO achados (titulo, descricao, severidade, status, orgao_id, criado_por_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(titulo.trim(), descricao.trim(), severidade, status || 'Em aberto', orgao_id, req.usuario.id);

    const achado = db.prepare(
      `SELECT a.*, o.nome AS orgao_nome FROM achados a JOIN orgaos o ON o.id = a.orgao_id WHERE a.id = ?`
    ).get(resultado.lastInsertRowid);

    return res.status(201).json({ sucesso: true, mensagem: 'Achado cadastrado com sucesso!', achado });
  } catch (erro) {
    console.error('Erro ao criar achado:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao cadastrar achado.' });
  }
});

router.get('/', (req, res) => {
  try {
    const condicoes = [];
    const parametros = [];
    if (req.query.orgao_id) { condicoes.push('a.orgao_id = ?'); parametros.push(req.query.orgao_id); }
    if (req.query.status) { condicoes.push('a.status = ?'); parametros.push(req.query.status); }
    if (req.query.severidade) { condicoes.push('a.severidade = ?'); parametros.push(req.query.severidade); }
    const whereSql = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';

    const achados = db.prepare(
      `SELECT a.*, o.nome AS orgao_nome, u.nome AS criado_por_nome
       FROM achados a
       JOIN orgaos o ON o.id = a.orgao_id
       JOIN usuarios u ON u.id = a.criado_por_id
       ${whereSql}
       ORDER BY a.criado_em DESC`
    ).all(...parametros);

    return res.status(200).json({ sucesso: true, total: achados.length, achados });
  } catch (erro) {
    console.error('Erro ao listar achados:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao listar achados.' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const achado = db.prepare(
      `SELECT a.*, o.nome AS orgao_nome, u.nome AS criado_por_nome
       FROM achados a JOIN orgaos o ON o.id = a.orgao_id JOIN usuarios u ON u.id = a.criado_por_id
       WHERE a.id = ?`
    ).get(req.params.id);
    if (!achado) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    return res.status(200).json({ sucesso: true, achado });
  } catch (erro) {
    console.error('Erro ao buscar achado:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao buscar achado.' });
  }
});

router.put('/:id', (req, res) => {
  const { titulo, descricao, severidade, orgao_id, status } = req.body;
  if (!titulo || !descricao || !severidade || !orgao_id || !status) {
    return res.status(400).json({ sucesso: false, erro: 'Título, descrição, severidade, órgão e status são obrigatórios.' });
  }
  if (titulo.trim().length < 5) {
    return res.status(400).json({ sucesso: false, erro: 'O título deve ter pelo menos 5 caracteres.' });
  }
  if (!severidadeValida(severidade)) {
    return res.status(400).json({ sucesso: false, erro: `Severidade inválida. Opções: ${SEVERIDADES_VALIDAS.join(', ')}.` });
  }
  if (!statusValido(status)) {
    return res.status(400).json({ sucesso: false, erro: `Status inválido. Opções: ${STATUS_VALIDOS.join(', ')}.` });
  }
  try {
    const existente = db.prepare('SELECT id FROM achados WHERE id = ?').get(req.params.id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });

    const orgao = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(orgao_id);
    if (!orgao) return res.status(400).json({ sucesso: false, erro: 'Órgão informado não existe.' });

    db.prepare(
      `UPDATE achados SET titulo = ?, descricao = ?, severidade = ?, status = ?, orgao_id = ?, atualizado_em = datetime('now')
       WHERE id = ?`
    ).run(titulo.trim(), descricao.trim(), severidade, status, orgao_id, req.params.id);

    const achado = db.prepare(
      `SELECT a.*, o.nome AS orgao_nome, u.nome AS criado_por_nome
       FROM achados a JOIN orgaos o ON o.id = a.orgao_id JOIN usuarios u ON u.id = a.criado_por_id
       WHERE a.id = ?`
    ).get(req.params.id);

    return res.status(200).json({ sucesso: true, mensagem: 'Achado atualizado com sucesso!', achado });
  } catch (erro) {
    console.error('Erro ao atualizar achado:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao atualizar achado.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const existente = db.prepare('SELECT id FROM achados WHERE id = ?').get(req.params.id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    db.prepare('DELETE FROM achados WHERE id = ?').run(req.params.id);
    return res.status(200).json({ sucesso: true, mensagem: 'Achado excluído com sucesso!' });
  } catch (erro) {
    console.error('Erro ao excluir achado:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao excluir achado.' });
  }
});

module.exports = router;
