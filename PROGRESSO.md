# PROGRESSO — Sprint V (SAAC)

Checklist para retomar o trabalho. Atualizado a cada etapa.

- [x] Etapa 1 — Dashboard com dados reais (views, GET /api/dashboard, dashboard.html)
- [x] Etapa 2 — Filtros, busca e paginação
- [x] Etapa 3 — Exclusão lógica de achados
- [x] Etapa 4 — IA local com Ollama
- [x] Etapa 5 — Histórico e desfazer (Memento)
- [x] Etapa 6 — Exportação CSV e relatório
- [ ] Etapa 7 — Permissões e sessão
- [ ] Etapa 8 — Testes, seed e documentação
- [ ] Etapa 9 — Polimento e verificação final

## Observações
- Ollama está instalado nesta máquina com `llama3.2:3b` (testes automatizados usam servidor falso mesmo assim).
- `server.js` exporta o `app` (sem `listen` quando importado) e `db.js` aceita `SAAC_DB_PATH` — usado pelos testes (`backend/tests/`).

### Etapa 4 (IA local)
- Testada com servidor falso (`backend/tests/ia.test.js`) e também manualmente contra o Ollama real desta máquina
  (llama3.2:3b): recomendação ~14,5s na 1ª chamada (carga do modelo), análise de padrões ~3,9s com o modelo já carregado.
- Pendente de teste manual: fluxo visual no navegador (botão "Gerar com IA", Aceitar/Descartar, card "Análise de padrões").
