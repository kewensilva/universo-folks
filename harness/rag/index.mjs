#!/usr/bin/env node
// Reconstrói o índice do RAG: npm run rag:index
import { buildIndex } from './lib.mjs';
const t = Date.now();
const idx = buildIndex();
console.log(`✔ índice RAG: ${idx.files.length} arquivos, ${idx.docs.length} trechos, ${Object.keys(idx.df).length} termos (${Date.now() - t} ms)`);
