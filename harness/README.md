# Harness de desenvolvimento

O harness é a engrenagem que faz um time de agentes produzir software com qualidade **consistente**. Ele atua em quatro frentes:

```
            ┌──────────────── contexto ────────────────┐
 pedido ──► │ RAG (rag-context)   SessionStart (fase,  │ ──► agente (agents/) usando skills (skills/)
            │ knowledge/ → trechos aprendizados)       │            │
            └──────────────────────────────────────────┘            ▼
            ┌──────────────── guardas ─────────────────┐     ferramentas (Bash/Edit/Write)
            │ guard-bash (destrutivo, segredos)        │ ◄──────────┘
            │ guard-files (.env, migração aplicada)    │
            └──────────────────────────────────────────┘
            ┌──────────────── qualidade ───────────────┐
            │ Stop → quality-gates (typecheck/lint/    │ ──► falhou? o agente continua e corrige
            │ test do que mudou + harness:check + RAG) │
            └──────────────────────────────────────────┘
            ┌──────────────── aprendizado ─────────────┐
            │ feedback → knowledge/aprendizados (RAG)  │ ──► dataset.jsonl → evals / fine-tuning
            │ evals: RAG (hit@k, MRR) + agentes        │
            └──────────────────────────────────────────┘
```

| Pasta | Conteúdo |
|---|---|
| `hooks/` | `rag-context` (UserPromptSubmit), `session-context` (SessionStart), `guard-bash` e `guard-files` (PreToolUse), `stop-gates` (Stop). Registrados em `.claude/settings.json`. |
| `rag/` | Motor BM25 sem dependências: `lib.mjs`, `index.mjs`, `query.mjs`, `config.json`. O índice é reconstruído quando o knowledge muda. |
| `quality-gates/` | `run.mjs` + `config.json`: gates por workspace alterado + globais. |
| `evals/` | `rag-cases.json` + `run-rag.mjs` (qualidade da recuperação, roda offline) e `cases/` + `run-agents.mjs` (comportamento dos agentes via `claude -p`). |
| `feedback/` | `registrar.mjs` (aprendizado → knowledge + dataset) e `exportar-dataset.mjs` (JSONL para fine-tuning e few-shot). |
| `workflows/` | `feature.md`, `bugfix.md`, `definition-of-done.md`, `roadmap.md`. |
| `ci/` | Template do GitHub Actions. |
| `check.mjs` | Valida agentes, skills, hooks e knowledge (`npm run harness:check`). |

## Sobre "fine-tuning" neste projeto
Os modelos do Claude usados no Claude Code **não são re-treinados** por nós. O ajuste do comportamento acontece em três camadas, da mais rápida para a mais lenta:
1. **Contexto (instantâneo):** cada aprendizado registrado vira um documento em `knowledge/aprendizados/`, que o RAG injeta quando um pedido parecido aparece.
2. **Instrução (por versão):** padrões recorrentes viram regra nos agentes e nas skills (prompt tuning versionado no git). Os evals medem se melhorou.
3. **Pesos (opcional, futuro):** `dataset.jsonl` exportado em formato de chat (`npm run feedback:export`) serve para fine-tuning de um modelo próprio. Por exemplo, um modelo do produto que gere questões, ou como few-shot.
