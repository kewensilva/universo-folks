---
name: consultar-conhecimento
description: Busca regras de negócio, decisões do cliente, ADRs, contratos e aprendizados no knowledge/ do projeto (RAG local BM25). Use antes de implementar ou responder qualquer dúvida sobre como o Universo Folks deve funcionar, e quando o contexto injetado automaticamente não bastar.
---

# Consultar o conhecimento do projeto

O hook `UserPromptSubmit` já injeta os trechos mais relevantes do pedido. Use esta skill para **aprofundar**.

## Passos
1. Formule 2 ou 3 buscas com sinônimos do domínio (veja `knowledge/dominio/glossario.md`):
   ```bash
   npm run rag:query -- "cota de administradores por empresa" --k 6
   npm run rag:query -- "limite licença admin" --k 6
   ```
2. Abra o arquivo completo dos melhores resultados (`Read`). O trecho é só a porta de entrada.
3. Aplique a precedência: `decisoes-do-cliente.md` (o mais recente vence) → ADRs aceitas → `regras-de-negocio.md` → protótipo → requisitos originais → código v0.
4. Cite a fonte na resposta ou no código (comentário curto com a ADR ou regra quando não for óbvio).

## Se não encontrar
- A regra **não existe** no conhecimento: não invente. Pergunte ao usuário (se mudar o produto) ou registre a suposição como pendência.
- Depois que a resposta vier, peça ao `documentador` para registrar e adicione um caso em `harness/evals/rag-cases.json` com essa pergunta.

## Saída JSON (para scripts)
`npm run rag:query -- "<pergunta>" --json` → `[{ score, file, heading, text }]`
