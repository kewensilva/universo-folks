#!/usr/bin/env node
// Hook PreToolUse (Bash): bloqueia comandos destrutivos ou que exponham segredos.
// Decisão "deny" volta para o agente com o motivo; "ask" pede confirmação ao usuário.
import { readFileSync } from 'node:fs';

const RULES = [
  { re: /\bprisma\s+migrate\s+reset\b/, why: 'prisma migrate reset apaga todos os dados. Use a skill migracao-prisma-segura.' },
  { re: /\bprisma\s+db\s+push\b.*--(force-reset|accept-data-loss)/, why: 'db push com perda de dados não é permitido.' },
  { re: /\bdrop\s+database\b(?!\s+(if\s+exists\s+)?universo_folks_test_[a-z0-9_]+\b)/i, why: 'DROP DATABASE só é permitido em bancos universo_folks_test_<sufixo> (use skills/testes-e2e/banco-teste.sh remover).' },
  { re: /\bdrop\s+schema\b[^;]*\bcascade\b/i, why: 'DROP SCHEMA ... CASCADE apaga tudo do schema. Peça confirmação ao usuário.', ask: true },
  { re: /\btruncate\s+(table\s+)?["\w]/i, why: 'TRUNCATE apaga dados. Peça confirmação ao usuário.', ask: true },
  { re: /\bdocker(\s+compose|-compose)\s+down\b[^|;&]*\s-v\b|\bdocker\s+volume\s+(rm|prune)\b|\bdocker\s+system\s+prune\b/, why: 'Isto remove volumes/dados do Docker.' },
  { re: /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+(\/|~|\.\/?|\*|\$HOME)(\s|$)/, why: 'rm -rf em raiz/home/diretório atual não é permitido.' },
  { re: /\brm\s+-[a-z]*r[a-z]*\s+(\.\/)?(knowledge|agents|skills|harness|apps|packages|backend|\.git)(\/)?(\s|$)/, why: 'Remover pastas centrais do projeto exige confirmação do usuário.', ask: true },
  { re: /\bgit\s+push\b.*(--force\b|-f\b|--force-with-lease)/, why: 'push forçado reescreve histórico remoto.', ask: true },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/, why: 'Descarta alterações locais de forma irreversível.', ask: true },
  { re: /\b(cat|less|more|head|tail|bat|nl|strings|grep|awk|sed)\b[^|;&]*(^|[\s/'"])\.env(\.(local|production|development|test))?(?=$|[\s'";|&])/, why: 'Não leia o .env (segredos). Use o .env.example para saber as variáveis.' },
  { re: /\b(printenv|env)\s*($|\|)/, why: 'Não liste variáveis de ambiente (podem conter segredos).' },
];

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const cmd = String(input?.tool_input?.command ?? '');
  for (const r of RULES) {
    if (r.re.test(cmd)) {
      const out = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: r.ask ? 'ask' : 'deny',
          permissionDecisionReason: `[harness/guard-bash] ${r.why}`,
        },
      };
      process.stdout.write(JSON.stringify(out));
      process.exit(0);
    }
  }
} catch (e) {
  process.stderr.write(`guard-bash: ${e?.message ?? e}\n`);
}
process.exit(0);
