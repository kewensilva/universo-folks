#!/usr/bin/env node
// Quality gates: roda typecheck/lint/test dos workspaces alterados + checagens globais do harness.
//   node harness/quality-gates/run.mjs            (só o que mudou no git)
//   node harness/quality-gates/run.mjs --all      (tudo)
// A v0 (backend/) não entra nos gates: é referência congelada.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../rag/lib.mjs';

const cfg = JSON.parse(readFileSync(join(ROOT, 'harness/quality-gates/config.json'), 'utf8'));
const all = process.argv.includes('--all');
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log(...a); };

function changedPaths() {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT }).toString();
    return out.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
  } catch {
    return null; // sem git: roda tudo
  }
}
const changed = all ? null : changedPaths();
const touched = (prefix) => changed === null || changed.some((p) => p === prefix || p.startsWith(prefix.endsWith('/') ? prefix : prefix + '/') || p.startsWith(prefix));

const results = [];
const run = (name, cmd, args, cwd) => {
  const t = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 240_000 });
  const ok = r.status === 0;
  results.push({ name, ok, ms: Date.now() - t, out: ok ? '' : `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n') });
  log(`${ok ? '✔' : '✘'} ${name} (${Date.now() - t} ms)`);
};

for (const ws of cfg.workspaces) {
  const pkgFile = join(ROOT, ws, 'package.json');
  if (!existsSync(pkgFile) || !touched(ws)) continue;
  const scripts = JSON.parse(readFileSync(pkgFile, 'utf8')).scripts ?? {};
  for (const step of cfg.steps) if (scripts[step]) run(`${ws} › ${step}`, 'npm', ['run', '-s', step], join(ROOT, ws));
}
for (const g of cfg.global) {
  if (g.when.some((w) => touched(w))) run(g.name, g.cmd[0] === 'node' ? process.execPath : g.cmd[0], g.cmd.slice(1), ROOT);
}

const failed = results.filter((r) => !r.ok);
if (!results.length) log('Nenhum gate aplicável às mudanças atuais.');
for (const f of failed) console.log(`\n✘ ${f.name}\n${f.out}`);
if (results.length) log(`\n${results.length - failed.length}/${results.length} gates verdes`);
process.exit(failed.length ? 1 : 0);
