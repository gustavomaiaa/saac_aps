// routes/achados.js — CRUD de Achados (Sprint IV)
// Cada Achado pertence a um Orgao (FK orgao_id) e registra quem o criou.
const express = require('express');
const db = require('../db');
const autenticarToken = require('../middleware/auth');
const { tratarErro } = require('../middleware/erros');
const { Achado, persistencia } = require('../memento/achado');
const auditoria = require('../services/auditoria');
const semelhantes = require('../services/semelhantes');
const v = require('../services/validacao');

const router = express.Router();
router.use(autenticarToken);

// Regra: so o criador do achado ou um administrador pode editar, excluir e desfazer
function podeModificar(req, achado) {
  return req.usuario.perfil === 'admin' || achado.criado_por_id === req.usuario.id;
}
function negarPermissao(res, acao) {
  return res.status(403).json({
    sucesso: false,
    erro: `Você não tem permissão para ${acao}. Apenas o criador do achado ou um administrador pode fazê-lo.`,
  });
}

// Grava no banco o estado (campos editaveis) de um achado
function gravarEstado(id, estado) {
  db.prepare(
    `UPDATE achados SET titulo = ?, descricao = ?, severidade = ?, status = ?, orgao_id = ?, recomendacao = ?,
       atualizado_em = datetime('now') WHERE id = ?`
  ).run(estado.titulo, estado.descricao, estado.severidade, estado.status, estado.orgao_id, estado.recomendacao, id);
}

router.post('/', (req, res) => {
  try {
    const corpo = v.corpoJson(req);
    v.exigir(corpo, ['titulo', 'descricao', 'severidade', 'orgao_id'], 'Título, descrição, severidade e órgão são obrigatórios.');
    const dados = v.validarAchado(corpo, { statusObrigatorio: false });

    const orgao = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(dados.orgao_id);
    if (!orgao) return res.status(400).json({ sucesso: false, erro: 'Órgão informado não existe.' });

    const resultado = db.prepare(
      `INSERT INTO achados (titulo, descricao, severidade, status, orgao_id, criado_por_id, recomendacao)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(dados.titulo, dados.descricao, dados.severidade, dados.status, dados.orgao_id, req.usuario.id, dados.recomendacao ?? null);

    const achado = db.prepare('SELECT * FROM vw_achados_detalhados WHERE id = ?').get(resultado.lastInsertRowid);
    auditoria.registrar({ usuarioId: req.usuario.id, acao: 'criar', entidadeId: achado.id, depois: auditoria.estadoAchado(achado) });
    semelhantes.atualizarEmbeddingEmSegundoPlano(achado.id); // não bloqueia nem falha se a IA estiver fora

    return res.status(201).json({ sucesso: true, mensagem: 'Achado cadastrado com sucesso!', achado });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao criar achado', 'Erro interno ao cadastrar achado.');
  }
});

// Monta o WHERE a partir dos filtros (já validados) da query string (usado na listagem e no CSV)
function montarFiltros(query) {
  const f = v.filtrosAchados(query);
  const condicoes = [];
  const parametros = [];
  if (f.orgao_id !== undefined) { condicoes.push('orgao_id = ?'); parametros.push(f.orgao_id); }
  if (f.status !== undefined) { condicoes.push('status = ?'); parametros.push(f.status); }
  if (f.severidade !== undefined) { condicoes.push('severidade = ?'); parametros.push(f.severidade); }
  if (f.q !== undefined) {
    // escapa % e _ para que sejam buscados literalmente
    const termo = '%' + f.q.replace(/[\\%_]/g, '\\$&') + '%';
    condicoes.push("(titulo LIKE ? ESCAPE '\\' OR descricao LIKE ? ESCAPE '\\')");
    parametros.push(termo, termo);
  }
  return { whereSql: condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '', parametros };
}

router.get('/', (req, res) => {
  try {
    const { whereSql, parametros } = montarFiltros(req.query);
    const { pagina: paginaPedida, limite } = v.paginacao(req.query);
    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM vw_achados_detalhados ${whereSql}`).get(...parametros);
    const paginas = Math.max(1, Math.ceil(total / limite));
    const pagina = Math.min(paginas, paginaPedida);

    const dados = db.prepare(
      `SELECT * FROM vw_achados_detalhados ${whereSql}
       ORDER BY criado_em DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...parametros, limite, (pagina - 1) * limite);

    return res.status(200).json({ sucesso: true, dados, total, pagina, paginas });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao listar achados', 'Erro interno ao listar achados.');
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
    return tratarErro(res, erro, 'Erro ao exportar CSV', 'Erro interno ao exportar o CSV.');
  }
});

router.get('/:id', (req, res) => {
  try {
    const id = v.idParam(req.params.id);
    const achado = db.prepare('SELECT * FROM vw_achados_detalhados WHERE id = ?').get(id);
    if (!achado) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    return res.status(200).json({ sucesso: true, achado });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao buscar achado', 'Erro interno ao buscar achado.');
  }
});

router.put('/:id', (req, res) => {
  try {
    const id = v.idParam(req.params.id);
    const corpo = v.corpoJson(req);
    v.exigir(corpo, ['titulo', 'descricao', 'severidade', 'orgao_id', 'status'], 'Título, descrição, severidade, órgão e status são obrigatórios.');
    const dados = v.validarAchado(corpo, { statusObrigatorio: true });

    const existente = db.prepare('SELECT * FROM achados WHERE id = ? AND excluido_em IS NULL').get(id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    if (!podeModificar(req, existente)) return negarPermissao(res, 'editar este achado');

    const orgao = db.prepare('SELECT id FROM orgaos WHERE id = ?').get(dados.orgao_id);
    if (!orgao) return res.status(400).json({ sucesso: false, erro: 'Órgão informado não existe.' });

    // Memento: guarda um snapshot do estado atual ANTES de atualizar (permite desfazer)
    const originador = new Achado(existente);
    const historico = persistencia.carregar(db, existente.id, originador);
    db.exec('BEGIN');
    try {
      const memento = historico.registrar(`Antes da edição por ${req.usuario.nome}`);
      persistencia.gravar(db, existente.id, req.usuario.id, memento);
      originador.editar({
        titulo: dados.titulo, descricao: dados.descricao, severidade: dados.severidade, status: dados.status, orgao_id: dados.orgao_id,
        recomendacao: dados.recomendacao === undefined ? existente.recomendacao : dados.recomendacao,
      });
      gravarEstado(existente.id, originador.resumo());
      auditoria.registrar({ usuarioId: req.usuario.id, acao: 'editar', entidadeId: existente.id, antes: auditoria.estadoAchado(existente), depois: auditoria.estadoAchado(originador.resumo()) });
      db.exec('COMMIT');
    } catch (erroTransacao) {
      db.exec('ROLLBACK');
      throw erroTransacao;
    }

    const achado = db.prepare('SELECT * FROM vw_achados_detalhados WHERE id = ?').get(id);
    semelhantes.removerEmbedding(existente.id); // texto mudou: o vetor antigo ficou obsoleto
    semelhantes.atualizarEmbeddingEmSegundoPlano(existente.id);

    return res.status(200).json({ sucesso: true, mensagem: 'Achado atualizado com sucesso!', achado });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao atualizar achado', 'Erro interno ao atualizar achado.');
  }
});

// Trilha de auditoria do achado: quem fez o quê e quando (inclui achados já excluídos)
router.get('/:id/auditoria', (req, res) => {
  try {
    const id = v.idParam(req.params.id);
    const registros = auditoria.listar('achado', id);
    if (registros.length === 0 && !db.prepare('SELECT id FROM achados WHERE id = ?').get(id)) {
      return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    }
    return res.status(200).json({ sucesso: true, total: registros.length, auditoria: registros });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao listar auditoria', 'Erro interno ao listar a auditoria.');
  }
});

// Histórico de edições (somente rótulo e data — o estado salvo nunca é exposto)
router.get('/:id/historico', (req, res) => {
  try {
    const id = v.idParam(req.params.id);
    const existente = db.prepare('SELECT * FROM achados WHERE id = ? AND excluido_em IS NULL').get(id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    const historico = persistencia.carregar(db, existente.id, new Achado(existente));
    const itens = historico.listar().reverse().map((m) => ({ rotulo: m.rotulo, criado_em: m.criadoEm }));
    return res.status(200).json({ sucesso: true, total: itens.length, historico: itens });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao listar histórico', 'Erro interno ao listar o histórico.');
  }
});

// Desfaz a última edição: restaura o último snapshot e grava no banco
router.post('/:id/desfazer', (req, res) => {
  try {
    const id = v.idParam(req.params.id);
    const existente = db.prepare('SELECT * FROM achados WHERE id = ? AND excluido_em IS NULL').get(id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    if (!podeModificar(req, existente)) return negarPermissao(res, 'desfazer edições deste achado');

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
      auditoria.registrar({ usuarioId: req.usuario.id, acao: 'restaurar', entidadeId: existente.id, antes: auditoria.estadoAchado(existente), depois: auditoria.estadoAchado(originador.resumo()) });
      db.exec('COMMIT');
    } catch (erroTransacao) {
      db.exec('ROLLBACK');
      throw erroTransacao;
    }

    const achado = db.prepare('SELECT * FROM vw_achados_detalhados WHERE id = ?').get(existente.id);
    semelhantes.removerEmbedding(existente.id); // texto mudou: o vetor antigo ficou obsoleto
    semelhantes.atualizarEmbeddingEmSegundoPlano(existente.id);
    return res.status(200).json({ sucesso: true, mensagem: 'Última edição desfeita com sucesso!', achado });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao desfazer edição', 'Erro interno ao desfazer a edição.');
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = v.idParam(req.params.id);
    const existente = db.prepare('SELECT * FROM achados WHERE id = ? AND excluido_em IS NULL').get(id);
    if (!existente) return res.status(404).json({ sucesso: false, erro: 'Achado não encontrado.' });
    if (!podeModificar(req, existente)) return negarPermissao(res, 'excluir este achado');
    // Exclusão lógica: o registro é preservado, apenas marcado como excluído
    db.prepare("UPDATE achados SET excluido_em = datetime('now') WHERE id = ?").run(id);
    auditoria.registrar({ usuarioId: req.usuario.id, acao: 'excluir', entidadeId: existente.id, antes: auditoria.estadoAchado(existente), depois: { excluido: true } });
    semelhantes.removerEmbedding(existente.id);
    return res.status(200).json({ sucesso: true, mensagem: 'Achado excluído com sucesso!' });
  } catch (erro) {
    return tratarErro(res, erro, 'Erro ao excluir achado', 'Erro interno ao excluir achado.');
  }
});

module.exports = router;
