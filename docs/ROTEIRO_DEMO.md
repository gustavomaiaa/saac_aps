# Roteiro de demonstração — SAAC (5 minutos)

## Antes de começar (preparação, fora do tempo)

1. Ollama em execução com o modelo: `ollama pull llama3.2:3b` (se ainda não baixou).
2. Configuração (uma vez): em `backend/.env` defina **`JWT_SECRET`** (o servidor não sobe sem ele; gere com
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) e **`CODIGO_CONVITE`** (ex.: `saac-convite-2026`) — o código será usado na demonstração do cadastro.
   Banco limpo com dados de demonstração:
   ```bash
   cd backend && npm install && npm start      # terminal 1
   npm run seed                                # terminal 2 (login: admin@saac.demo / admin123)
   ```
   (ou, com Docker: crie o `.env` na raiz com `JWT_SECRET` e `CODIGO_CONVITE`, depois `docker compose up --build -d` e `docker compose exec backend node seed.js`)
3. Frontend: `cd frontend && python -m http.server 5500` → abrir `http://localhost:5500/login.html`
   (com Docker: `http://localhost:8080/login.html`).
4. **Aquecer a IA:** gere uma recomendação ou análise uma vez antes (a 1ª chamada leva ~12 s porque o modelo é carregado; depois ~4–6 s).
5. Ter à mão o **código de convite** (`CODIGO_CONVITE`): o segundo usuário (ex.: `auditor@teste.com` / `123456`) será criado **ao vivo** na tela de cadastro, para mostrar o convite e as permissões. O admin do seed entra direto, sem convite.

---

## Passo a passo

### 0:00 — Abertura e login (30 s)
- **Clicar:** abrir `login.html`, entrar com `admin@saac.demo` / `admin123`.
- **Falar:** "O SAAC registra achados de auditoria por órgão e usa uma IA que roda localmente, sem enviar dados para a nuvem.
  A senha é protegida com bcrypt e o login tem limite de tentativas."

### 0:30 — Dashboard (45 s)
- **Clicar:** dashboard (já abre). Apontar os cards, as barras por severidade/status e os órgãos com mais achados.
- **Falar:** "Os números vêm do banco por views SQL. Aqui a Prefeitura tem 5 achados e a Secretaria de Saúde 4: são órgãos reincidentes."
- **Mostrar:** passar o mouse num nome de órgão longo (aparece o nome completo).

### 1:15 — Análise de padrões com IA (60 s)
- **Clicar:** card **Análise de padrões → Analisar**. Esperar o resultado.
- **Falar:** "O sistema calcula os fatos em JavaScript — por exemplo, 'a severidade mais frequente é Alto, com 5 de 12'.
  A IA só redige observações sobre esses fatos. Cada linha é validada: se citar um número que não está nos fatos, é descartada.
  Aparecem modelo, tempo de resposta e a base utilizada, e o aviso para revisar."
- **Clicar:** rolar até **Métricas da IA** (usos, tempo médio, taxa de aceitação).

### 2:15 — Achados: filtros, busca e paginação (30 s)
- **Clicar:** menu **Achados**. Filtrar severidade **Crítico**, buscar "medicamentos", limpar; mostrar a paginação.
- **Falar:** "Filtros, busca em título e descrição e paginação no servidor. O botão Exportar CSV respeita esses filtros."

### 2:45 — Novo achado com recomendação por IA (60 s)
- **Clicar:** **+ Novo Achado**. Preencher: título "Convênio sem prestação de contas", descrição "Convênio com entidade privada sem prestação de contas no prazo", órgão e severidade **Alto**.
- **Clicar:** **Gerar com IA**. Mostrar o indicador de carregando, o texto no campo, o aviso "Sugestão gerada por IA, revise antes de salvar", modelo/tempo e **Base utilizada**.
- **Clicar:** **Aceitar**, ajustar uma palavra no texto e **Salvar**.
- **Falar:** "A IA só recebe os campos do achado em edição, e o auditor decide: aceitar, editar ou descartar."

### Bônus (1 min, dentro do passo "Novo achado") — Severidade sugerida e achados parecidos
- **Preparação:** `ollama pull nomic-embed-text` e `npm run embeddings` (o seed já tenta gerar) para os achados terem vetores.
- **Clicar:** no formulário de novo achado, digitar o título "Licitação conduzida sem parecer jurídico" e a descrição "Processo licitatório realizado sem parecer jurídico e sem ata de abertura das propostas".
- **Mostrar:** após ~1 s aparece **Achados parecidos** com o percentual (ex.: ~93% "Licitação sem documentação adequada") e o alerta **Possível duplicidade**; clicar no link abre o achado existente em outra aba.
- **Clicar:** **Sugerir severidade com IA** → mostrar a severidade preenchida, a justificativa curta, modelo/tempo e o aviso "Sugestão gerada por IA, revise antes de salvar"; clicar **Aceitar** (ou **Descartar** para voltar ao valor anterior).
- **Falar:** "A severidade vem em JSON e só é aceita se for Crítico, Alto, Médio ou Baixo; a justificativa não pode citar leis nem números que não estejam no texto. Os achados parecidos usam embeddings locais e cosseno calculado no servidor — nada sai da máquina. Se o Ollama ou o modelo de embeddings estiver ausente, o formulário continua funcionando sem essas sugestões."
- **Métricas:** no dashboard, mostrar em **Métricas da IA** a contagem por tipo (recomendação / severidade / padrões).

### 3:45 — Editar, desfazer e auditoria (45 s)
- **Clicar:** **Editar** no achado recém-criado → mudar severidade para **Crítico** e status **Em análise** → Salvar.
- **Clicar:** reabrir **Editar** → **Desfazer última edição** (o formulário volta ao estado anterior).
- **Clicar:** aba **Histórico de auditoria** (os horários aparecem em horário de Fortaleza).
- **Opcional (15 s):** abrir o mesmo achado em duas abas, salvar na 1ª e depois na 2ª: a 2ª recebe o aviso de **conflito de edição** ("alterado por outra pessoa") com o botão de recarregar.
- **Falar:** "O desfazer usa o padrão Memento: o estado salvo fica encapsulado. A aba mostra quem fez o quê e quando — criação, edição e restauração, com os campos alterados."

### 4:30 — Convite, permissões, exclusão e relatório (30 s)
- **Clicar:** **Sair** → link "Criar conta": preencher o cadastro **com o código de convite** (mostrar que sem o código ou com código errado a conta não é criada) e entrar como esse auditor.
- Mostrar que os achados do admin aparecem como "Somente leitura" e que em **Órgãos** não há botões de criar/editar/excluir (só o administrador altera órgãos).
- Voltar ao admin, **Excluir** um achado (mostrar a confirmação).
- **Clicar:** **Relatório → Imprimir / salvar PDF**.
- **Falar:** "O cadastro só funciona com um código de convite definido pelo administrador. Só o criador ou um administrador altera um achado, e só o administrador altera órgãos. A exclusão é lógica: o registro fica no banco e na auditoria. O relatório é imprimível e inclui a análise da IA já gerada."

### 5:00 — Fechamento (10 s)
- **Falar:** "Arquitetura em três camadas, Memento para o histórico, IA local com privacidade, auditoria, CI e Docker. Os testes automatizados usam um Ollama falso, então rodam em qualquer máquina."

---

## Plano B (se algo falhar)

| Problema | O que fazer |
|----------|-------------|
| IA demora na 1ª vez | Dizer que é a carga do modelo; ter aquecido antes |
| Ollama desligado | Mostrar a mensagem "IA local indisponível. Verifique se o Ollama está em execução." e que o restante do sistema segue funcionando — isso também é um requisito |
| Bloqueio de login (429) | Mostrar a mensagem como demonstração do limite; reiniciar o backend para zerar |
| Frontend não conecta | Conferir se abriu por `http://localhost:5500` (ou `:8080`) e não por `file://` (CORS restrito) |
| Rodar os testes ao vivo | `cd backend && npm test` (não exige Ollama) |
