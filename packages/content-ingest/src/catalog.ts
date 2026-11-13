import { z } from 'zod';
import type { Issue } from './report';
import type { Bundle, Course, Question } from './schema';

/**
 * Catálogo do MASTER (ADR 0013): metodologias de prática e modelos de trilha.
 * A importação confere o conteúdo contra ele e só AVISA (não bloqueia a gravação).
 */

export const STEP_KINDS = ['VIDEO', 'LESSON', 'PRACTICE', 'INTERACTIVE'] as const;
export type StepKind = (typeof STEP_KINDS)[number];
const STEP_LABEL: Record<StepKind, string> = { VIDEO: 'vídeo', LESSON: 'aula em telas', PRACTICE: 'prática', INTERACTIVE: 'conteúdo interativo' };

export const trailStepSchema = z.object({
  kind: z.enum(STEP_KINDS),
  /** mínimo de etapas seguidas deste tipo (0 = opcional) */
  min: z.number().int().min(0).max(20).default(1),
  /** máximo (null = sem limite) */
  max: z.number().int().min(1).max(50).nullable().optional(),
});
export const trailStructureSchema = z
  .object({
    /** etapas de CADA unidade, na ordem */
    unitSteps: z.array(trailStepSchema).min(1, 'Defina ao menos uma etapa por unidade'),
    /** unidade final com estrutura própria (ex.: só a prática geral no fim) */
    closingSteps: z.array(trailStepSchema).min(1).nullable().optional(),
    closingTitle: z.string().max(80).nullable().optional(),
    minUnits: z.number().int().min(1).max(50).nullable().optional(),
    maxUnits: z.number().int().min(1).max(50).nullable().optional(),
    /** o curso termina com desafio final (certificação) */
    exam: z.boolean().default(false),
    /** metodologias permitidas nas práticas deste modelo (vazio = qualquer ativa) */
    methodologies: z.array(z.string()).default([]),
  })
  .refine((s) => !s.minUnits || !s.maxUnits || s.minUnits <= s.maxUnits, { message: 'Mínimo de unidades maior que o máximo', path: ['maxUnits'] })
  .refine((s) => [...s.unitSteps, ...(s.closingSteps ?? [])].every((st) => st.max == null || st.max >= st.min), { message: 'Uma etapa tem máximo menor que o mínimo', path: ['unitSteps'] });
export type TrailStep = z.infer<typeof trailStepSchema>;
export type TrailStructure = z.infer<typeof trailStructureSchema>;

export type MethodologyStatus = 'ACTIVE' | 'INACTIVE' | 'COMING_SOON';
export interface CatalogMethodology { code: string; name: string; status: MethodologyStatus; answerFormats: string[] }
export interface CatalogTemplate { code: string; name: string; isActive: boolean; structure: TrailStructure }
export interface Catalog { methodologies: CatalogMethodology[]; templates: CatalogTemplate[] }

/** Junta etapas vizinhas do mesmo tipo no modelo (PRÁTICA + PRÁTICA = PRÁTICA de 2 a ...). */
function mergeSteps(steps: TrailStep[]) {
  const out: Array<{ kind: StepKind; min: number; max: number | null }> = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    const max = s.max ?? null;
    if (last && last.kind === s.kind) { last.min += s.min; last.max = last.max === null || max === null ? null : last.max + max; }
    else out.push({ kind: s.kind, min: s.min, max });
  }
  return out;
}

/** Sequência de etapas da unidade agrupada: VÍDEO x3, AULA x1, PRÁTICA x2. */
function runsOf(kinds: string[]) {
  const runs: Array<{ kind: string; count: number }> = [];
  for (const k of kinds) {
    const last = runs[runs.length - 1];
    if (last && last.kind === k) last.count++;
    else runs.push({ kind: k, count: 1 });
  }
  return runs;
}

const label = (k: string) => STEP_LABEL[k as StepKind] ?? k.toLowerCase();
const describe = (steps: TrailStep[]) => mergeSteps(steps).map((s) => `${label(s.kind)}${s.min === 0 ? ' (opcional)' : ''}`).join(' → ');

/** Confere as etapas de uma unidade contra o modelo. Devolve o motivo da diferença ou null. */
export function matchUnitSteps(kinds: string[], steps: TrailStep[]): string | null {
  const want = mergeSteps(steps);
  const runs = runsOf(kinds);
  let r = 0;
  for (const st of want) {
    const run = runs[r];
    if (run && run.kind === st.kind) {
      if (run.count < st.min) return `esperava pelo menos ${st.min} ${label(st.kind)}, tem ${run.count}`;
      if (st.max !== null && run.count > st.max) return `esperava no máximo ${st.max} ${label(st.kind)}, tem ${run.count}`;
      r++;
    } else if (st.min > 0) {
      return run ? `esperava ${label(st.kind)}, encontrou ${label(run.kind)}` : `falta ${label(st.kind)} no fim`;
    }
  }
  if (r < runs.length) return `etapa fora do modelo: ${runs.slice(r).map((x) => label(x.kind)).join(', ')}`;
  return null;
}

/** Confere um curso inteiro contra a estrutura do modelo. Devolve a lista de diferenças (vazia = segue o modelo). */
export function checkCourseStructure(course: { units: Array<{ title?: string; lessons: Array<{ type: string }> }>; exam?: unknown }, s: TrailStructure): string[] {
  const out: string[] = [];
  const units = course.units;
  const closing = s.closingSteps?.length ? s.closingSteps : null;
  const regular = closing && units.length ? units.slice(0, -1) : units;
  if (s.minUnits && regular.length < s.minUnits) out.push(`tem ${regular.length} unidade(s); o modelo pede pelo menos ${s.minUnits}`);
  if (s.maxUnits && regular.length > s.maxUnits) out.push(`tem ${regular.length} unidade(s); o modelo permite no máximo ${s.maxUnits}`);
  regular.forEach((u, i) => {
    const why = matchUnitSteps(u.lessons.map((l) => l.type), s.unitSteps);
    if (why) out.push(`unidade ${i + 1}${u.title ? ` ("${u.title}")` : ''}: ${why} (modelo: ${describe(s.unitSteps)})`);
  });
  if (closing) {
    const last = units[units.length - 1];
    if (!last) out.push(`falta a unidade final (${describe(closing)})`);
    else {
      const why = matchUnitSteps(last.lessons.map((l) => l.type), closing);
      if (why) out.push(`unidade final${last.title ? ` ("${last.title}")` : ''}: ${why} (modelo: ${describe(closing)})`);
    }
  }
  if (s.exam && !course.exam) out.push('o modelo termina com desafio final, e o curso não tem');
  if (!s.exam && course.exam) out.push('o curso tem desafio final, e o modelo não prevê');
  return out;
}

/** Questões com metodologia em todo o curso, com o caminho legível da etapa. */
function questionsOf(c: Course, base: string) {
  const out: Array<{ path: string; q: { type: string; methodology?: string }; inPractice: boolean }> = [];
  c.units.forEach((u, ui) => u.lessons.forEach((l, li) => {
    const p = `${base}.units[${ui}].lessons[${li}]`;
    if (l.type === 'PRACTICE') {
      l.questions?.forEach((q: Question) => out.push({ path: p, q, inPractice: true }));
      l.generators?.forEach((g) => out.push({ path: p, q: { type: '', methodology: g.methodology }, inPractice: true }));
    }
    if (l.type === 'LESSON') l.slides.forEach((sl) => { if (sl.check) out.push({ path: p, q: sl.check, inPractice: false }); });
  }));
  c.exam?.questions?.forEach((q) => out.push({ path: `${base}.exam`, q, inPractice: true }));
  return out;
}

/**
 * Confere o lote contra o catálogo do MASTER. Só gera avisos, agrupados por etapa
 * (não repete o mesmo aviso para cada uma das questões).
 */
export function checkAgainstCatalog(bundle: Bundle, catalog: Catalog): Issue[] {
  const issues: Issue[] = [];
  const warn = (path: string, code: string, message: string) => issues.push({ severity: 'warning', path, code, message });
  const meth = new Map(catalog.methodologies.map((m) => [m.code, m]));
  const tpl = new Map(catalog.templates.map((t) => [t.code, t]));
  const useCatalog = catalog.methodologies.length > 0;

  bundle.planets.forEach((p, pi) => p.courses.forEach((c, ci) => {
    const base = `planets[${pi}].courses[${ci}]`;
    // modelo de trilha
    let allowed: Set<string> | null = null;
    if (c.trailTemplate) {
      const t = tpl.get(c.trailTemplate);
      if (!t) warn(base, 'trail_template.unknown', `Modelo de trilha "${c.trailTemplate}" não existe (menu Personalização de trilha). O curso entra sem modelo.`);
      else {
        if (!t.isActive) warn(base, 'trail_template.inactive', `Modelo de trilha "${t.name}" está inativo.`);
        for (const why of checkCourseStructure(c, t.structure)) warn(base, 'trail_template.mismatch', `Curso "${c.title}" foge do modelo "${t.name}": ${why}.`);
        if (t.structure.methodologies.length) allowed = new Set(t.structure.methodologies);
      }
    }
    if (!useCatalog) return;
    // metodologias, agrupadas por etapa + código + motivo
    const groups = new Map<string, { path: string; code: string; msg: string; n: number }>();
    const add = (path: string, code: string, msg: string) => {
      const k = `${path}|${code}|${msg}`;
      const g = groups.get(k);
      if (g) g.n++; else groups.set(k, { path, code, msg, n: 1 });
    };
    for (const { path, q, inPractice } of questionsOf(c, base)) {
      if (!q.methodology) continue;
      const m = meth.get(q.methodology);
      if (!m) { add(path, 'methodology.unknown', `Metodologia "${q.methodology}" não está no catálogo (menu Metodologia)`); continue; }
      if (m.status === 'INACTIVE') add(path, 'methodology.inactive', `Metodologia "${m.name}" está inativa`);
      if (m.status === 'COMING_SOON') add(path, 'methodology.coming_soon', `Metodologia "${m.name}" ainda não está disponível (em breve)`);
      if (q.type && m.answerFormats.length && !m.answerFormats.includes(q.type)) add(path, 'methodology.type_mismatch', `Metodologia "${m.name}" não usa questões do tipo ${q.type} (aceita: ${m.answerFormats.join(', ')})`);
      if (allowed && inPractice && !allowed.has(m.code)) add(path, 'trail_template.methodology', `Metodologia "${m.name}" não está entre as permitidas pelo modelo de trilha`);
    }
    for (const g of groups.values()) warn(g.path, g.code, g.n > 1 ? `${g.msg} (${g.n} questões)` : g.msg);
  }));
  return issues;
}
