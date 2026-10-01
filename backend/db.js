// db.js — inicializa o banco SQLite e a tabela de usuarios
// Usa o modulo nativo node:sqlite (embutido no Node.js >= 22.5),
// evitando dependencia nativa (better-sqlite3) que exige compilador C++
// instalado na maquina (Visual Studio Build Tools no Windows).
const path = require('path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (erro) {
  console.error(
    '\n❌ Seu Node.js não tem suporte a node:sqlite habilitado.\n' +
    '   Rode o servidor assim: node --experimental-sqlite server.js\n' +
    '   Ou atualize o Node para a versao 22.5+ (recomendado: 22 LTS ou superior).\n'
  );
  throw erro;
}

const dbPath = path.join(__dirname, 'saac.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    senha TEXT NOT NULL,
    area TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
