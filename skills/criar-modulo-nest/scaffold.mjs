#!/usr/bin/env node
// Gera um módulo NestJS no padrão do projeto em apps/api/src/<nome>.
// Uso: node skills/criar-modulo-nest/scaffold.mjs <nome-kebab> [--tenant] [--out apps/api/src]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--out');
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('uso: node skills/criar-modulo-nest/scaffold.mjs <nome-kebab> [--tenant] [--out apps/api/src]');
  process.exit(1);
}
const tenant = args.includes('--tenant');
const outIdx = args.indexOf('--out');
const outBase = outIdx >= 0 ? args[outIdx + 1] : join(here, '..', '..', 'apps', 'api', 'src');
const Name = name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');
const vars = {
  __Name__: Name,
  __name__: name,
  __route__: name,
  __routePrefix__: tenant ? `companies/:tenant/${name}` : `master/${name}`,
  __roles__: tenant ? "'ADMIN_CLIENTE', 'MASTER_FOLKS'" : "'MASTER_FOLKS'",
  __tenantParam__: tenant ? ", @Param('tenant') t: string" : '',
  __tenantArg__: tenant ? ', t' : '',
  __tenantSig__: tenant ? ', param: string' : '',
  __tenantResolve__: tenant ? 'const tenantId = this.tenantId(user, param);\n    void tenantId;' : '',
  __auditTenant__: tenant ? ', tenantId' : '',
};
const dir = join(outBase, name);
if (existsSync(dir)) {
  console.error(`já existe: ${dir}`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
const files = { 'module.ts.tpl': `${name}.module.ts`, 'controller.ts.tpl': `${name}.controller.ts`, 'service.ts.tpl': `${name}.service.ts`, 'dto.ts.tpl': `${name}.dto.ts`, 'service.spec.ts.tpl': `${name}.service.spec.ts` };
for (const [tpl, out] of Object.entries(files)) {
  let s = readFileSync(join(here, 'templates', tpl), 'utf8');
  for (const [k, v] of Object.entries(vars)) s = s.split(k).join(v);
  writeFileSync(join(dir, out), s);
}
console.log(`✔ módulo ${Name} criado em ${dir}\n  próximo: registrar ${Name}Module no app.module.ts e implementar os TODOs`);
