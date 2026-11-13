#!/usr/bin/env node
// Evals de comportamento dos agentes. Cada caso roda o Claude Code em modo headless
// (`claude -p`) numa CÓPIA descartável do repositório e verifica o resultado.
// Requer o CLI `claude` no PATH. Custa tokens: rode sob demanda (npm run evals [-- <id>]).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../rag/lib.mjs';

const which = spawnSync('bash', ['-lc', 'command -v claude'], { encoding: 'utf8' });
if (which.status !== 0) {
  console.log('⚠ CLI `claude` não encontrado no PATH — evals de agentes não executados.');
  console.log('  Instale o Claude Code CLI (npm i -g @anthropic-ai/claude-code) e rode: npm run evals');
  process.exit(0);
}
const filter = process.argv[2];
const casesDir = join(ROOT, 'harness/evals/cases');
const cases = readdirSync(casesDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(casesDir, f), 'utf8'))).filter((c) => !filter || c.id.includes(filter));
const sha = (p) => (existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex') : null);

const results = [];
for (const c of cases) {
  const work = mkdtempSync(join(tmpdir(), `folks-eval-${c.id}-`));
  cpSync(ROOT, work, { recursive: true, filter: (src) => !/node_modules|\/\.git\/|\/dist\/|harness\/evals\/reports/.test(src) });
  const before = Object.fromEntries((c.checks.filter((k) => k.type === 'fileUnchanged')).map((k) => [k.path, sha(join(work, k.path))]));
  console.log(`▶ ${c.id} — ${c.objetivo}`);
  const r = spawnSync('claude', ['-p', c.prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits', '--max-turns', '25'], { cwd: work, encoding: 'utf8', timeout: 900_000 });
  let response = '';
  let transcript = r.stdout ?? '';
  try { response = JSON.parse(r.stdout).result ?? ''; } catch { response = r.stdout ?? ''; }
  const checks = c.checks.map((k) => {
    let ok = false;
    if (k.type === 'responseMatches') ok = new RegExp(k.pattern, 'i').test(response);
    if (k.type === 'transcriptNotMatches') ok = !new RegExp(k.pattern, 'i').test(transcript);
    if (k.type === 'fileUnchanged') ok = before[k.path] === sha(join(work, k.path));
    if (k.type === 'commandSucceeds') ok = spawnSync('bash', ['-lc', k.cmd], { cwd: work }).status === 0;
    return { ...k, ok };
  });
  const pass = checks.every((k) => k.ok);
  for (const k of checks) console.log(`   ${k.ok ? '✔' : '✘'} ${k.descricao}`);
  results.push({ id: c.id, pass, checks, response: response.slice(0, 2000) });
  rmSync(work, { recursive: true, force: true });
}
mkdirSync(join(ROOT, 'harness/evals/reports'), { recursive: true });
writeFileSync(join(ROOT, 'harness/evals/reports/agents-latest.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const passed = results.filter((r) => r.pass).length;
console.log(`\nEvals de agentes: ${passed}/${results.length} passaram`);
process.exit(passed === results.length ? 0 : 1);
