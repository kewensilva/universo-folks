# Workflow: correção de bug

> tags: workflow, bug, correção, incidente, regressão

1. **Reproduzir** (qa-testes): teste mínimo que falha. Sem reprodução não há correção.
2. **Causa raiz** (especialista do módulo): por que aconteceu? A regra estava errada no código, no conhecimento ou faltava?
3. **Corrigir** com a menor mudança que resolve a causa, não o sintoma.
4. **Provar:** o teste da etapa 1 passa; `npm run gates` verde; não houve regressão.
5. **Aprender:** `registrar-aprendizado` com a regra geral (ex.: "limites por tempo não podem ter folga cumulativa"). Se o bug era plausível para um agente, crie um caso em `harness/evals/cases/`.
