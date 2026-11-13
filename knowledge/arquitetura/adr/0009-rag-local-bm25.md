# ADR 0009 — RAG local (BM25) sobre knowledge/ para guiar os agentes

> tags: adr, rag, conhecimento, bm25, busca, harness, agentes | status: aceita | data: 2026-11-09

## Contexto
Os agentes precisam das regras de negócio certas no momento certo, sem colar tudo no contexto.

## Decisão
- Índice **BM25** local em Node, sem dependências nem serviço externo. O conteúdo de `knowledge/` é dividido por seção (`##`/`###`) e o texto é normalizado (sem acentos, sem stopwords, com stemming leve).
- O hook `UserPromptSubmit` busca pelo texto do pedido e injeta os trechos mais relevantes como contexto, com a fonte de cada um.
- O índice é **reconstruído automaticamente** quando algum arquivo de `knowledge/` muda.
- Qualidade medida por `npm run rag:eval` (hit@k e MRR sobre casos reais).

## Evolução prevista
Se o corpus crescer muito ou a busca por palavra-chave falhar nos evals, adicionar embeddings (ex.: pgvector + modelo de embedding) mantendo a mesma interface `query(texto, k)`.
