// routes/orgaos.js — CRUD de Orgaos (Sprint IV)
// Um Orgao possui varios Achados (relacao 1:N, igual ao exemplo
// "Professor x Disciplina" dado pelo professor).
const express = require('express');
const db = require('../db');
const autenticarToken = require('../middleware/auth');
const { exigirAdmin } = autenticarToken;
const { tratarErro } = require('../middleware/erros');
const v = require('../services/validacao');

const router = express.Router();
router.use(autenticarToken);

// Criar, editar e excluir órgãos: somente administradores (leitura liberada para qualquer usuário autenticado)
router.post('/', exigirAdmin, (req, res) => {
  try {
    const corpo = v.corpoJson(req);
    v.exigir(corpo, ['nome', 'tipo'], 'Nome e tipo são obrigatórios.');
    const { nome, tipo } = v.validarOrgao(corpo);
    const resultado = db.prepare('INSERT INTO orgaos (nome, tipo) VALUES (?, ?)').run(nome, tipo);
    const orgao = db.prepare('SELECT * FROM orgaos WHERE id = ?').get(resultado.lastInsertRowid);
    return res.status(201).json({ sucesso: true, mensagem: 'Órgão cadastrado com sucesso!', orgao });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao criar órgão', 'Erro interno ao cadastrar órgão.');
  }
});

router.get('/', (req, res) => {
  try {
    const orgaos = db.prepare(
      `SELECT o.*, COUNT(a.id) AS total_achados
       FROM orgaos o LEFT JOIN achados a ON a.orgao_id = o.id AND a.excluido_em IS NULL
       GROUP BY o.id ORDER BY o.nome ASC`
    ).all();
    return res.status(200).json({ sucesso: true, orgaos });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao listar órgãos', 'Erro interno ao listar órgãos.');
  }
});

router.get('/:id', (req, res) => {
  try {
    const id = v.idParam(req.params.id);
    const orgao = db.prepare('SELECT * FROM orgaos WHERE id = ?').get(id);
    if (!orgao) return res.status(404).json({ sucesso: false, erro: 'Órgão não encontrado.' });
    return res.status(200).json({ sucesso: true, orgao });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao buscar órgão', 'Erro interno ao buscar órgão.');
  }
});

router.put('/:id', exigirAdmin, (req, res) => {
  try {
    const id = v.idParam(req.params.id);
    const corpo = v.corpoJson(req);
    v.exigir(corpo, ['nome', 'tipo'], 'Nome e tipo são obrigatórios.');
    const { nome, tipo } = v.validarOrgao(corpo);
    const existente = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Órgão não encontrado.' });
    db.prepare('UPDATE orgaos SET nome = ?, tipo = ? WHERE id = ?').run(nome, tipo, id);
    const orgao = db.prepare('SELECT * FROM orgaos WHERE id = ?').get(id);
    return res.status(200).json({ sucesso: true, mensagem: 'Órgão atualizado com sucesso!', orgao });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao atualizar órgão', 'Erro interno ao atualizar órgão.');
  }
});

router.delete('/:id', exigirAdmin, (req, res) => {
  try {
    const id = v.idParam(req.params.id);
    const existente = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Órgão não encontrado.' });
    const vinculados = db.prepare(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN excluido_em IS NULL THEN 1 ELSE 0 END) AS ativos FROM achados WHERE orgao_id = ?'
    ).get(id);
    if (vinculados.ativos > 0) {
      return res.status(409).json({
        sucesso: false,
        erro: `Não é possível excluir: existem ${vinculados.ativos} achado(s) vinculado(s) a este órgão.`,
      });
    }
    // Achados excluídos logicamente continuam no banco (histórico) e ainda referenciam o órgão
    if (vinculados.total > 0) {
      return res.status(409).json({
        sucesso: false,
        erro: 'Não é possível excluir: o órgão possui achados excluídos preservados para histórico.',
      });
    }
    db.prepare('DELETE FROM orgaos WHERE id = ?').run(id);
    return res.status(200).json({ sucesso: true, mensagem: 'Órgão excluído com sucesso!' });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao excluir órgão', 'Erro interno ao excluir órgão.');
  }
});

module.exports = router;
