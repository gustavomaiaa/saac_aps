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

// SAAC_DB_PATH permite usar outro arquivo (ou ':memory:') nos testes automatizados
const dbPath = process.env.SAAC_DB_PATH || path.join(__dirname, 'saac.db');
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

// --- Sprint V: views usadas pelo dashboard e pelas listagens ---
// Recriadas a cada inicializacao (nao guardam dados, entao e seguro e idempotente).
db.exec('DROP VIEW IF EXISTS vw_achados_detalhados;');
db.exec(`
  CREATE VIEW vw_achados_detalhados AS
  SELECT a.*, o.nome AS orgao_nome, o.tipo AS orgao_tipo, u.nome AS criado_por_nome
  FROM achados a
  JOIN orgaos o ON o.id = a.orgao_id
  JOIN usuarios u ON u.id = a.criado_por_id;
`);

db.exec('DROP VIEW IF EXISTS vw_resumo_orgaos;');
db.exec(`
  CREATE VIEW vw_resumo_orgaos AS
  SELECT o.id AS orgao_id, o.nome, o.tipo,
         COUNT(a.id) AS total_achados,
         COALESCE(SUM(CASE WHEN a.severidade = 'Crítico' THEN 1 ELSE 0 END), 0) AS total_critico,
         COALESCE(SUM(CASE WHEN a.severidade = 'Alto' THEN 1 ELSE 0 END), 0) AS total_alto,
         COALESCE(SUM(CASE WHEN a.severidade = 'Médio' THEN 1 ELSE 0 END), 0) AS total_medio,
         COALESCE(SUM(CASE WHEN a.severidade = 'Baixo' THEN 1 ELSE 0 END), 0) AS total_baixo
  FROM orgaos o
  LEFT JOIN achados a ON a.orgao_id = o.id
  GROUP BY o.id;
`);

module.exports = db;
