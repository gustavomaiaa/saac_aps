document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-login');
  const btn = document.getElementById('btn-login');
  const alerta = document.getElementById('alerta');
  const inputEmail = document.getElementById('email');
  const inputSenha = document.getElementById('senha');
  const toggleSenha = document.getElementById('toggle-senha');

  toggleSenha.addEventListener('click', () => {
    const tipo = inputSenha.type === 'password' ? 'text' : 'password';
    inputSenha.type = tipo;
    toggleSenha.textContent = tipo === 'password' ? 'Mostrar' : 'Ocultar';
  });

  function limparErros() {
    document.getElementById('erro-email').textContent = '';
    document.getElementById('erro-senha').textContent = '';
    inputEmail.classList.remove('erro');
    inputSenha.classList.remove('erro');
    alerta.className = 'alerta';
    alerta.textContent = '';
  }

  function validarCampos() {
    let valido = true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!inputEmail.value.trim() || !emailRegex.test(inputEmail.value.trim())) {
      document.getElementById('erro-email').textContent = 'Informe um email válido.';
      inputEmail.classList.add('erro');
      valido = false;
    }
    if (!inputSenha.value || inputSenha.value.length < 6) {
      document.getElementById('erro-senha').textContent = 'A senha deve ter pelo menos 6 caracteres.';
      inputSenha.classList.add('erro');
      valido = false;
    }
    return valido;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros();
    if (!validarCampos()) return;

    btn.disabled = true;
    btn.textContent = 'Entrando...';

    try {
      const resposta = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inputEmail.value.trim(), senha: inputSenha.value }),
      });
      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        alerta.className = 'alerta erro-geral';
        alerta.textContent = dados.erro || 'Não foi possível entrar. Tente novamente.';
        return;
      }

      localStorage.setItem('saac_token', dados.token);
      localStorage.setItem('saac_usuario', JSON.stringify(dados.usuario));
      alerta.className = 'alerta sucesso';
      alerta.textContent = 'Login realizado com sucesso! Redirecionando...';
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
    } catch (erro) {
      alerta.className = 'alerta erro-geral';
      alerta.textContent = 'Erro de conexão com o servidor. Verifique se o backend está rodando.';
      console.error(erro);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
});
