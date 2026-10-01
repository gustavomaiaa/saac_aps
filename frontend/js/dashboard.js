document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('saac_token');
  const boasVindas = document.getElementById('boas-vindas');
  const dadosUsuario = document.getElementById('dados-usuario');

  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const resposta = await fetch(`${API_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dados = await resposta.json();

    if (!resposta.ok || !dados.sucesso) {
      localStorage.removeItem('saac_token');
      localStorage.removeItem('saac_usuario');
      window.location.href = 'login.html';
      return;
    }

    const usuario = dados.usuario;
    boasVindas.textContent = `Bem-vindo(a) de volta, ${usuario.nome}!`;
    document.getElementById('info-nome').textContent = usuario.nome;
    document.getElementById('info-email').textContent = usuario.email;
    document.getElementById('info-area').textContent = usuario.area;
    dadosUsuario.style.display = 'block';
  } catch (erro) {
    boasVindas.textContent = 'Erro ao verificar sessão. Faça login novamente.';
    console.error(erro);
  }
});

document.getElementById('btn-sair').addEventListener('click', () => {
  localStorage.removeItem('saac_token');
  localStorage.removeItem('saac_usuario');
  window.location.href = 'login.html';
});
