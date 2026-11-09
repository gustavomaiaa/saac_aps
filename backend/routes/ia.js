// routes/ia.js — recursos de IA local (Ollama): recomendação, análise de padrões, status e métricas
const express = require('express');
const db = require('../db');
const autenticarToken = require('../middleware/auth');
const ia = require('../services/ia');
const padroes = require('../services/padroes');
const semelhantes = require('../services/semelhantes');

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

// --- Severidade sugerida ---

// Extrai {severidade, justificativa} do texto do modelo com parse seguro; null se inválido
function interpretarSeveridade(texto, textoDoAchado) {
  let obj = null;
  try { obj = JSON.parse(texto); } catch (e) {
    const trecho = texto.match(/\{[\s\S]*\}/);
    if (trecho) { try { obj = JSON.parse(trecho[0]); } catch (e2) { obj = null; } }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const severidade = typeof obj.severidade === 'string' ? obj.severidade.trim() : '';
  if (!SEVERIDADES_VALIDAS.includes(severidade)) return null;

  // Justificativa: no máximo 2 frases, sem leis/artigos e sem números ausentes do texto do achado
  let justificativa = typeof obj.justificativa === 'string' ? obj.justificativa.trim() : '';
  justificativa = justificativa.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  const citaReferencia = /\b(leis?|artigos?|art\.|decretos?|incisos?|parágrafos?|normas?|resoluç(ão|ões)|portarias?)\b|§/i.test(justificativa);
  const permitidos = new Set(padroes.numeros(textoDoAchado));
  const numeroInventado = padroes.numeros(justificativa).some((n) => !permitidos.has(n));
  if (citaReferencia || numeroInventado) {
    justificativa = 'Justificativa omitida: o modelo citou referências ou números ausentes do texto do achado.';
  } else if (!justificativa) {
    justificativa = 'O modelo não apresentou justificativa.';
  }
  return { severidade, justificativa };
}

router.post('/severidade', async (req, res) => {
  const { titulo, descricao } = req.body || {};
  if (!titulo || !descricao || typeof titulo !== 'string' || typeof descricao !== 'string') {
    return res.status(400).json({ sucesso: false, erro: 'Título e descrição são obrigatórios.' });
  }
  if (titulo.length > 200 || descricao.length > 4000) {
    return res.status(400).json({ sucesso: false, erro: 'Texto muito longo para a IA (título até 200 e descrição até 4000 caracteres).' });
  }
  const base_utilizada = { titulo: titulo.trim(), descricao: descricao.trim() };
  try {
    const r = await ia.gerar(ia.promptSeveridade(base_utilizada.titulo, base_utilizada.descricao),
      { temperature: 0.2, num_predict: 200, json: true });
    const resultado = interpretarSeveridade(r.texto, `${base_utilizada.titulo} ${base_utilizada.descricao}`);
    if (!resultado) {
      return res.status(502).json({
        sucesso: false,
        erro: `A IA devolveu uma severidade inválida (esperado: ${SEVERIDADES_VALIDAS.join(', ')}). Escolha a severidade manualmente.`,
      });
    }
    const usoId = registrarUso({ usuarioId: req.usuario.id, tipo: 'severidade', modelo: r.modelo, tempoMs: r.tempo_ms });
    return res.status(200).json({
      sucesso: true, ...resultado, modelo: r.modelo, tempo_ms: r.tempo_ms, base_utilizada, uso_id: usoId,
    });
  } catch (erro) {
    return responderErro(res, erro, 'severidade sugerida');
  }
});

// --- Achados semelhantes (embeddings + cosseno) ---
router.get('/semelhantes', async (req, res) => {
  const { titulo, descricao, orgao_id, excluir_id } = req.query;
  if (!titulo || !descricao) {
    return res.status(400).json({ sucesso: false, erro: 'Título e descrição são obrigatórios.' });
  }
  if (String(titulo).length > 200 || String(descricao).length > 4000) {
    return res.status(400).json({ sucesso: false, erro: 'Texto muito longo para a IA (título até 200 e descrição até 4000 caracteres).' });
  }
  try {
    const r = await semelhantes.buscarSemelhantes(titulo, descricao, { orgaoId: orgao_id, excluirId: excluir_id });
    return res.status(200).json({ sucesso: true, modelo: ia.modeloEmbedding(), ...r });
  } catch (erro) {
    return responderErro(res, erro, 'achados semelhantes');
  }
});

// Estatísticas calculadas por SQL (sem IA) — são elas que vão para o modelo
function calcularEstatisticas() {
  const mapa = (linhas) => Object.fromEntries(linhas.map((l) => [l.chave, l.total]));
  const total = db.prepare('SELECT COUNT(*) AS total FROM vw_achados_detalhados').get().total;
  return {
    total_achados: total,
    em_aberto: db.prepare("SELECT COUNT(*) AS total FROM vw_achados_detalhados WHERE status = 'Em aberto'").get().total,
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
    // Os fatos (comparações, rankings, percentuais) são calculados aqui, não pelo modelo
    const { fatos, meta } = padroes.montarFatosEMeta(estatisticas);
    const r = await ia.gerar(ia.promptPadroes(fatos), { temperature: 0.2, num_predict: 400 });
    // A resposta só é aceita se citar números presentes nos fatos
    const validacao = padroes.validarAnalise(r.texto, fatos, meta);
    const usoId = registrarUso({ usuarioId: req.usuario.id, tipo: 'padroes', modelo: r.modelo, tempoMs: r.tempo_ms });
    return res.status(200).json({
      sucesso: true,
      estatisticas,
      fatos,
      analise: validacao.analise,
      interpretado: validacao.interpretado,
      linhas_descartadas: validacao.descartadas,
      linhas_substituidas: validacao.substituidas,
      modelo: r.modelo,
      tempo_ms: r.tempo_ms,
      uso_id: usoId,
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
    const por_tipo = { recomendacao: 0, padroes: 0, severidade: 0 };
    db.prepare('SELECT tipo, COUNT(*) AS total FROM ia_uso GROUP BY tipo').all().forEach((l) => { por_tipo[l.tipo] = l.total; });
    const decididas = m.aceitas + m.descartadas;
    return res.status(200).json({
      sucesso: true,
      total_usos: m.total_usos,
      tempo_medio_ms: m.tempo_medio_ms,
      aceitas: m.aceitas,
      descartadas: m.descartadas,
      pendentes: m.pendentes,
      por_tipo,
      // taxa sobre as sugestões em que o auditor decidiu (aceitou ou descartou); null se ainda nao ha decisoes
      taxa_aceitacao: decididas > 0 ? Math.round((m.aceitas / decididas) * 100) : null,
    });
  } catch (erro) {
    console.error('Erro ao calcular métricas da IA:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao calcular as métricas.' });
  }
});

module.exports = router;
