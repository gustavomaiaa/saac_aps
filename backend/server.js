// server.js — ponto de entrada do backend SAAC (Sprint III - Autenticacao)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', servico: 'SAAC Auth API', versao: '1.0.0' });
});

app.listen(PORT, () => {
  console.log(`\n🔐 SAAC Auth API rodando em http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health`);
  console.log(`   Endpoints:    POST /api/auth/cadastro | POST /api/auth/login | GET /api/auth/verify\n`);
});
