#!/usr/bin/env node
// Busca no conhecimento do projeto: npm run rag:query -- "cota de administradores" [--k 5] [--json]
import { search } from './lib.mjs';
const args = process.argv.slice(2);
const json = args.includes('--json');
const kIdx = args.indexOf('--k');
const k = kIdx >= 0 ? Number(args[kIdx + 1]) : 5;
const query = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--k').join(' ');
if (!query) {
  console.error('uso: npm run rag:query -- "sua pergunta" [--k 5] [--json]');
  process.exit(1);
}
const hits = search(query, { k });
if (json) {
  console.log(JSON.stringify(hits, null, 2));
} else if (!hits.length) {
  console.log('Nenhum trecho relevante. Considere registrar esse conhecimento em knowledge/.');
} else {
  for (const h of hits) {
    console.log(`\n▸ [${h.score}] ${h.file} — ${h.heading}`);
    console.log(h.text.split('\n').filter(Boolean).slice(0, 12).map((l) => `  ${l}`).join('\n'));
  }
}
