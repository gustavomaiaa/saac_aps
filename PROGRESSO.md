# PROGRESSO — Sprint V (SAAC)

Checklist para retomar o trabalho.

- [x] Etapa 1 — Dashboard com dados reais (views, GET /api/dashboard, dashboard.html)
- [x] Etapa 2 — Filtros, busca e paginação
- [x] Etapa 3 — Exclusão lógica de achados
- [x] Etapa 4 — IA local com Ollama (recomendação, padrões, status, métricas)
- [x] Etapa 5 — Histórico e desfazer (Memento)
- [x] Etapa 6 — Exportação CSV e relatório imprimível
- [x] Etapa 7 — Permissões (admin/auditor) e sessão (401 → login)
- [x] Etapa 8 — Testes (55 passando), seed e README
- [x] Etapa 9 — Polimento e verificação do zero
- [ ] Opcional — AuditoriaFacade (não feita)

## Observações
- Ollama está instalado nesta máquina com `llama3.2:3b`; os testes automatizados usam um servidor falso (`backend/tests/fake-ollama.js`).
- Tempo de resposta da IA nesta máquina: recomendação ~12–15s (1ª chamada, carga do modelo), análise de padrões ~4–6s.
- Verificação do zero (saac.db apagado → npm install → npm start → npm run seed → fluxo completo pela API com o Ollama real): OK.
  O banco antigo de desenvolvimento foi movido para a pasta temporária da sessão (não está no repositório).
- Mudança de comportamento: token inválido/expirado agora responde 401 (antes 403) para o frontend limpar a sessão; 403 ficou para permissão.

## Pendente de teste manual (navegador)
- Percorrer visualmente as telas: botão "Gerar com IA" (carregando, Aceitar/Descartar), card "Análise de padrões", métricas, desfazer no modal de edição, Exportar CSV (download), relatorio.html (Imprimir / salvar PDF) e layout em tela estreita.
- Comportamento com o Ollama desligado no navegador (a API já é coberta por testes: 503 com a mensagem esperada).
