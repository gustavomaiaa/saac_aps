// tests/fake-ollama.js — servidor HTTP falso no lugar do Ollama (os testes nunca exigem o Ollama real)
const http = require('node:http');

// estado.modo: 'ok' | 'vazio' | 'lento' | 'sem-modelo' | 'erro'
function criar() {
  const estado = { modo: 'ok', atrasoMs: 1500, requisicoes: [] };
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
      if (req.url === '/api/generate') {
        if (estado.modo === 'sem-modelo') return responder(404, { error: 'model "llama3.2:3b" not found, try pulling it first' });
        if (estado.modo === 'erro') return responder(500, { error: 'falha interna' });
        if (estado.modo === 'vazio') return responder(200, { model: json.model, response: '   ' });
        if (estado.modo === 'lento') {
          return setTimeout(() => responder(200, { model: json.model, response: 'tarde demais' }), estado.atrasoMs);
        }
        return responder(200, { model: json.model, response: 'Recomendação de teste: revisar os controles internos e formalizar o processo.' });
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
