// server.js — ponto de entrada do backend SAAC
// Sprint III: Autenticacao | Sprint IV: CRUD de Orgaos e Achados (relacionados)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const orgaosRoutes = require('./routes/orgaos');
const achadosRoutes = require('./routes/achados');
const dashboardRoutes = require('./routes/dashboard');
const iaRoutes = require('./routes/ia');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/orgaos', orgaosRoutes);
app.use('/api/achados', achadosRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ia', iaRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', servico: 'SAAC API', versao: '1.1.0' });
});

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
