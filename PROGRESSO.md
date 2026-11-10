# PROGRESSO — SAAC

## Sprint V (concluída)
- [x] Etapas 1–9: dashboard, filtros/paginação, exclusão lógica, IA local, Memento, CSV/relatório, permissões, testes/seed, polimento
- [x] Correção da análise de padrões (fatos calculados em JS + validação da resposta)

## Finalização para entrega acadêmica
- [x] 1. CI (`.github/workflows/ci.yml`, Node 22, `npm ci` + `npm test`) e selo no README
- [x] 2. Docker (`backend/Dockerfile`, `docker-compose.yml`); testado: build, up, seed, health, CORS e IA via host.docker.internal
- [x] 3. Segurança: senhas já usavam bcrypt (confirmado, com teste); helmet; limite de login 5/15 min por IP (429); CORS por `CORS_ORIGIN`
- [x] 4. Auditoria: tabela `auditoria`, `GET /api/achados/:id/auditoria`, aba "Histórico de auditoria", testes
- [x] 5. Barras do dashboard: `title` com nome completo e quebra em 2 linhas
- [x] 6. README reescrito (índice, Mermaid, padrões, LGPD, rastreabilidade, Docker, limitações)
- [x] 7. `docs/ROTEIRO_DEMO.md`
- [x] 8. PROGRESSO atualizado

## Pendente / observações
- Verificação visual no navegador (aba de auditoria, mensagem 429, barras com 2 linhas) não foi automatizada.
- O workflow de CI não pôde ser executado localmente (roda no GitHub após o push); os testes passam no Node 24 local.
- Tempo da IA (llama3.2:3b): recomendação ~12–15 s na 1ª chamada; padrões ~6 s.

## IA: severidade sugerida e achados semelhantes
- [x] `POST /api/ia/severidade` (JSON validado, justificativa ≤ 2 frases sem leis/números inventados, 502 se inválida, registro em `ia_uso` tipo `severidade`)
- [x] `GET /api/ia/semelhantes` (embeddings `nomic-embed-text`, tabela `achados_embedding`, cosseno em JS, limiar configurável, alerta de duplicidade)
- [x] `npm run embeddings` e seed gerando embeddings; embedding atualizado ao criar/editar/excluir
- [x] Frontend: botão "Sugerir severidade com IA" (Aceitar/Descartar), "Achados parecidos" com link e alerta; métricas por tipo no dashboard
- [x] Testes com servidor falso (79 no total) e teste real com o Ollama (modelo `nomic-embed-text` baixado nesta máquina)
- Pendente (manual no navegador): conferir visualmente o formulário (caixas de severidade e achados parecidos).

## Ajustes finais
- [x] `SEMELHANTES_LIMIAR` padrão 0,80 (duplicidade segue 0,90)
- [x] Análise de padrões: 3 observações de interpretação (risco/concentração/tendência) com citações [n] + ação prioritária; validação descarta [n] inexistente, número fora dos fatos, cópia de fato e linha cortada; fallback mantido
- [x] Verificação no navegador (Chromium + playwright-core, fora do projeto): prints em `docs/prints/`
- [x] CSS: botões Aceitar/Descartar e Cancelar/Salvar corrigidos (apareciam esticados)

## Validação determinística da interpretação (padrões)
- [x] Regra 1: status/severidades inexistentes descartam a linha
- [x] Regra 2: meses empatados -> Tendência vira frase fixa gerada em JS
- [x] Regra 3: Ação prioritária inválida/descartada -> ação fixa baseada nos órgãos reincidentes
- [x] Testes por regra (`tests/padroes-regras.test.js`): 8 falham com o validador antigo e passam com o novo

## Correções da auditoria (docs/AUDITORIA.md) — concluídas
- [x] 1. Entrada e erros: validação central (`services/validacao.js`), tratador global em JSON sem stack trace, 400 em vez de 500, servidor não sobe sem `JWT_SECRET`
- [x] 2. Autenticação/permissões: segredo de exemplo recusado, compose exige `JWT_SECRET`/`CODIGO_CONVITE`, cadastro por convite (campo no formulário), órgãos só para admin
- [x] 3. Abuso: bcrypt assíncrono, limite de cadastro por IP, limite de IA por usuário (configurável, 429 claro), login bloqueado por IP + e-mail
- [x] 4. IA: filtro da recomendação (lei/artigo/decreto/números), texto do usuário delimitado em `<achado>`, README sem a promessa só-de-prompt, IA = sugestão com confirmação humana
- [x] 5. Dados e tempo: America/Fortaleza nas telas e no CSV, conflito 409 por `versao` (+ aviso e recarregar no frontend), embeddings sem corrida, remoção lógica de órgão com achados todos excluídos
- [x] 6. README, ROTEIRO_DEMO (com convite), PROGRESSO e AUDITORIA atualizados (seção 11 "Estado após correções")
- [x] 7. Verificação final: 149 testes, CI verde, e roteiro no navegador (Chromium + Playwright em pasta temporária, banco temporário) com 19/19 verificações — prints em `docs/prints/final-*.png`

### Como o ambiente local mudou
- `backend/.env` (não versionado) precisa de `JWT_SECRET` forte e `CODIGO_CONVITE`; o `.env` local deste computador foi atualizado (segredo aleatório novo; convite de demonstração `saac-convite-2026`). Tokens antigos deixam de valer (basta entrar de novo).
- Bancos existentes são migrados sozinhos (colunas `achados.versao` e `orgaos.excluido_em`).
