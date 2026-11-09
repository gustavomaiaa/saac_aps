// routes/dashboard.js — numeros agregados para o dashboard (Sprint V)
const express = require('express');
const db = require('../db');
const autenticarToken = require('../middleware/auth');

const router = express.Router();
router.use(autenticarToken);

const SEVERIDADES = ['Crítico', 'Alto', 'Médio', 'Baixo'];
const STATUS = ['Em aberto', 'Em análise', 'Implementado', 'Rejeitado'];

// Monta { chave: contagem } garantindo todas as chaves esperadas (mesmo com zero)
function contagemPor(coluna, chaves) {
  const linhas = db.prepare(
    `SELECT ${coluna} AS chave, COUNT(*) AS total FROM vw_achados_detalhados GROUP BY ${coluna}`
  ).all();
  const resultado = {};
  chaves.forEach((c) => { resultado[c] = 0; });
  linhas.forEach((l) => { resultado[l.chave] = l.total; });
  return resultado;
}

router.get('/', (req, res) => {
  try {
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM vw_achados_detalhados').get();
    const totalOrgaos = db.prepare('SELECT COUNT(*) AS total FROM orgaos').get().total;
    const topOrgaos = db.prepare(
      `SELECT orgao_id, nome, tipo, total_achados
       FROM vw_resumo_orgaos WHERE total_achados > 0
       ORDER BY total_achados DESC, nome ASC LIMIT 5`
    ).all();

    return res.status(200).json({
      sucesso: true,
      total_achados: total,
      total_orgaos: totalOrgaos,
      por_severidade: contagemPor('severidade', SEVERIDADES),
      por_status: contagemPor('status', STATUS),
      top_orgaos: topOrgaos,
    });
  } catch (erro) {
    console.error('Erro ao gerar dashboard:', erro);
    return res.status(500).json({ sucesso: false, erro: 'Erro interno ao gerar o dashboard.' });
  }
});

module.exports = router;
