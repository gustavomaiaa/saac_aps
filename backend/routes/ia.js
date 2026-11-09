// routes/ia.js — recursos de IA local (Ollama): recomendação, análise de padrões, status e métricas
const express = require('express');
const db = require('../db');
const autenticarToken = require('../middleware/auth');
const ia = require('../services/ia');

const router = express.Router();
router.use(autenticarToken);

const SEVERIDADES_VALIDAS = ['Crítico', 'Alto', 'Médio', 'Baixo'];

// Responde erros de IA com o status HTTP correto (503/504/502); qualquer outro vira 500
function responderErro(res, erro, contexto) {
  if (erro instanceof ia.ErroIA) {
    return res.status(erro.status).json({ sucesso: false, erro: erro.message });
  }
  console.error(`Erro em ${contexto}:`, erro);
  return res.status(500).json({ sucesso: false, erro: 'Erro interno ao usar a IA local.' });
}

function registrarUso({ usuarioId, tipo, achadoId, modelo, tempoMs }) {
  const r = db.prepare(
    'INSERT INTO ia_uso (usuario_id, tipo, achado_id, modelo, tempo_ms) VALUES (?, ?, ?, ?, ?)'
  ).run(usuarioId, tipo, achadoId || null, modelo, tempoMs);
  return Number(r.lastInsertRowid);
}

router.get('/status', async (req, res) => {
  const estado = await ia.status();
  return res.status(200).json({ sucesso: true, ...estado });
});

// Recurso 1 — recomendação automática para um achado
router.post('/recomendacao', async (req, res) => {
  const { titulo, descricao, severidade, orgao_nome, orgao_tipo, achado_id } = req.body || {};
  if (!titulo || !descricao || !severidade || !orgao_nome) {
    return res.status(400).json({ sucesso: false, erro: 'Título, descrição, severidade e órgão (nome e tipo) são obrigatórios.' });
  }
  if (!SEVERIDADES_VALIDAS.includes(severidade)) {
    return res.status(400).json({ sucesso: false, erro: `Severidade inválida. Opções: ${SEVERIDADES_VALIDAS.join(', ')}.` });
  }
  if (String(titulo).length > 200 || String(descricao).length > 4000) {
    return res.status(400).json({ sucesso: false, erro: 'Texto muito longo para a IA (título até 200 e descrição até 4000 caracteres).' });
  }

  // Exatamente os campos que serao enviados ao modelo
  const base_utilizada = {
    titulo: String(titulo).trim(),
    descricao: String(descricao).trim(),
    severidade,
    orgao_nome: String(orgao_nome).trim(),
    orgao_tipo: orgao_tipo ? String(orgao_tipo).trim() : null,
  };

  try {
    const r = await ia.gerar(ia.promptRecomendacao(base_utilizada));
    const idAchado = Number.isInteger(Number(achado_id)) && Number(achado_id) > 0
      && db.prepare('SELECT id FROM achados WHERE id = ?').get(Number(achado_id)) ? Number(achado_id) : null;
    const usoId = registrarUso({ usuarioId: req.usuario.id, tipo: 'recomendacao', achadoId: idAchado, modelo: r.modelo, tempoMs: r.tempo_ms });
    return res.status(200).json({
      sucesso: true, recomendacao: r.texto, modelo: r.modelo, tempo_ms: r.tempo_ms, base_utilizada, uso_id: usoId,
    });
  } catch (erro) {
    return responderErro(res, erro, 'recomendação');
  }
});

// Estatísticas calculadas por SQL (sem IA) — são elas que vão para o modelo
function calcularEstatisticas() {
  const mapa = (linhas) => Object.fromEntries(linhas.map((l) => [l.chave, l.total]));
  const total = db.prepare('SELECT COUNT(*) AS total FROM vw_achados_detalhados').get().total;
  return {
    total_achados: total,
    por_severidade: mapa(db.prepare(
      'SELECT severidade AS chave, COUNT(*) AS total FROM vw_achados_detalhados GROUP BY severidade ORDER BY total DESC').all()),
    por_tipo_orgao: mapa(db.prepare(
      'SELECT orgao_tipo AS chave, COUNT(*) AS total FROM vw_achados_detalhados GROUP BY orgao_tipo ORDER BY total DESC').all()),
    orgaos_reincidentes: db.prepare(
      `SELECT nome, tipo, total_achados AS total FROM vw_resumo_orgaos
       WHERE total_achados >= 3 ORDER BY total_achados DESC, nome ASC`).all(),
    por_mes: mapa(db.prepare(
      `SELECT strftime('%Y-%m', criado_em) AS chave, COUNT(*) AS total
       FROM vw_achados_detalhados GROUP BY chave ORDER BY chave ASC`).all()),
  };
}

// Recurso 2 — análise de padrões
router.get('/padroes', async (req, res) => {
  try {
    const estatisticas = calcularEstatisticas();
    if (estatisticas.total_achados === 0) {
      return res.status(400).json({ sucesso: false, erro: 'Não há achados cadastrados para analisar.' });
    }
    const r = await ia.gerar(ia.promptPadroes(estatisticas));
    const usoId = registrarUso({ usuarioId: req.usuario.id, tipo: 'padroes', modelo: r.modelo, tempoMs: r.tempo_ms });
    return res.status(200).json({
      sucesso: true, estatisticas, analise: r.texto, modelo: r.modelo, tempo_ms: r.tempo_ms, uso_id: usoId,
    });
  } catch (erro) {
    return responderErro(res, erro, 'análise de padrões');
  }
});

// O frontend informa se o auditor aceitou ou descartou a sugestão
router.post('/uso/:id/resultado', (req, res) => {
  const { resultado } = req.body || {};
  if (!['aceita', 'descartada'].includes(resultado)) {
    return res.status(400).json({ sucesso: false, erro: "Resultado inválido. Opções: 'aceita' ou 'descartada'." });
  }
  try {
    const uso = db.prepare('SELECT id, usuario_id FROM ia_uso WHERE id = ?').get(req.params.id);
    if (!uso) return res.status(404).json({ sucesso: false, erro: 'Registro de uso da IA não encontrado.' });
    if (uso.usuario_id !== req.usuario.id) {
      return res.status(403).json({ sucesso: false, erro: 'Você só pode registrar o resultado de sugestões geradas por você.' });
    }
    db.prepare('UPDATE ia_uso SET resultado = ? WHERE id = ?').run(resultado, uso.id);
    return res.status(200).json({ sucesso: true, mensagem: 'Resultado registrado.' });
  } catch (erro) {
    console.error('Erro ao registrar resultado da IA:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao registrar o resultado.' });
  }
});

router.get('/metricas', (req, res) => {
  try {
    const m = db.prepare(
      `SELECT COUNT(*) AS total_usos,
              COALESCE(ROUND(AVG(tempo_ms)), 0) AS tempo_medio_ms,
              COALESCE(SUM(resultado = 'aceita'), 0) AS aceitas,
              COALESCE(SUM(resultado = 'descartada'), 0) AS descartadas,
              COALESCE(SUM(resultado = 'pendente'), 0) AS pendentes
       FROM ia_uso`
    ).get();
    const decididas = m.aceitas + m.descartadas;
    return res.status(200).json({
      sucesso: true,
      total_usos: m.total_usos,
      tempo_medio_ms: m.tempo_medio_ms,
      aceitas: m.aceitas,
      descartadas: m.descartadas,
      pendentes: m.pendentes,
      // taxa sobre as sugestões em que o auditor decidiu (aceitou ou descartou); null se ainda nao ha decisoes
      taxa_aceitacao: decididas > 0 ? Math.round((m.aceitas / decididas) * 100) : null,
    });
  } catch (erro) {
    console.error('Erro ao calcular métricas da IA:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao calcular as métricas.' });
  }
});

module.exports = router;
