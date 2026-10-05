// routes/orgaos.js — CRUD de Orgaos (Sprint IV)
// Um Orgao possui varios Achados (relacao 1:N, igual ao exemplo
// "Professor x Disciplina" dado pelo professor).
const express = require('express');
const db = require('../db');
const autenticarToken = require('../middleware/auth');

const router = express.Router();
router.use(autenticarToken);

const TIPOS_VALIDOS = ['Prefeitura', 'Secretaria', 'Autarquia', 'Câmara Municipal', 'Fundação'];
function tipoValido(tipo) { return TIPOS_VALIDOS.includes(tipo); }

router.post('/', (req, res) => {
  const { nome, tipo } = req.body;
  if (!nome || !tipo) {
    return res.status(400).json({ sucesso: false, erro: 'Nome e tipo são obrigatórios.' });
  }
  if (nome.trim().length < 3) {
    return res.status(400).json({ sucesso: false, erro: 'O nome deve ter pelo menos 3 caracteres.' });
  }
  if (!tipoValido(tipo)) {
    return res.status(400).json({ sucesso: false, erro: `Tipo inválido. Opções: ${TIPOS_VALIDOS.join(', ')}.` });
  }
  try {
    const resultado = db.prepare('INSERT INTO orgaos (nome, tipo) VALUES (?, ?)').run(nome.trim(), tipo);
    const orgao = db.prepare('SELECT * FROM orgaos WHERE id = ?').get(resultado.lastInsertRowid);
    return res.status(201).json({ sucesso: true, mensagem: 'Órgão cadastrado com sucesso!', orgao });
  } catch (erro) {
    console.error('Erro ao criar órgão:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao cadastrar órgão.' });
  }
});

router.get('/', (req, res) => {
  try {
    const orgaos = db.prepare(
      `SELECT o.*, COUNT(a.id) AS total_achados
       FROM orgaos o LEFT JOIN achados a ON a.orgao_id = o.id
       GROUP BY o.id ORDER BY o.nome ASC`
    ).all();
    return res.status(200).json({ sucesso: true, orgaos });
  } catch (erro) {
    console.error('Erro ao listar órgãos:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao listar órgãos.' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const orgao = db.prepare('SELECT * FROM orgaos WHERE id = ?').get(req.params.id);
    if (!orgao) return res.status(404).json({ sucesso: false, erro: 'Órgão não encontrado.' });
    return res.status(200).json({ sucesso: true, orgao });
  } catch (erro) {
    console.error('Erro ao buscar órgão:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao buscar órgão.' });
  }
});

router.put('/:id', (req, res) => {
  const { nome, tipo } = req.body;
  if (!nome || !tipo) {
    return res.status(400).json({ sucesso: false, erro: 'Nome e tipo são obrigatórios.' });
  }
  if (nome.trim().length < 3) {
    return res.status(400).json({ sucesso: false, erro: 'O nome deve ter pelo menos 3 caracteres.' });
  }
  if (!tipoValido(tipo)) {
    return res.status(400).json({ sucesso: false, erro: `Tipo inválido. Opções: ${TIPOS_VALIDOS.join(', ')}.` });
  }
  try {
    const existente = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(req.params.id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Órgão não encontrado.' });
    db.prepare('UPDATE orgaos SET nome = ?, tipo = ? WHERE id = ?').run(nome.trim(), tipo, req.params.id);
    const orgao = db.prepare('SELECT * FROM orgaos WHERE id = ?').get(req.params.id);
    return res.status(200).json({ sucesso: true, mensagem: 'Órgão atualizado com sucesso!', orgao });
  } catch (erro) {
    console.error('Erro ao atualizar órgão:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao atualizar órgão.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const existente = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(req.params.id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Órgão não encontrado.' });
    const vinculados = db.prepare('SELECT COUNT(*) AS total FROM achados WHERE orgao_id = ?').get(req.params.id);
    if (vinculados.total > 0) {
      return res.status(409).json({
        sucesso: false,
        erro: `Não é possível excluir: existem ${vinculados.total} achado(s) vinculado(s) a este órgão.`,
      });
    }
    db.prepare('DELETE FROM orgaos WHERE id = ?').run(req.params.id);
    return res.status(200).json({ sucesso: true, mensagem: 'Órgão excluído com sucesso!' });
  } catch (erro) {
    console.error('Erro ao excluir órgão:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao excluir órgão.' });
  }
});

module.exports = router;
