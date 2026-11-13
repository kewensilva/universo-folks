---
name: entregar-feature
description: Checklist final antes de dizer ao usuário que uma tarefa de código está pronta - roda quality gates, confere testes da regra, atualiza conhecimento, registra aprendizados e monta o resumo de entrega honesto. Use ao fim de toda feature ou correção.
---

# Entregar uma feature

1. `npm run gates` verde (o hook Stop também roda; não contorne).
2. Os testes da regra passaram. Anote **N/N** e liste o que ficou sem cobertura.
3. Revisões: `seguranca-multitenant` (se tocou empresa, auth, pagamento ou dado pessoal) e `revisor-codigo`.
4. Conhecimento:
   - regra ou decisão nova em `knowledge/` (`documentador`);
   - `npm run rag:eval` sem regressão; se o assunto é novo, adicione um caso de RAG.
5. Teve correção do usuário ou bug revelador? `registrar-aprendizado`.
6. Resumo ao usuário (pt-BR):
   - **O que mudou** (comportamento, não arquivos);
   - **Como foi verificado** (números reais);
   - **O que não foi verificado / fica pendente**;
   - **Decisões que dependem do usuário** (uma pergunta por vez).
