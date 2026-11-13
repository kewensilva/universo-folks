#!/usr/bin/env node
// Valida a estrutura de desenvolvimento: agentes, skills, hooks, knowledge e links do Claude Code.
// npm run harness:check
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, corpusFiles } from './rag/lib.mjs';

const errors = [];
const warns = [];
const rel = (p) => relative(ROOT, p);

function frontmatter(file) {
  const s = readFileSync(file, 'utf8');
  const m = s.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { fm, body: s.slice(m[0].length) };
}

// ---- links que o Claude Code lê
for (const [link, target] of [['.claude/agents', 'agents'], ['.claude/skills', 'skills']]) {
  const p = join(ROOT, link);
  if (!existsSync(p)) errors.push(`${link} não existe (deveria apontar para ${target}/)`);
  else if (lstatSync(p).isSymbolicLink() && realpathSync(p) !== realpathSync(join(ROOT, target))) errors.push(`${link} aponta para o lugar errado`);
}

// ---- agentes
const KNOWN_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Agent', 'Task', 'NotebookEdit', 'TodoWrite']);
const agentNames = new Set();
for (const f of readdirSync(join(ROOT, 'agents')).filter((f) => f.endsWith('.md'))) {
  const file = join(ROOT, 'agents', f);
  const parsed = frontmatter(file);
  if (!parsed) { errors.push(`${rel(file)}: sem frontmatter`); continue; }
  const { fm, body } = parsed;
  if (fm.name !== f.replace(/\.md$/, '')) errors.push(`${rel(file)}: name "${fm.name}" difere do arquivo`);
  if (!fm.description || fm.description.length < 60) errors.push(`${rel(file)}: description ausente/curta (é ela que decide quando o agente é usado)`);
  if (fm.tools) for (const t of fm.tools.split(',').map((x) => x.trim())) if (!KNOWN_TOOLS.has(t)) warns.push(`${rel(file)}: ferramenta desconhecida "${t}"`);
  if (fm.model && !['opus', 'sonnet', 'haiku', 'inherit', 'fable'].includes(fm.model)) warns.push(`${rel(file)}: model "${fm.model}" incomum`);
  if (body.trim().length < 300) warns.push(`${rel(file)}: corpo muito curto`);
  agentNames.add(fm.name);
}

// ---- skills
const skillNames = new Set();
for (const d of readdirSync(join(ROOT, 'skills'))) {
  const dir = join(ROOT, 'skills', d);
  if (!statSync(dir).isDirectory()) continue;
  const file = join(dir, 'SKILL.md');
  if (!existsSync(file)) { errors.push(`skills/${d}: falta SKILL.md`); continue; }
  const parsed = frontmatter(file);
  if (!parsed) { errors.push(`${rel(file)}: sem frontmatter`); continue; }
  if (parsed.fm.name !== d) errors.push(`${rel(file)}: name "${parsed.fm.name}" difere da pasta`);
  if (!parsed.fm.description || parsed.fm.description.length < 60) errors.push(`${rel(file)}: description ausente/curta`);
  // referências a scripts da própria skill precisam existir
  for (const m of parsed.body.matchAll(/skills\/([a-z0-9-]+)\/([\w./-]+\.(?:mjs|sh|md))/g)) {
    if (!existsSync(join(ROOT, 'skills', m[1], m[2]))) errors.push(`${rel(file)}: referencia skills/${m[1]}/${m[2]} que não existe`);
  }
  skillNames.add(d);
}

// ---- referências cruzadas: agentes e skills citados nos textos existem?
const mentionRe = /`(tech-lead|especialista-dominio|arquiteto-software|dba-modelagem|backend-nestjs|integracoes|conteudo-ia|qa-testes|seguranca-multitenant|revisor-codigo|documentador|devops-sre|frontend-web|mobile-app)`/g;
for (const f of [...readdirSync(join(ROOT, 'agents')).map((x) => join(ROOT, 'agents', x)), join(ROOT, 'CLAUDE.md')]) {
  for (const m of readFileSync(f, 'utf8').matchAll(mentionRe)) if (!agentNames.has(m[1])) errors.push(`${rel(f)}: cita agente inexistente ${m[1]}`);
}
for (const f of [join(ROOT, 'CLAUDE.md'), ...readdirSync(join(ROOT, 'agents')).map((x) => join(ROOT, 'agents', x))]) {
  for (const m of readFileSync(f, 'utf8').matchAll(/skill `([a-z0-9-]+)`/g)) if (!skillNames.has(m[1])) errors.push(`${rel(f)}: cita skill inexistente ${m[1]}`);
}

// ---- hooks registrados apontam para arquivos existentes
const settingsFile = existsSync(join(ROOT, '.claude/settings.json')) ? join(ROOT, '.claude/settings.json') : join(ROOT, 'harness/settings.recommended.json');
if (existsSync(settingsFile)) {
  const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    for (const g of groups) for (const h of g.hooks ?? []) {
      const m = String(h.command).match(/harness\/hooks\/[\w.-]+\.mjs/);
      if (m && !existsSync(join(ROOT, m[0]))) errors.push(`.claude/settings.json (${event}): ${m[0]} não existe`);
    }
  }
} else warns.push('.claude/settings.json ausente: hooks inativos. Ative com: cp harness/settings.recommended.json .claude/settings.json');

if (!existsSync(join(ROOT, '.claude/settings.json'))) warns.push('hooks inativos: .claude/settings.json não existe. Ative com: cp harness/settings.recommended.json .claude/settings.json');

// ---- knowledge: título + tags (melhora a recuperação)
for (const f of corpusFiles().filter((f) => rel(f).startsWith('knowledge/'))) {
  const s = readFileSync(f, 'utf8');
  if (!/^# .+/m.test(s)) errors.push(`${rel(f)}: sem título "# "`);
  if (!/^>\s*tags:/im.test(s)) warns.push(`${rel(f)}: sem linha "> tags:" (piora o RAG)`);
}

// ---- código da API: @Query() com interseção de tipos não é convertido pelo ValidationPipe
// (page/pageSize chegam como texto; aconteceu 2x — ver knowledge/aprendizados/2026-11-11-query-com-tipo-de-intersecao-*)
function walkTs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'dist') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (f.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}
for (const f of [...walkTs(join(ROOT, 'backend/src')), ...walkTs(join(ROOT, 'apps/api/src'))]) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/@Query\(\)\s+\w+\??:\s*[^)=]*&/.test(line)) errors.push(`${rel(f)}:${i + 1}: @Query() com interseção de tipos — use uma classe que estende PaginationQuery`);
  });
}

for (const w of warns) console.log(`⚠ ${w}`);
for (const e of errors) console.log(`✘ ${e}`);
console.log(`\nharness:check — ${agentNames.size} agentes, ${skillNames.size} skills, ${corpusFiles().length} docs no RAG — ${errors.length} erro(s), ${warns.length} aviso(s)`);
process.exit(errors.length ? 1 : 0);
