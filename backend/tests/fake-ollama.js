// tests/fake-ollama.js — servidor HTTP falso no lugar do Ollama (os testes nunca exigem o Ollama real)
const http = require('node:http');

// Vetor de 5 dimensões: contagem de palavras-chave (assuntos) + 0,01 para nunca ser nulo
function vetorPadrao(texto) {
  const t = texto.toLowerCase();
  return ['licita', 'medicament', 'contrato', 'diaria', 'obra'].map((k) => (t.split(k).length - 1) + 0.01);
}

// estado.modo: 'ok' | 'vazio' | 'lento' | 'sem-modelo' | 'erro'
function criar() {
  const estado = { modoEmbed: 'ok', embedFn: null, resposta: null, modo: 'ok', atrasoMs: 1500, requisicoes: [] };
  const servidor = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      const json = corpo ? JSON.parse(corpo) : null;
      estado.requisicoes.push({ metodo: req.method, url: req.url, corpo: json });
      const responder = (codigo, obj) => {
        res.writeHead(codigo, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };

      if (req.url === '/api/tags') {
        return responder(200, { models: [{ name: 'llama3.2:3b', model: 'llama3.2:3b' }] });
      }
      if (req.url === '/api/embed') {
        if (estado.modoEmbed === 'sem-modelo') return responder(404, { error: 'model "nomic-embed-text" not found, try pulling it first' });
        if (estado.modoEmbed === 'invalido') return responder(200, { embeddings: [] });
        const texto = String(json.input || '');
        return responder(200, { model: json.model, embeddings: [(estado.embedFn || vetorPadrao)(texto)] });
      }
      if (req.url === '/api/generate') {
        if (estado.modo === 'sem-modelo') return responder(404, { error: 'model "llama3.2:3b" not found, try pulling it first' });
        if (estado.modo === 'erro') return responder(500, { error: 'falha interna' });
        if (estado.modo === 'vazio') return responder(200, { model: json.model, response: '   ' });
        if (estado.modo === 'lento') {
          return setTimeout(() => responder(200, { model: json.model, response: 'tarde demais' }), estado.atrasoMs);
        }
        return responder(200, { model: json.model, response: estado.resposta || 'Recomendação de teste: revisar os controles internos e formalizar o processo.' });
      }
      return responder(404, { error: 'rota desconhecida' });
    });
  });
  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      estado.url = `http://127.0.0.1:${servidor.address().port}`;
      estado.fechar = () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(r); });
      resolve(estado);
    });
  });
}

module.exports = { criar };
