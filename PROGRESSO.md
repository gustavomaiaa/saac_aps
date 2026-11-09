# PROGRESSO — Sprint V (SAAC)

Checklist para retomar o trabalho. Atualizado a cada etapa.

- [x] Etapa 1 — Dashboard com dados reais (views, GET /api/dashboard, dashboard.html)
- [ ] Etapa 2 — Filtros, busca e paginação
- [ ] Etapa 3 — Exclusão lógica de achados
- [ ] Etapa 4 — IA local com Ollama
- [ ] Etapa 5 — Histórico e desfazer (Memento)
- [ ] Etapa 6 — Exportação CSV e relatório
- [ ] Etapa 7 — Permissões e sessão
- [ ] Etapa 8 — Testes, seed e documentação
- [ ] Etapa 9 — Polimento e verificação final

## Observações
- Ollama está instalado nesta máquina com `llama3.2:3b` (testes automatizados usam servidor falso mesmo assim).
- `server.js` exporta o `app` (sem `listen` quando importado) e `db.js` aceita `SAAC_DB_PATH` — usado pelos testes (`backend/tests/`).
