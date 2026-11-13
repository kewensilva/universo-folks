#!/usr/bin/env node
// Hook Stop: antes de o agente encerrar, roda os quality gates do que mudou.
// Falhou -> exit 2 (o agente continua e corrige). Nunca entra em laço (stop_hook_active).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ROOT } from '../rag/lib.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  if (input.stop_hook_active) process.exit(0);
  execFileSync(process.execPath, ['harness/quality-gates/run.mjs', '--changed', '--quiet'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 280_000 });
  process.exit(0);
} catch (e) {
  if (e?.status === 1) {
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.toString().trim().split('\n').slice(-40).join('\n');
    process.stderr.write(`Quality gates falharam — corrija antes de encerrar (Definition of Done):\n${out}\n`);
    process.exit(2);
  }
  // erro do próprio harness (timeout, script ausente): não prende o agente
  process.stderr.write(`stop-gates: ${e?.message ?? e}\n`);
  process.exit(0);
}
