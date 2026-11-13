#!/usr/bin/env node
// Hook SessionStart: contexto curto de onde o projeto está (fase, git, aprendizados recentes).
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadIndex } from '../rag/lib.mjs';

const sh = (c) => { try { return execSync(c, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
try {
  const roadmap = existsSync(join(ROOT, 'harness/workflows/roadmap.md')) ? readFileSync(join(ROOT, 'harness/workflows/roadmap.md'), 'utf8') : '';
  const fase = roadmap.match(/Fase atual:\s*\*\*(.+?)\*\*/)?.[1] ?? 'ver harness/workflows/roadmap.md';
  const branch = sh('git rev-parse --abbrev-ref HEAD') || 'sem commits';
  const changed = sh('git status --porcelain').split('\n').filter(Boolean).length;
  const dir = join(ROOT, 'knowledge/aprendizados');
  const recentes = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse().slice(0, 5)
        .map((f) => '- ' + (readFileSync(join(dir, f), 'utf8').match(/^# (.+)/m)?.[1] ?? f))
    : [];
  const idx = loadIndex(); // reconstrói o índice do RAG se o knowledge mudou
  const ctx = [
    `Universo Folks — ${fase}. Branch: ${branch} (${changed} arquivo(s) alterado(s)).`,
    `RAG: ${idx.docs.length} trechos de ${idx.files.length} arquivos indexados (npm run rag:query -- "<termo>").`,
    'Leia CLAUDE.md. Use os agentes de agents/ e as skills de skills/; o tech-lead orquestra tarefas com mais de um passo.',
    recentes.length ? `Aprendizados recentes (não repita):\n${recentes.join('\n')}` : '',
  ].filter(Boolean).join('\n');
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx } }));
} catch (e) {
  process.stderr.write(`session-context: ${e?.message ?? e}\n`);
}
process.exit(0);
