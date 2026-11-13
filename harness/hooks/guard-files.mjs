#!/usr/bin/env node
// Hook PreToolUse (Edit|Write|MultiEdit): protege arquivos sensíveis.
//  - .env (segredos): bloqueado
//  - migração Prisma já existente: bloqueado (crie uma nova)
//  - requisitos originais do cliente: pede confirmação
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const deny = (why, ask = false) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: ask ? 'ask' : 'deny', permissionDecisionReason: `[harness/guard-files] ${why}` } }));
  process.exit(0);
};

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const file = String(input?.tool_input?.file_path ?? input?.tool_input?.notebook_path ?? '');
  if (!file) process.exit(0);
  const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const rel = relative(root, resolve(root, file)).replace(/\\/g, '/');

  if (/(^|\/)\.env(\.(local|production|development|test))?$/.test(rel)) deny('Não edite .env (segredos). Atualize o .env.example e peça ao usuário para preencher o valor.');
  if (/prisma\/migrations\/[^/]+\/migration\.sql$/.test(rel) && existsSync(resolve(root, rel))) {
    deny('Migração já existente não pode ser editada (pode já ter sido aplicada). Crie uma nova com a skill migracao-prisma-segura.');
  }
  if (rel === 'knowledge/produto/requisitos-originais.md' || rel === 'arquitetura.md') {
    deny('Este é o texto original do cliente. Registre mudanças em knowledge/produto/decisoes-do-cliente.md. Editar mesmo assim?', true);
  }
} catch (e) {
  process.stderr.write(`guard-files: ${e?.message ?? e}\n`);
}
process.exit(0);
