// services/auditoria.js — trilha de auditoria (quem fez o quê, quando, com o estado antes/depois)
const db = require('../db');

const CAMPOS = ['titulo', 'descricao', 'severidade', 'status', 'orgao_id', 'recomendacao'];

// Recorte do achado que é guardado em antes/depois
function estadoAchado(achado) {
  const estado = {};
  CAMPOS.forEach((c) => { estado[c] = achado[c] === undefined ? null : achado[c]; });
  return estado;
}

function registrar({ usuarioId, acao, entidade = 'achado', entidadeId, antes = null, depois = null }) {
  db.prepare(
    'INSERT INTO auditoria (usuario_id, acao, entidade, entidade_id, antes, depois) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(usuarioId, acao, entidade, entidadeId,
    antes === null ? null : JSON.stringify(antes), depois === null ? null : JSON.stringify(depois));
}

const lerJson = (texto) => { try { return texto ? JSON.parse(texto) : null; } catch (e) { return null; } };

// Registros mais recentes primeiro, com o nome de quem agiu e a lista de campos alterados
function listar(entidade, entidadeId) {
  const linhas = db.prepare(
    `SELECT a.id, a.usuario_id, u.nome AS usuario_nome, a.acao, a.criado_em, a.antes, a.depois
     FROM auditoria a JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.entidade = ? AND a.entidade_id = ?
     ORDER BY a.id DESC`
  ).all(entidade, entidadeId);
  return linhas.map((l) => {
    const antes = lerJson(l.antes);
    const depois = lerJson(l.depois);
    const mudancas = antes && depois
      ? Object.keys(depois).filter((c) => JSON.stringify(antes[c]) !== JSON.stringify(depois[c]))
        .map((campo) => ({ campo, antes: antes[campo] ?? null, depois: depois[campo] ?? null }))
      : [];
    return { id: l.id, usuario_id: l.usuario_id, usuario_nome: l.usuario_nome, acao: l.acao, criado_em: l.criado_em, antes, depois, mudancas };
  });
}

module.exports = { registrar, listar, estadoAchado };
