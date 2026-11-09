// seed.js — dados de demonstração (npm run seed)
// Cria 1 usuário admin, 4 órgãos e 12 achados. Pode ser executado mais de uma vez: se o
// usuário de demonstração já existir, nada é duplicado.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');
const semelhantes = require('./services/semelhantes');

const EMAIL_DEMO = 'admin@saac.demo';
const SENHA_DEMO = 'admin123';

if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(EMAIL_DEMO)) {
  console.log('ℹ️  Dados de demonstração já existem (usuário admin@saac.demo). Nada foi alterado.');
  process.exit(0);
}

const orgaosDemo = [
  { nome: 'Prefeitura Municipal de Vila Nova', tipo: 'Prefeitura' },
  { nome: 'Secretaria Municipal de Saúde', tipo: 'Secretaria' },
  { nome: 'Autarquia de Água e Esgoto', tipo: 'Autarquia' },
  { nome: 'Câmara Municipal de Vila Nova', tipo: 'Câmara Municipal' },
];

// [índice do órgão, título, descrição, severidade, status, recomendação, criado_em]
// A Prefeitura (5 achados) e a Secretaria de Saúde (4) são reincidentes (3 ou mais).
const achadosDemo = [
  [0, 'Licitação sem documentação adequada', 'Três processos licitatórios foram conduzidos sem parecer jurídico e sem ata de abertura das propostas.', 'Crítico', 'Em aberto', null, '2026-06-10 09:00:00'],
  [0, 'Contratos sem designação de fiscal', 'Contratos de prestação de serviços vigentes não possuem fiscal formalmente designado.', 'Alto', 'Em análise', 'Designar formalmente fiscais de contrato e registrar o acompanhamento da execução.', '2026-07-03 14:30:00'],
  [0, 'Diárias de viagem sem comprovação', 'Pagamentos de diárias sem relatório de viagem e sem comprovantes de deslocamento.', 'Médio', 'Em aberto', null, '2026-08-12 10:15:00'],
  [0, 'Portal da transparência desatualizado', 'Informações de despesas publicadas com mais de 90 dias de atraso.', 'Baixo', 'Implementado', 'Estabelecer rotina mensal de atualização do portal com responsável definido.', '2026-09-01 16:00:00'],
  [0, 'Pagamento antes da liquidação da despesa', 'Identificados pagamentos realizados antes da etapa de liquidação.', 'Alto', 'Em aberto', null, '2026-10-05 11:20:00'],
  [1, 'Estoque de medicamentos sem controle', 'Ausência de controle formal de entrada e saída no almoxarifado de medicamentos.', 'Crítico', 'Em análise', 'Implantar controle de estoque com inventário periódico e conferência por amostragem.', '2026-07-20 08:45:00'],
  [1, 'Medicamentos vencidos armazenados', 'Lotes com validade expirada mantidos junto ao estoque disponível.', 'Alto', 'Em aberto', null, '2026-08-18 13:10:00'],
  [1, 'Escala de plantão sem registro de ponto', 'Profissionais em plantão sem registro de ponto eletrônico ou equivalente.', 'Médio', 'Em aberto', null, '2026-09-22 09:40:00'],
  [1, 'Contratação emergencial recorrente', 'Mesmo fornecedor contratado de forma emergencial em três ocasiões seguidas.', 'Alto', 'Rejeitado', null, '2026-10-14 15:05:00'],
  [2, 'Manutenção de hidrômetros sem cronograma', 'Não há cronograma formal de manutenção preventiva dos hidrômetros.', 'Médio', 'Em análise', null, '2026-08-27 10:00:00'],
  [2, 'Inadimplência sem cobrança ativa', 'Débitos antigos de usuários sem ações de cobrança registradas.', 'Baixo', 'Em aberto', null, '2026-10-02 17:30:00'],
  [3, 'Verbas indenizatórias sem prestação de contas', 'Verbas pagas a parlamentares sem a respectiva prestação de contas.', 'Alto', 'Em aberto', null, '2026-09-09 12:00:00'],
];

db.exec('BEGIN');
try {
  const usuario = db.prepare(
    "INSERT INTO usuarios (nome, email, senha, area, perfil) VALUES (?, ?, ?, ?, 'admin')"
  ).run('Administrador Demo', EMAIL_DEMO, bcrypt.hashSync(SENHA_DEMO, 10), 'Compliance');
  const usuarioId = Number(usuario.lastInsertRowid);

  const idsOrgaos = orgaosDemo.map((o) => Number(
    db.prepare('INSERT INTO orgaos (nome, tipo) VALUES (?, ?)').run(o.nome, o.tipo).lastInsertRowid
  ));

  achadosDemo.forEach(([indice, titulo, descricao, severidade, status, recomendacao, criadoEm]) => {
    db.prepare(
      `INSERT INTO achados (titulo, descricao, severidade, status, orgao_id, criado_por_id, recomendacao, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(titulo, descricao, severidade, status, idsOrgaos[indice], usuarioId, recomendacao, criadoEm);
  });
  db.exec('COMMIT');
} catch (erro) {
  db.exec('ROLLBACK');
  throw erro;
}

console.log('✅ Dados de demonstração criados: 1 usuário admin, 4 órgãos e 12 achados.');
console.log(`   Login: ${EMAIL_DEMO}  |  Senha: ${SENHA_DEMO}`);

// Embeddings para "achados semelhantes" (opcional: exige Ollama + nomic-embed-text)
semelhantes.reindexar().then((r) => {
  if (r.erro) console.log(`ℹ️  Embeddings não gerados (${r.erro}). Depois de iniciar o Ollama, rode: npm run embeddings`);
  else console.log(`✅ Embeddings gerados para ${r.gerados} achados.`);
});
