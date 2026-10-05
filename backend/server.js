// server.js — ponto de entrada do backend SAAC
// Sprint III: Autenticacao | Sprint IV: CRUD de Orgaos e Achados (relacionados)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const orgaosRoutes = require('./routes/orgaos');
const achadosRoutes = require('./routes/achados');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/orgaos', orgaosRoutes);
app.use('/api/achados', achadosRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', servico: 'SAAC API', versao: '1.1.0' });
});

app.listen(PORT, () => {
  console.log(`\n🔐 SAAC API rodando em http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Auth:         POST /api/auth/cadastro | POST /api/auth/login | GET /api/auth/verify`);
  console.log(`   Orgaos:       POST/GET /api/orgaos | GET/PUT/DELETE /api/orgaos/:id`);
  console.log(`   Achados:      POST/GET /api/achados | GET/PUT/DELETE /api/achados/:id\n`);
});
