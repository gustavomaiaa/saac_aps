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

// Migracao idempotente: adiciona a coluna somente se ela ainda nao existir
function adicionarColunaSeNaoExistir(tabela, coluna, definicao) {
  const existe = db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
  if (!existe) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}

// --- Sprint V: exclusao logica de achados ---
adicionarColunaSeNaoExistir('achados', 'excluido_em', 'TEXT');

// --- Sprint V: perfil de acesso ('auditor' por padrao; o primeiro usuario e 'admin') ---
adicionarColunaSeNaoExistir('usuarios', 'perfil', "TEXT NOT NULL DEFAULT 'auditor'");
// Bancos antigos: se ainda nao ha nenhum admin, o primeiro usuario cadastrado vira admin
db.exec(`
  UPDATE usuarios SET perfil = 'admin'
  WHERE id = (SELECT MIN(id) FROM usuarios)
    AND NOT EXISTS (SELECT 1 FROM usuarios WHERE perfil = 'admin');
`);

// --- Sprint V: recomendacao da IA (editavel pelo auditor) ---
adicionarColunaSeNaoExistir('achados', 'recomendacao', 'TEXT');

// --- Sprint V: metricas de uso da IA (explicabilidade) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS ia_uso (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('recomendacao', 'padroes', 'severidade')),
    achado_id INTEGER,
    modelo TEXT NOT NULL,
    tempo_ms INTEGER NOT NULL,
    resultado TEXT NOT NULL DEFAULT 'pendente' CHECK (resultado IN ('aceita', 'descartada', 'pendente')),
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (achado_id) REFERENCES achados(id)
  );
`);

// --- Sprint V: historico de edicoes de achados (padrao Memento) ---
// Cada linha guarda um snapshot (estado_json) do achado ANTES de uma edicao.
db.exec(`
  CREATE TABLE IF NOT EXISTS achados_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    achado_id INTEGER NOT NULL,
    rotulo TEXT NOT NULL,
    estado_json TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    usuario_id INTEGER NOT NULL,
    FOREIGN KEY (achado_id) REFERENCES achados(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`);

// Migracao: bancos criados antes do recurso "severidade sugerida" tem um CHECK que nao aceita o
// novo tipo. SQLite nao altera CHECK, entao a tabela e recriada (dados preservados, idempotente).
if (!db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ia_uso'").get().sql.includes("'severidade'")) {
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE ia_uso_nova (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('recomendacao', 'padroes', 'severidade')),
        achado_id INTEGER,
        modelo TEXT NOT NULL,
        tempo_ms INTEGER NOT NULL,
        resultado TEXT NOT NULL DEFAULT 'pendente' CHECK (resultado IN ('aceita', 'descartada', 'pendente')),
        criado_em TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY (achado_id) REFERENCES achados(id)
      );
    `);
    db.exec(`INSERT INTO ia_uso_nova (id, usuario_id, tipo, achado_id, modelo, tempo_ms, resultado, criado_em)
             SELECT id, usuario_id, tipo, achado_id, modelo, tempo_ms, resultado, criado_em FROM ia_uso;`);
    db.exec('DROP TABLE ia_uso;');
    db.exec('ALTER TABLE ia_uso_nova RENAME TO ia_uso;');
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

// --- Achados semelhantes: embedding (vetor em JSON) de cada achado ---
db.exec(`
  CREATE TABLE IF NOT EXISTS achados_embedding (
    achado_id INTEGER PRIMARY KEY,
    vetor TEXT NOT NULL,
    modelo TEXT NOT NULL,
    atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (achado_id) REFERENCES achados(id)
  );
`);

// --- Auditoria: quem fez o que e quando (criar, editar, excluir e restaurar achados) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    acao TEXT NOT NULL CHECK (acao IN ('criar', 'editar', 'excluir', 'restaurar')),
    entidade TEXT NOT NULL,
    entidade_id INTEGER NOT NULL,
    antes TEXT,
    depois TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );
`);
db.exec('CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria (entidade, entidade_id);');

// --- Sprint V: views usadas pelo dashboard e pelas listagens ---
// Recriadas a cada inicializacao (nao guardam dados, entao e seguro e idempotente).
db.exec('DROP VIEW IF EXISTS vw_achados_detalhados;');
db.exec(`
  CREATE VIEW vw_achados_detalhados AS
  SELECT a.*, o.nome AS orgao_nome, o.tipo AS orgao_tipo, u.nome AS criado_por_nome
  FROM achados a
  JOIN orgaos o ON o.id = a.orgao_id
  JOIN usuarios u ON u.id = a.criado_por_id
  WHERE a.excluido_em IS NULL;
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
  LEFT JOIN achados a ON a.orgao_id = o.id AND a.excluido_em IS NULL
  GROUP BY o.id;
`);

module.exports = db;
