document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-cadastro');
  const btn = document.getElementById('btn-cadastro');
  const alerta = document.getElementById('alerta');
  const inputNome = document.getElementById('nome');
  const inputEmail = document.getElementById('email');
  const inputArea = document.getElementById('area');
  const inputSenha = document.getElementById('senha');
  const inputConvite = document.getElementById('codigo-convite');
  const toggleSenha = document.getElementById('toggle-senha');

  toggleSenha.addEventListener('click', () => {
    const tipo = inputSenha.type === 'password' ? 'text' : 'password';
    inputSenha.type = tipo;
    toggleSenha.textContent = tipo === 'password' ? 'Mostrar' : 'Ocultar';
  });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validarNome() {
    const ok = inputNome.value.trim().length >= 3;
    document.getElementById('erro-nome').textContent = ok ? '' : 'Informe pelo menos 3 caracteres.';
    inputNome.classList.toggle('erro', !ok);
    return ok;
  }
  function validarEmail() {
    const ok = emailRegex.test(inputEmail.value.trim());
    document.getElementById('erro-email').textContent = ok ? '' : 'Informe um email válido.';
    inputEmail.classList.toggle('erro', !ok);
    return ok;
  }
  function validarArea() {
    const ok = inputArea.value !== '';
    document.getElementById('erro-area').textContent = ok ? '' : 'Selecione uma área.';
    inputArea.classList.toggle('erro', !ok);
    return ok;
  }
  function validarSenha() {
    const ok = inputSenha.value.length >= 6;
    document.getElementById('erro-senha').textContent = ok ? '' : 'Mínimo de 6 caracteres.';
    inputSenha.classList.toggle('erro', !ok);
    return ok;
  }

  function validarConvite() {
    const ok = inputConvite.value.trim().length > 0;
    document.getElementById('erro-convite').textContent = ok ? '' : 'Informe o código de convite.';
    inputConvite.classList.toggle('erro', !ok);
    return ok;
  }

  inputNome.addEventListener('blur', validarNome);
  inputConvite.addEventListener('input', validarConvite);
  inputEmail.addEventListener('blur', validarEmail);
  inputArea.addEventListener('change', validarArea);
  inputSenha.addEventListener('input', validarSenha);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alerta.className = 'alerta';
    alerta.textContent = '';

    const nomeOk = validarNome();
    const emailOk = validarEmail();
    const areaOk = validarArea();
    const senhaOk = validarSenha();
    const conviteOk = validarConvite();
    if (!nomeOk || !emailOk || !areaOk || !senhaOk || !conviteOk) return;

    btn.disabled = true;
    btn.textContent = 'Criando conta...';

    try {
      const resposta = await fetch(`${API_URL}/auth/cadastro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: inputNome.value.trim(),
          email: inputEmail.value.trim(),
          senha: inputSenha.value,
          area: inputArea.value,
          codigo_convite: inputConvite.value.trim(),
        }),
      });
      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        alerta.className = 'alerta erro-geral';
        alerta.textContent = dados.erro || 'Não foi possível criar a conta.';
        return;
      }

      localStorage.setItem('saac_token', dados.token);
      localStorage.setItem('saac_usuario', JSON.stringify(dados.usuario));
      alerta.className = 'alerta sucesso';
      alerta.textContent = 'Conta criada com sucesso! Redirecionando...';
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
    } catch (erro) {
      alerta.className = 'alerta erro-geral';
      alerta.textContent = 'Erro de conexão com o servidor. Verifique se o backend está rodando.';
      console.error(erro);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Criar conta';
    }
  });
});
