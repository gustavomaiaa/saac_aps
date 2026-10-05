// db.js — inicializa o banco SQLite e as tabelas do sistema
// Usa o modulo nativo node:sqlite (embutido no Node.js >= 22.5),
// sem dependencia nativa (sem compilador C++ necessario).
const path = require('path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (erro) {
  console.error(
    '\n❌ Seu Node.js não tem suporte a node:sqlite habilitado.\n' +
    '   Atualize o Node para a versao 22.5+ (recomendado: 22 LTS ou superior).\n'
  );
  throw erro;
}

const dbPath = path.join(__dirname, 'saac.db');
const db = new DatabaseSync(dbPath);

// Garante integridade referencial (FK) entre achados e orgaos/usuarios
db.exec('PRAGMA foreign_keys = ON;');

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

// --- Sprint IV: entidades relacionadas (CRUD) ---
// Relação 1:N — um Orgao possui varios Achados (igual ao exemplo
// "Professor x Disciplina" dado pelo professor).
db.exec(`
  CREATE TABLE IF NOT EXISTS orgaos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS achados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    severidade TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Em aberto',
    orgao_id INTEGER NOT NULL,
    criado_por_id INTEGER NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT,
    FOREIGN KEY (orgao_id) REFERENCES orgaos(id),
    FOREIGN KEY (criado_por_id) REFERENCES usuarios(id)
  );
`);

module.exports = db;
