# SAAC — Sistema de Achados de Auditoria e Conformidade

[![CI](https://github.com/gustavomaiaa/saac_aps/actions/workflows/ci.yml/badge.svg)](https://github.com/gustavomaiaa/saac_aps/actions/workflows/ci.yml)

Sistema web para registrar achados de auditoria vinculados a órgãos auditados, acompanhar sua situação e
obter apoio de uma **IA local (Ollama)** para sugerir recomendações e analisar padrões.

- **Backend:** Node.js + Express, SQLite nativo (`node:sqlite`), autenticação JWT.
- **Frontend:** HTML, CSS e JavaScript puro (sem frameworks, sem bibliotecas de gráficos).
- **IA:** Ollama rodando na própria máquina — nenhum dado sai do computador.

## Como rodar

Requisitos: **Node.js 22.5 ou superior** (usa o módulo nativo `node:sqlite`).

### Backend

```bash
cd backend
npm install
copy .env.example .env      # Windows (Linux/macOS: cp .env.example .env) — e ajuste o JWT_SECRET
npm start                   # API em http://localhost:3000
npm run seed                # (opcional) dados de demonstração
npm test                    # testes automatizados (não exigem Ollama)
```

O banco `backend/saac.db` é criado automaticamente na primeira execução. As migrações são idempotentes:
bancos criados em sprints anteriores são atualizados sem perder dados.

### Frontend

O frontend é estático e fala com a API em `http://localhost:3000/api` (ver `frontend/js/config.js`).
Sirva a pasta `frontend/` com qualquer servidor estático, por exemplo:

```bash
cd frontend
python -m http.server 5500     # depois abra http://localhost:5500/login.html
```

(ou use a extensão *Live Server* do VS Code, ou abra `frontend/login.html` diretamente no navegador).

### Credenciais de demonstração (após `npm run seed`)

| Campo | Valor |
|-------|-------|
| E-mail | `admin@saac.demo` |
| Senha | `admin123` |
| Perfil | administrador |

O seed cria 1 usuário, 4 órgãos e 12 achados (a Prefeitura e a Secretaria de Saúde são órgãos reincidentes, para a
análise de padrões ter o que mostrar). Rodar o seed de novo não duplica nada.

## IA local

### Instalação do Ollama

1. Instale o Ollama: <https://ollama.com/download>
2. Baixe o modelo: `ollama pull llama3.2:3b`
3. Deixe o Ollama em execução (ele escuta em `http://localhost:11434`).

### Variáveis de ambiente (`backend/.env`)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta da API |
| `JWT_SECRET` | — | Segredo de assinatura dos tokens (**troque em produção**) |
| `JWT_EXPIRES_IN` | `2h` | Validade do token |
| `OLLAMA_URL` | `http://localhost:11434` | Endereço do Ollama |
| `OLLAMA_MODEL` | `llama3.2:3b` | Modelo usado |
| `OLLAMA_TIMEOUT_MS` | `120000` | Tempo máximo de espera pela IA |

### O que a IA recebe e o que não recebe

| Recurso | Recebe | **Não** recebe |
|---------|--------|----------------|
| Recomendação automática | Título, descrição, severidade e nome/tipo do órgão **do achado em edição** | Dados de usuários, e-mails, senhas, outros achados, histórico |
| Análise de padrões | Apenas **estatísticas agregadas** calculadas por SQL (achados por severidade, por tipo de órgão, órgãos com 3+ achados, total por mês) | Títulos, descrições, nomes de pessoas ou qualquer texto individual dos achados |

**Como a análise de padrões evita erros de comparação:** os números são comparados em JavaScript (`services/padroes.js`),
que gera *fatos numerados* já interpretados (ex.: "2. A severidade mais frequente é Alto, com 5 de 12 achados (42%).").
O modelo (temperature 0.2, `num_predict` 400) só redige observações sobre esses fatos. Cada linha da resposta é validada:
números que não constam dos fatos, fatos inexistentes ou linhas cortadas são **descartadas**; se sobrarem menos de 2 linhas
válidas, o sistema mostra só os fatos e a mensagem "A IA não conseguiu interpretar com segurança; veja os fatos acima."
A recomendação automática proíbe citar leis, artigos e números que não estejam no achado enviado.

Toda resposta de IA exibida na tela mostra o **modelo**, o **tempo de resposta** e a **base utilizada**
(os campos exatamente enviados ao modelo). Cada uso é registrado na tabela `ia_uso`, e o dashboard exibe as
*Métricas da IA* (total de usos, tempo médio e taxa de aceitação).

### Limitações

- A IA **pode errar**, inventar ou generalizar: modelos pequenos (3B) são menos precisos. **Sempre revise** o texto
  antes de salvar ou usar em relatórios — por isso toda sugestão exibe o aviso *"Sugestão gerada por IA, revise antes de salvar"*
  e o auditor escolhe **Aceitar** ou **Descartar**.
- O prompt pede para não inventar leis ou números, mas isso não é garantido.
- O tempo de resposta depende do hardware (a primeira chamada é mais lenta por carregar o modelo).
- Se o Ollama estiver desligado ou o modelo não estiver instalado, **o restante do sistema continua funcionando**; a IA
  apenas informa *"IA local indisponível. Verifique se o Ollama está em execução."*

## Endpoints

Todas as rotas, exceto cadastro/login/health, exigem o cabeçalho `Authorization: Bearer <token>`.
Token ausente, inválido ou expirado → `401`.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Verificação de saúde |
| POST | `/api/auth/cadastro` | Cadastro (o 1º usuário vira `admin`, os demais `auditor`) |
| POST | `/api/auth/login` | Login — devolve token e usuário (com `perfil`) |
| GET | `/api/auth/verify` | Valida o token e devolve o usuário |
| POST / GET | `/api/orgaos` | Criar / listar órgãos (com total de achados ativos) |
| GET / PUT / DELETE | `/api/orgaos/:id` | Detalhe / editar / excluir (`409` se tiver achados) |
| POST | `/api/achados` | Criar achado |
| GET | `/api/achados` | Listar. Filtros: `severidade`, `status`, `orgao_id`, `q` (título/descrição), `pagina`, `limite` (padrão 1/10, máx. 100). Resposta: `{ dados, total, pagina, paginas }` |
| GET | `/api/achados/exportar.csv` | CSV (UTF-8 com BOM, separador `;`) com os mesmos filtros |
| GET | `/api/achados/:id` | Detalhe |
| PUT | `/api/achados/:id` | Editar (grava snapshot antes) — criador ou admin |
| DELETE | `/api/achados/:id` | Exclusão lógica — criador ou admin |
| GET | `/api/achados/:id/historico` | Histórico de edições (`rotulo`, `criado_em`) |
| POST | `/api/achados/:id/desfazer` | Desfaz a última edição (`409 "Nada a desfazer."`) — criador ou admin |
| GET | `/api/dashboard` | Totais, por severidade, por status e top 5 órgãos |
| GET | `/api/ia/status` | Ollama no ar? Modelo instalado? |
| POST | `/api/ia/recomendacao` | Corpo: `titulo, descricao, severidade, orgao_nome, orgao_tipo[, achado_id]`. Devolve `{ recomendacao, modelo, tempo_ms, base_utilizada, uso_id }` |
| GET | `/api/ia/padroes` | Estatísticas (SQL) + análise da IA: `{ estatisticas, analise, modelo, tempo_ms }` |
| POST | `/api/ia/uso/:id/resultado` | Corpo: `{ resultado: "aceita" \| "descartada" }` |
| GET | `/api/ia/metricas` | Total de usos, tempo médio e taxa de aceitação |

Erros da IA: `503` (Ollama fora do ar ou modelo ausente), `504` (tempo esgotado), `502` (resposta vazia ou inválida).

## Estrutura de pastas

```
saac_aps/
├── README.md
├── PROGRESSO.md              # checklist de andamento da Sprint V
├── backend/
│   ├── server.js             # app Express (exporta o app; só escuta a porta quando executado direto)
│   ├── db.js                 # SQLite, migrações idempotentes e views
│   ├── seed.js               # dados de demonstração
│   ├── middleware/auth.js    # valida o JWT e carrega o perfil
│   ├── routes/               # auth, orgaos, achados, dashboard, ia
│   ├── services/ia.js        # cliente do Ollama (fetch + AbortController) e prompts
│   ├── memento/achado.js     # padrão Memento (Achado, AchadoMemento, HistoricoAchado)
│   └── tests/                # node:test (usa servidor Ollama falso)
└── frontend/
    ├── login.html, cadastro.html, dashboard.html, orgaos.html, achados.html, relatorio.html
    ├── css/style.css
    └── js/                   # config.js (helpers compartilhados) + um script por tela
```

## Regras de negócio

- Todo achado pertence a um órgão (relação 1:N) e registra quem o criou.
- Severidades: Crítico, Alto, Médio, Baixo. Status: Em aberto, Em análise, Implementado, Rejeitado.
- Título com no mínimo 5 caracteres; recomendação com no máximo 2000.
- Um órgão com achados (ativos ou excluídos logicamente) **não pode ser excluído** (`409`).
- **Exclusão lógica:** excluir um achado só preenche `excluido_em`; ele some das listagens, views, dashboard, CSV e IA, mas continua no banco.
- **Permissões:** só o criador do achado ou um administrador pode editar, excluir e desfazer (`403` caso contrário). O primeiro usuário cadastrado é `admin`.
- Cada edição grava um snapshot do estado anterior; é possível desfazer sucessivamente até esvaziar o histórico.
- Sessão: qualquer resposta `401` limpa o token e redireciona para o login.

## Padrões aplicados

- **Cliente-servidor em três camadas:** apresentação (frontend HTML/CSS/JS) → lógica de negócio (Express: rotas, middleware, serviço de IA) → dados (SQLite, views).
- **Memento** (`backend/memento/achado.js`):
  - `Achado` (*Originator*) guarda o estado em um campo privado `#estado` e cria/restaura mementos;
  - `AchadoMemento` (*Memento*) guarda uma cópia congelada (`Object.freeze`) em um `WeakMap` privado do módulo e expõe só `rotulo` e `criadoEm`;
  - `HistoricoAchado` (*Caretaker*) guarda a pilha de mementos e nunca lê o estado.
  - Como o servidor não mantém memória entre requisições, os mementos são persistidos na tabela `achados_historico` e reconstruídos dentro do mesmo módulo, sem expor o estado.

## Sprint V

Entregas desta sprint:

1. Dashboard com dados reais (views `vw_achados_detalhados` e `vw_resumo_orgaos`, barras em CSS puro).
2. Filtros, busca e paginação de achados.
3. Exclusão lógica de achados.
4. IA local (Ollama): recomendação automática, análise de padrões, status, explicabilidade (modelo, tempo, base utilizada) e métricas de uso/aceitação.
5. Histórico e desfazer com o padrão Memento.
6. Exportação CSV e relatório imprimível (`relatorio.html`).
7. Perfis (admin/auditor), permissões e tratamento de sessão expirada.
8. Testes automatizados, seed e documentação.
9. Polimento: estados de carregamento/vazio, mensagens de erro, layout responsivo.

## Testes

`npm test` (em `backend/`) executa os testes com `node:test`. A IA é testada contra um **servidor HTTP falso**
(`tests/fake-ollama.js`): sucesso, indisponibilidade (503), timeout (504), resposta vazia (502) e registro de métricas.
Nenhum teste exige o Ollama real nem acessa a internet.
