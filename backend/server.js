// server.js — ponto de entrada do backend SAAC
// Sprint III: Autenticacao | Sprint IV: CRUD de Orgaos e Achados (relacionados)
require('dotenv').config();
const { validarConfiguracao } = require('./config');

// Recusa iniciar com configuração insegura/incompleta (ex.: sem JWT_SECRET)
try {
  validarConfiguracao();
} catch (erro) {
  console.error(`
❌ Configuração inválida:
${erro.message}
`);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const orgaosRoutes = require('./routes/orgaos');
const achadosRoutes = require('./routes/achados');
const dashboardRoutes = require('./routes/dashboard');
const iaRoutes = require('./routes/ia');
const { rotaNaoEncontrada, tratadorGlobal } = require('./middleware/erros');

const app = express();
const PORT = process.env.PORT || 3000;

// Cabeçalhos de segurança HTTP
app.use(helmet());

// CORS restrito à(s) origem(ns) do frontend (CORS_ORIGIN, separadas por vírgula)
const origensPermitidas = (process.env.CORS_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:8080')
  .split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin(origem, callback) {
    // sem Origin (curl, testes, servidor-servidor) não é requisição de navegador: permitido
    if (!origem || origensPermitidas.includes(origem)) return callback(null, true);
    return callback(null, false); // sem cabeçalhos CORS: o navegador bloqueia
  },
}));
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/orgaos', orgaosRoutes);
app.use('/api/achados', achadosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ia', iaRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', servico: 'SAAC API', versao: '1.1.0' });
});

// 404 em JSON e tratador global de erros (JSON genérico, sem stack trace nem caminhos)
app.use(rotaNaoEncontrada);
app.use(tratadorGlobal);

// Só abre a porta quando executado diretamente (os testes importam o app sem listen)
if (require.main === module) app.listen(PORT, () => {
  console.log(`\n🔐 SAAC API rodando em http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Auth:         POST /api/auth/cadastro | POST /api/auth/login | GET /api/auth/verify`);
  console.log(`   Orgaos:       POST/GET /api/orgaos | GET/PUT/DELETE /api/orgaos/:id`);
  console.log(`   Dashboard:    GET /api/dashboard`);
  console.log(`   IA local:     GET /api/ia/status | POST /api/ia/recomendacao | GET /api/ia/padroes | GET /api/ia/metricas`);
  console.log(`   Achados:      POST/GET /api/achados | GET/PUT/DELETE /api/achados/:id\n`);
});

module.exports = app;
