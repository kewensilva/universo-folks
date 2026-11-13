#!/usr/bin/env node
// Registra um aprendizado: vira documento em knowledge/aprendizados/ (RAG) e linha em dataset.jsonl.
// npm run feedback -- --titulo "..." --contexto "..." --errado "..." --correto "..." --regra "..." [--tags "a,b"] [--origem usuario|teste|revisao|incidente]
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, buildIndex } from '../rag/lib.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || !args.length) {
  console.log('uso: npm run feedback -- --titulo "..." --contexto "..." --errado "..." --correto "..." --regra "..." [--tags "a,b"] [--origem usuario|teste|revisao|incidente]');
  process.exit(0);
}
const get = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const rec = {
  data: get('data') ?? new Date().toISOString().slice(0, 10),
  titulo: get('titulo'),
  contexto: get('contexto'),
  errado: get('errado'),
  correto: get('correto'),
  regra: get('regra'),
  tags: (get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
  origem: get('origem') ?? 'usuario',
};
for (const k of ['titulo', 'contexto', 'errado', 'correto', 'regra']) {
  if (!rec[k]) { console.error(`falta --${k}`); process.exit(1); }
}
if (!['usuario', 'teste', 'revisao', 'incidente'].includes(rec.origem)) { console.error('--origem inválida'); process.exit(1); }

const slug = rec.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const dir = join(ROOT, 'knowledge/aprendizados');
mkdirSync(dir, { recursive: true });
let file = join(dir, `${rec.data}-${slug}.md`);
for (let i = 2; existsSync(file); i++) file = join(dir, `${rec.data}-${slug}-${i}.md`);

writeFileSync(file, `# ${rec.titulo}

> tags: aprendizado, ${rec.tags.join(', ')} | origem: ${rec.origem} | data: ${rec.data}

## Regra
${rec.regra}

## Contexto
${rec.contexto}

## O que estava errado
${rec.errado}

## O que é correto
${rec.correto}
`);
appendFileSync(join(ROOT, 'harness/feedback/dataset.jsonl'), JSON.stringify({ ...rec, arquivo: file.slice(ROOT.length + 1) }) + '\n');
buildIndex();
console.log(`✔ aprendizado registrado: ${file.slice(ROOT.length + 1)} (RAG reindexado; dataset atualizado)`);
