#!/usr/bin/env node
// Exporta o dataset de feedback em formato de chat (JSONL), para:
//  - fine-tuning de um modelo próprio (ex.: modelo do produto) ou
//  - few-shot / evals de comportamento dos agentes.
// npm run feedback:export [-- --out harness/feedback/export/chat.jsonl]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from '../rag/lib.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = join(ROOT, outIdx >= 0 ? args[outIdx + 1] : 'harness/feedback/export/chat.jsonl');
const src = join(ROOT, 'harness/feedback/dataset.jsonl');
if (!existsSync(src)) { console.log('dataset vazio'); process.exit(0); }
const SYSTEM = 'Você é um engenheiro sênior do projeto Universo Folks. Responda seguindo as regras de negócio e os aprendizados do projeto.';
const rows = readFileSync(src, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const lines = rows.map((r) => JSON.stringify({
  messages: [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `${r.contexto}\nAbordagem proposta: ${r.errado}\nEstá correto? Como fazer?` },
    { role: 'assistant', content: `Não. ${r.correto}\nRegra: ${r.regra}` },
  ],
  metadata: { titulo: r.titulo, tags: r.tags, origem: r.origem, data: r.data },
}));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n') + '\n');
console.log(`✔ ${lines.length} exemplos exportados para ${out.slice(ROOT.length + 1)}`);
