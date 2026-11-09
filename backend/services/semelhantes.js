// services/semelhantes.js — achados semelhantes por embeddings (nomic-embed-text via Ollama) + cosseno em JS.
// Os vetores ficam na tabela achados_embedding; nada sai da máquina.
const db = require('../db');
const ia = require('./ia');

// Limiar mínimo para listar um achado como "parecido" (padrão 0,80) e limiar de "possível duplicidade" (padrão 0,90)
function limiarSemelhante() {
  const n = Number(String(process.env.SEMELHANTES_LIMIAR || '').replace(',', '.'));
  return n > 0 && n <= 1 ? n : 0.80;
}
function limiarDuplicidade() {
  const n = Number(String(process.env.SEMELHANTES_LIMIAR_DUPLICIDADE || '').replace(',', '.'));
  return n > 0 && n <= 1 ? n : 0.9;
}

// Similaridade do cosseno entre dois vetores (0 se tamanhos diferentes ou vetor nulo)
function cosseno(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let produto = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    produto += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return produto / (Math.sqrt(na) * Math.sqrt(nb));
}

// Texto que representa o achado no espaço de embeddings (mesmo formato para achados e consultas)
function textoDoAchado(titulo, descricao) {
  return `search_document: ${String(titulo).trim()}. ${String(descricao).trim()}`;
}

function guardarEmbedding(achadoId, vetor, modelo) {
  db.prepare(
    `INSERT INTO achados_embedding (achado_id, vetor, modelo, atualizado_em) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(achado_id) DO UPDATE SET vetor = excluded.vetor, modelo = excluded.modelo, atualizado_em = excluded.atualizado_em`
  ).run(achadoId, JSON.stringify(vetor), modelo);
}

// Gera e grava o embedding de um achado. Lança ErroIA se o Ollama/modelo não estiver disponível.
async function atualizarEmbedding(achadoId) {
  const achado = db.prepare('SELECT titulo, descricao FROM achados WHERE id = ? AND excluido_em IS NULL').get(achadoId);
  if (!achado) return false;
  const { vetor, modelo } = await ia.embedding(textoDoAchado(achado.titulo, achado.descricao));
  guardarEmbedding(achadoId, vetor, modelo);
  return true;
}

// Chamada "dispare e esqueça" usada ao criar/editar: nunca atrapalha a requisição se a IA estiver fora
function atualizarEmbeddingEmSegundoPlano(achadoId) {
  return atualizarEmbedding(achadoId).catch((erro) => {
    if (!(erro instanceof ia.ErroIA)) console.error('Erro ao gerar embedding:', erro);
    return false;
  });
}

function removerEmbedding(achadoId) {
  db.prepare('DELETE FROM achados_embedding WHERE achado_id = ?').run(achadoId);
}

// Os 3 achados mais parecidos com o texto informado, acima do limiar.
// opcoes: { orgaoId, excluirId }. Lança ErroIA (503/504/502) se não houver embeddings disponíveis.
async function buscarSemelhantes(titulo, descricao, opcoes = {}) {
  const limiar = limiarSemelhante();
  const { vetor } = await ia.embedding(textoDoAchado(titulo, descricao));
  const linhas = db.prepare(
    `SELECT a.id, a.titulo, a.orgao_id, a.orgao_nome, a.severidade, e.vetor
     FROM achados_embedding e JOIN vw_achados_detalhados a ON a.id = e.achado_id`
  ).all();

  const ranking = linhas
    .filter((l) => !opcoes.excluirId || l.id !== Number(opcoes.excluirId))
    .map((l) => ({ l, similaridade: cosseno(vetor, JSON.parse(l.vetor)) }))
    .filter((x) => x.similaridade >= limiar)
    .sort((x, y) => y.similaridade - x.similaridade)
    .slice(0, 3)
    .map(({ l, similaridade }) => ({
      id: l.id,
      titulo: l.titulo,
      orgao_nome: l.orgao_nome,
      severidade: l.severidade,
      mesmo_orgao: opcoes.orgaoId ? l.orgao_id === Number(opcoes.orgaoId) : false,
      similaridade: Number(similaridade.toFixed(4)),
      percentual: Math.round(similaridade * 100),
    }));

  return {
    semelhantes: ranking,
    limiar,
    limiar_duplicidade: limiarDuplicidade(),
    possivel_duplicidade: ranking.length > 0 && ranking[0].similaridade >= limiarDuplicidade(),
    total_indexados: linhas.length,
  };
}

// Gera embeddings dos achados ativos que ainda não têm (ou de todos, com { todos: true }).
// Usado por `npm run embeddings` e pelo seed. Devolve { gerados, falhas, total, erro }.
async function reindexar({ todos = false } = {}) {
  const achados = db.prepare(
    `SELECT a.id FROM achados a
     ${todos ? '' : 'LEFT JOIN achados_embedding e ON e.achado_id = a.id'}
     WHERE a.excluido_em IS NULL ${todos ? '' : 'AND e.achado_id IS NULL'} ORDER BY a.id`
  ).all();
  let gerados = 0;
  let erro = null;
  for (const { id } of achados) {
    try {
      await atualizarEmbedding(id);
      gerados += 1;
    } catch (e) {
      erro = e instanceof ia.ErroIA ? e.message : String(e.message || e);
      break; // se a IA/modelo está fora do ar, não adianta tentar os demais
    }
  }
  return { total: achados.length, gerados, falhas: achados.length - gerados, erro };
}

module.exports = {
  cosseno, textoDoAchado, atualizarEmbedding, atualizarEmbeddingEmSegundoPlano, removerEmbedding,
  buscarSemelhantes, reindexar, limiarSemelhante, limiarDuplicidade,
};
