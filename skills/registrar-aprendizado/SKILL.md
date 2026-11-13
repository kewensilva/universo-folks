---
name: registrar-aprendizado
description: Registra um erro corrigido, uma correção do usuário ou uma pegadinha descoberta, para o time não repetir. Grava em knowledge/aprendizados/ (entra no RAG na hora) e no dataset harness/feedback/dataset.jsonl (base para fine-tuning e evals). Use sempre que o usuário corrigir algo ou um bug revelar uma regra não óbvia.
---

# Registrar aprendizado (ciclo de feedback)

É assim que o time "aprende" entre sessões:
- **Imediatamente:** o aprendizado vira um documento em `knowledge/aprendizados/`, que o RAG recupera em pedidos futuros parecidos (ajuste por contexto).
- **A médio prazo:** o par *situação → resposta correta* entra no `dataset.jsonl`, que alimenta os evals e pode ser exportado para fine-tuning de modelos (`npm run feedback:export`).

## Quando usar
- O usuário corrigiu uma decisão, um comportamento ou uma interpretação.
- Um teste revelou um bug que poderia se repetir (ex.: limite acumulando a cada chamada).
- Uma ferramenta tem uma pegadinha de ambiente (ex.: `prisma migrate dev` não interativo).

## Como
```bash
npm run feedback -- \
  --titulo "Anti-pulo acumulava folga a cada chamada" \
  --contexto "Progresso de vídeo com limite de avanço por tempo real" \
  --errado "Somar 15s de folga em toda chamada (chamadas seguidas acumulavam tempo)" \
  --correto "Folga só no primeiro envio; depois no máximo 2× o tempo real decorrido" \
  --regra "Limites por tempo nunca podem ter folga cumulativa por requisição" \
  --tags "vídeo,anti-pulo,segurança" \
  --origem teste
```
`--origem`: `usuario` (correção do usuário), `teste`, `revisao` ou `incidente`.

## Depois
- Se o aprendizado muda uma regra de produto, atualize também `knowledge/produto/` (agente `documentador`).
- Se é um comportamento que agentes erram com frequência, crie um caso em `harness/evals/cases/`.
