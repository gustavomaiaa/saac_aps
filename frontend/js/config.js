// config.js — URL base da API e helper de autenticação compartilhado
const API_URL = 'http://localhost:3000/api';

function obterToken() {
  const token = localStorage.getItem('saac_token');
  if (!token) {
    window.location.href = 'login.html';
    return null;
  }
  return token;
}

function headersAutenticados() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${obterToken()}`,
  };
}

function logout() {
  localStorage.removeItem('saac_token');
  localStorage.removeItem('saac_usuario');
  window.location.href = 'login.html';
}
