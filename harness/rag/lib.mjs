// RAG local do harness: BM25 sobre markdown, sem dependências.
// Ver knowledge/arquitetura/adr/0009-rag-local-bm25.md
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'harness/rag/config.json'), 'utf8'));
const INDEX_DIR = join(ROOT, 'harness/rag/.index');
const INDEX_FILE = join(INDEX_DIR, 'index.json');

// ------------------------------------------------------------- texto
const STOP = new Set(
  ('a o as os um uma uns umas de do da dos das em no na nos nas por para pra com sem sob sobre ao aos à às e ou mas que se ' +
    'como quando onde qual quais quem cujo isso isto esse essa este esta aquele aquela ele ela eles elas eu voce você nos ' +
    'seu sua seus suas meu minha mais menos muito muita ja já nao não sim ser estar ter ha há foi era sao são esta está ' +
    'fazer faz pode deve tem tambem também so só entre ate até cada todo toda todos todas outro outra mesmo mesma ' +
    'the of and to in is for on with be by it this that are as or an at from').split(/\s+/),
);

export function normalize(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Stemming leve para pt-BR (reduz plural e sufixos comuns). */
function stem(t) {
  if (t.length <= 3) return t;
  for (const s of ['amentos', 'imentos', 'amento', 'imento', 'acoes', 'icoes', 'mente', 'acao', 'icao', 'ados', 'idas', 'idos', 'adas', 'ores', 'oes', 'aes', 'ais', 'eis', 'ado', 'ida', 'ido', 'ada', 'ar', 'er', 'ir', 'es', 's']) {
    if (t.endsWith(s) && t.length - s.length >= 3) return t.slice(0, -s.length);
  }
  return t;
}

export function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

// ------------------------------------------------------------ corpus
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

export function corpusFiles() {
  const files = new Set();
  for (const src of CONFIG.sources) {
    const p = join(ROOT, src);
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) walk(p).forEach((f) => files.add(f));
    else files.add(p);
  }
  return [...files].sort();
}

/** Divide um markdown em seções (## / ###), mantendo título do documento e trilha de cabeçalhos. */
export function chunkMarkdown(file, text) {
  const rel = relative(ROOT, file);
  const lines = text.split('\n');
  const docTitle = (lines.find((l) => l.startsWith('# ')) ?? `# ${rel}`).slice(2).trim();
  const tagsLine = lines.find((l) => /^>\s*tags:/i.test(l)) ?? '';
  const tags = tagsLine.replace(/^>\s*tags:\s*/i, '').split('|')[0];
  const chunks = [];
  let heading = [docTitle];
  let buf = [];
  const flush = () => {
    // a linha de tags já entra no índice com peso próprio; não vira trecho sozinha
    const body = buf.filter((l) => !/^>\s*tags:/i.test(l)).join('\n').trim();
    buf = [];
    if (!body) return;
    // seções muito longas viram janelas com sobreposição
    const max = CONFIG.chunkMaxChars;
    for (let i = 0; i < body.length; i += max - CONFIG.chunkOverlapChars) {
      const piece = body.slice(i, i + max);
      chunks.push({ id: `${rel}#${chunks.length}`, file: rel, title: docTitle, heading: heading.join(' › '), tags, text: piece });
      if (i + max >= body.length) break;
    }
  };
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence;
    const m = !inFence && line.match(/^(#{2,3})\s+(.*)/);
    if (m) {
      flush();
      heading = m[1].length === 2 ? [docTitle, m[2].trim()] : [heading[0], heading[1] ?? '', m[2].trim()].filter(Boolean);
      continue;
    }
    if (line.startsWith('# ')) continue;
    buf.push(line);
  }
  flush();
  return chunks;
}

// ------------------------------------------------------------ índice
function fingerprint(files) {
  const h = createHash('sha1');
  for (const f of files) h.update(`${f}:${statSync(f).mtimeMs}:${statSync(f).size}`);
  h.update(JSON.stringify(CONFIG));
  return h.digest('hex');
}

export function buildIndex() {
  const files = corpusFiles();
  const docs = files.flatMap((f) => chunkMarkdown(f, readFileSync(f, 'utf8')));
  const df = {};
  const postings = docs.map((d) => {
    // título, cabeçalho e tags pesam mais que o corpo
    const tokens = [
      ...tokenize(d.title).flatMap((t) => Array(CONFIG.boost.title).fill(t)),
      ...tokenize(d.heading).flatMap((t) => Array(CONFIG.boost.heading).fill(t)),
      ...tokenize(d.tags).flatMap((t) => Array(CONFIG.boost.tags).fill(t)),
      ...tokenize(d.text),
    ];
    const tf = {};
    for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
    for (const t of Object.keys(tf)) df[t] = (df[t] ?? 0) + 1;
    return { tf, len: tokens.length };
  });
  const avgLen = postings.reduce((a, p) => a + p.len, 0) / Math.max(1, postings.length);
  const index = { version: 1, fingerprint: fingerprint(files), builtAt: new Date().toISOString(), files: files.map((f) => relative(ROOT, f)), docs, postings, df, avgLen };
  mkdirSync(INDEX_DIR, { recursive: true });
  writeFileSync(INDEX_FILE, JSON.stringify(index));
  return index;
}

/** Carrega o índice e reconstrói se algum arquivo do corpus mudou. */
export function loadIndex() {
  const files = corpusFiles();
  if (existsSync(INDEX_FILE)) {
    const idx = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
    if (idx.fingerprint === fingerprint(files)) return idx;
  }
  return buildIndex();
}

// ------------------------------------------------------------- busca
export function search(query, { k = 5, minScore = 0 } = {}) {
  const idx = loadIndex();
  const q = [...new Set(tokenize(query))];
  const N = idx.docs.length;
  const { k1, b } = CONFIG.bm25;
  const scores = idx.postings.map((p, i) => {
    let s = 0;
    for (const t of q) {
      const f = p.tf[t];
      if (!f) continue;
      const idf = Math.log(1 + (N - idx.df[t] + 0.5) / (idx.df[t] + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * p.len) / idx.avgLen)));
    }
    return { i, s };
  });
  return scores
    .filter((x) => x.s > minScore)
    .sort((a, b2) => b2.s - a.s)
    .slice(0, k)
    .map(({ i, s }) => ({ score: Number(s.toFixed(3)), ...idx.docs[i] }));
}

export const ragConfig = CONFIG;
