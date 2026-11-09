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
