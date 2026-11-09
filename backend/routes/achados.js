// routes/achados.js — CRUD de Achados (Sprint IV)
// Cada Achado pertence a um Orgao (FK orgao_id) e registra quem o criou.
const express = require('express');
const db = require('../db');
const autenticarToken = require('../middleware/auth');
const { Achado, persistencia } = require('../memento/achado');

const router = express.Router();
router.use(autenticarToken);

const SEVERIDADES_VALIDAS = ['Crítico', 'Alto', 'Médio', 'Baixo'];
const STATUS_VALIDOS = ['Em aberto', 'Em análise', 'Implementado', 'Rejeitado'];
function severidadeValida(s) { return SEVERIDADES_VALIDAS.includes(s); }
function statusValido(s) { return STATUS_VALIDOS.includes(s); }
const MAX_RECOMENDACAO = 2000;

// Grava no banco o estado (campos editaveis) de um achado
function gravarEstado(id, estado) {
  db.prepare(
    `UPDATE achados SET titulo = ?, descricao = ?, severidade = ?, status = ?, orgao_id = ?, recomendacao = ?,
       atualizado_em = datetime('now') WHERE id = ?`
  ).run(estado.titulo, estado.descricao, estado.severidade, estado.status, estado.orgao_id, estado.recomendacao, id);
}
// Texto vazio vira NULL; devolve undefined se o campo nao foi enviado
function normalizarRecomendacao(valor) {
  if (valor === undefined) return undefined;
  const texto = valor === null ? '' : String(valor).trim();
  return texto || null;
}

router.post('/', (req, res) => {
  const { titulo, descricao, severidade, orgao_id, status } = req.body;
  const recomendacao = normalizarRecomendacao(req.body.recomendacao);
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
  if (recomendacao && recomendacao.length > MAX_RECOMENDACAO) {
    return res.status(400).json({ sucesso: false, erro: `A recomendação deve ter no máximo ${MAX_RECOMENDACAO} caracteres.` });
  }
  try {
    const orgao = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(orgao_id);
    if (!orgao) return res.status(400).json({ sucesso: false, erro: 'Órgão informado não existe.' });

    const resultado = db.prepare(
      `INSERT INTO achados (titulo, descricao, severidade, status, orgao_id, criado_por_id, recomendacao)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(titulo.trim(), descricao.trim(), severidade, status || 'Em aberto', orgao_id, req.usuario.id, recomendacao ?? null);

    const achado = db.prepare('SELECT * FROM vw_achados_detalhados WHERE id = ?').get(resultado.lastInsertRowid);

    return res.status(201).json({ sucesso: true, mensagem: 'Achado cadastrado com sucesso!', achado });
  } catch (erro) {
    console.error('Erro ao criar achado:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao cadastrar achado.' });
  }
});

// Monta o WHERE a partir dos filtros da query string (usado na listagem e, depois, no CSV)
function montarFiltros(query) {
  const condicoes = [];
  const parametros = [];
  if (query.orgao_id) { condicoes.push('orgao_id = ?'); parametros.push(query.orgao_id); }
  if (query.status) { condicoes.push('status = ?'); parametros.push(query.status); }
  if (query.severidade) { condicoes.push('severidade = ?'); parametros.push(query.severidade); }
  if (query.q && String(query.q).trim()) {
    // escapa % e _ para que sejam buscados literalmente
    const termo = '%' + String(query.q).trim().replace(/[\\%_]/g, '\\$&') + '%';
    condicoes.push("(titulo LIKE ? ESCAPE '\\' OR descricao LIKE ? ESCAPE '\\')");
    parametros.push(termo, termo);
  }
  return { whereSql: condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '', parametros };
}

router.get('/', (req, res) => {
  try {
    const { whereSql, parametros } = montarFiltros(req.query);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 10));
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM vw_achados_detalhados ${whereSql}`).get(...parametros);
    const paginas = Math.max(1, Math.ceil(total / limite));
    const pagina = Math.min(paginas, Math.max(1, parseInt(req.query.pagina, 10) || 1));

    const dados = db.prepare(
      `SELECT * FROM vw_achados_detalhados ${whereSql}
       ORDER BY criado_em DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...parametros, limite, (pagina - 1) * limite);

    return res.status(200).json({ sucesso: true, dados, total, pagina, paginas });
  } catch (erro) {
    console.error('Erro ao listar achados:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao listar achados.' });
  }
});

// Escapa uma célula de CSV (separador ';'). Também neutraliza "injeção de fórmula" do Excel (=, +, -, @).
function celulaCsv(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// Exportação CSV (UTF-8 com BOM, separador ';'), respeitando os mesmos filtros da listagem
// IMPORTANTE: declarada antes de '/:id' para não ser confundida com um id.
router.get('/exportar.csv', (req, res) => {
  try {
    const { whereSql, parametros } = montarFiltros(req.query);
    const achados = db.prepare(
      `SELECT * FROM vw_achados_detalhados ${whereSql} ORDER BY criado_em DESC, id DESC`
    ).all(...parametros);

    const cabecalho = ['ID', 'Título', 'Descrição', 'Severidade', 'Status', 'Recomendação', 'Órgão', 'Criado por', 'Criado em'];
    const linhas = achados.map((a) => [
      a.id, a.titulo, a.descricao, a.severidade, a.status, a.recomendacao, a.orgao_nome, a.criado_por_nome, a.criado_em,
    ].map(celulaCsv).join(';'));
    const csv = '﻿' + [cabecalho.join(';'), ...linhas].join('\r\n') + '\r\n';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="achados.csv"');
    return res.status(200).send(csv);
  } catch (erro) {
    console.error('Erro ao exportar CSV:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao exportar o CSV.' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const achado = db.prepare('SELECT * FROM vw_achados_detalhados WHERE id = ?').get(req.params.id);
    if (!achado) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    return res.status(200).json({ sucesso: true, achado });
  } catch (erro) {
    console.error('Erro ao buscar achado:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao buscar achado.' });
  }
});

router.put('/:id', (req, res) => {
  const { titulo, descricao, severidade, orgao_id, status } = req.body;
  const recomendacao = normalizarRecomendacao(req.body.recomendacao);
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
  if (recomendacao && recomendacao.length > MAX_RECOMENDACAO) {
    return res.status(400).json({ sucesso: false, erro: `A recomendação deve ter no máximo ${MAX_RECOMENDACAO} caracteres.` });
  }
  try {
    const existente = db.prepare('SELECT * FROM achados WHERE id = ? AND excluido_em IS NULL').get(req.params.id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });

    const orgao = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(orgao_id);
    if (!orgao) return res.status(400).json({ sucesso: false, erro: 'Órgão informado não existe.' });

    // Memento: guarda um snapshot do estado atual ANTES de atualizar (permite desfazer)
    const originador = new Achado(existente);
    const historico = persistencia.carregar(db, existente.id, originador);
    db.exec('BEGIN');
    try {
      const memento = historico.registrar(`Antes da edição por ${req.usuario.nome}`);
      persistencia.gravar(db, existente.id, req.usuario.id, memento);
      originador.editar({
        titulo: titulo.trim(), descricao: descricao.trim(), severidade, status, orgao_id,
        recomendacao: recomendacao === undefined ? existente.recomendacao : recomendacao,
      });
      gravarEstado(existente.id, originador.resumo());
      db.exec('COMMIT');
    } catch (erroTransacao) {
      db.exec('ROLLBACK');
      throw erroTransacao;
    }

    const achado = db.prepare('SELECT * FROM vw_achados_detalhados WHERE id = ?').get(req.params.id);

    return res.status(200).json({ sucesso: true, mensagem: 'Achado atualizado com sucesso!', achado });
  } catch (erro) {
    console.error('Erro ao atualizar achado:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao atualizar achado.' });
  }
});

// Histórico de edições (somente rótulo e data — o estado salvo nunca é exposto)
router.get('/:id/historico', (req, res) => {
  try {
    const existente = db.prepare('SELECT * FROM achados WHERE id = ? AND excluido_em IS NULL').get(req.params.id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    const historico = persistencia.carregar(db, existente.id, new Achado(existente));
    const itens = historico.listar().reverse().map((m) => ({ rotulo: m.rotulo, criado_em: m.criadoEm }));
    return res.status(200).json({ sucesso: true, total: itens.length, historico: itens });
  } catch (erro) {
    console.error('Erro ao listar histórico:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao listar o histórico.' });
  }
});

// Desfaz a última edição: restaura o último snapshot e grava no banco
router.post('/:id/desfazer', (req, res) => {
  try {
    const existente = db.prepare('SELECT * FROM achados WHERE id = ? AND excluido_em IS NULL').get(req.params.id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });

    const originador = new Achado(existente);
    const historico = persistencia.carregar(db, existente.id, originador);
    if (historico.listar().length === 0) {
      return res.status(409).json({ sucesso: false, erro: 'Nada a desfazer.' });
    }

    db.exec('BEGIN');
    try {
      historico.desfazer();
      persistencia.removerUltimo(db, existente.id);
      gravarEstado(existente.id, originador.resumo());
      db.exec('COMMIT');
    } catch (erroTransacao) {
      db.exec('ROLLBACK');
      throw erroTransacao;
    }

    const achado = db.prepare('SELECT * FROM vw_achados_detalhados WHERE id = ?').get(existente.id);
    return res.status(200).json({ sucesso: true, mensagem: 'Última edição desfeita com sucesso!', achado });
  } catch (erro) {
    console.error('Erro ao desfazer edição:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao desfazer a edição.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const existente = db.prepare('SELECT id FROM achados WHERE id = ? AND excluido_em IS NULL').get(req.params.id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    // Exclusão lógica: o registro é preservado, apenas marcado como excluído
    db.prepare("UPDATE achados SET excluido_em = datetime('now') WHERE id = ?").run(req.params.id);
    return res.status(200).json({ sucesso: true, mensagem: 'Achado excluído com sucesso!' });
  } catch (erro) {
    console.error('Erro ao excluir achado:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao excluir achado.' });
  }
});

module.exports = router;
