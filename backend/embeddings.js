// embeddings.js — gera os embeddings dos achados existentes (npm run embeddings [-- --todos])
// Requer o Ollama em execução e o modelo de embeddings (ollama pull nomic-embed-text).
require('dotenv').config();
const semelhantes = require('./services/semelhantes');

(async () => {
  const todos = process.argv.includes('--todos');
  const r = await semelhantes.reindexar({ todos });
  if (r.total === 0) {
    console.log('ℹ️  Todos os achados já possuem embedding. Use --todos para regenerar.');
  } else if (r.erro) {
    console.error(`❌ Embeddings gerados: ${r.gerados}/${r.total}. Interrompido: ${r.erro}`);
    process.exit(1);
  } else {
    console.log(`✅ Embeddings gerados: ${r.gerados}/${r.total}.`);
  }
})();
