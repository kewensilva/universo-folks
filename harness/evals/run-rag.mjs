#!/usr/bin/env node
// Eval de recuperação do RAG: para cada pergunta, o arquivo esperado aparece no top-k?
// Métricas: hit@1, hit@3, hit@5 e MRR. Uso: node harness/evals/run-rag.mjs [--min-hit3 0.85] [--verbose]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, search } from '../rag/lib.mjs';

const args = process.argv.slice(2);
const minIdx = args.indexOf('--min-hit3');
const minHit3 = minIdx >= 0 ? Number(args[minIdx + 1]) : null;
const verbose = args.includes('--verbose');
const cases = JSON.parse(readFileSync(join(ROOT, 'harness/evals/rag-cases.json'), 'utf8'));

let h1 = 0, h3 = 0, h5 = 0, mrr = 0;
const misses = [];
for (const c of cases) {
  const re = new RegExp(c.expect);
  const hits = search(c.q, { k: 5 });
  // várias seções do mesmo arquivo contam como um resultado
  const files = [...new Set(hits.map((h) => h.file))];
  const rank = files.findIndex((f) => re.test(f)) + 1;
  if (rank === 1) h1++;
  if (rank >= 1 && rank <= 3) h3++;
  if (rank >= 1) { h5++; mrr += 1 / rank; }
  if (rank === 0 || rank > 3) misses.push({ q: c.q, expect: c.expect, got: files.slice(0, 3) });
  if (verbose) console.log(`${rank && rank <= 3 ? '✔' : '✘'} [${rank || '-'}] ${c.q}`);
}
const n = cases.length;
const report = { at: new Date().toISOString(), cases: n, hit1: +(h1 / n).toFixed(3), hit3: +(h3 / n).toFixed(3), hit5: +(h5 / n).toFixed(3), mrr: +(mrr / n).toFixed(3), misses };
mkdirSync(join(ROOT, 'harness/evals/reports'), { recursive: true });
writeFileSync(join(ROOT, 'harness/evals/reports/rag-latest.json'), JSON.stringify(report, null, 2));
console.log(`RAG eval: ${n} casos — hit@1 ${report.hit1} · hit@3 ${report.hit3} · hit@5 ${report.hit5} · MRR ${report.mrr}`);
for (const m of misses) console.log(`  ✘ "${m.q}" esperado /${m.expect}/ → ${m.got.join(', ') || 'nada'}`);
if (minHit3 !== null && report.hit3 < minHit3) {
  console.log(`✘ hit@3 ${report.hit3} abaixo do mínimo ${minHit3}`);
  process.exit(1);
}
