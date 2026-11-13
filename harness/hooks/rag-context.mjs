#!/usr/bin/env node
// Hook UserPromptSubmit: busca no knowledge/ pelo texto do pedido e injeta os
// trechos mais relevantes como contexto adicional (RAG automático).
// Falha silenciosa: nunca bloqueia o pedido do usuário.
import { readFileSync } from 'node:fs';
import { search, ragConfig, tokenize } from '../rag/lib.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const prompt = String(input.prompt ?? '');
  const cfg = ragConfig.hook;
  if (tokenize(prompt).length < cfg.minPromptTokens) process.exit(0);

  const hits = search(prompt, { k: cfg.topK, minScore: cfg.minScore });
  if (!hits.length) process.exit(0);

  let budget = cfg.maxChars;
  const parts = [];
  for (const h of hits) {
    const text = h.text.trim();
    const piece = `### ${h.heading}\nFonte: ${h.file} (relevância ${h.score})\n${text.length > budget ? text.slice(0, budget) + '…' : text}`;
    budget -= piece.length;
    parts.push(piece);
    if (budget <= 200) break;
  }
  const additionalContext =
    `Conhecimento do projeto recuperado automaticamente (RAG sobre knowledge/). ` +
    `Use como fonte da verdade de negócio; se precisar de mais, rode \`npm run rag:query -- "<termo>"\`.\n\n` +
    parts.join('\n\n');
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }));
} catch (e) {
  process.stderr.write(`rag-context: ${e?.message ?? e}\n`);
  process.exit(0);
}
