import { adaptLenientJson } from './adapters/lenient';
import { adaptMarkdown } from './adapters/markdown';
import { extractJsonBlocks, looksLikeJson } from './extract';
import { applyDefaults } from './normalize';
import { Issue, Reporter } from './report';
import { planetSchema } from './schema';
import type { Bundle, Planet } from './schema';
import { validateBundle } from './validate';

export * from './schema';
export * from './report';
export * from './plan';
export { slugify, parseVimeo, contentHash } from './text';
export { extractJsonBlocks } from './extract';
export { CONVERSION_PROMPT } from './prompt';
export * from './questions';
export * from './catalog';

export type InputFormat = 'auto' | 'json' | 'markdown';
export type DetectedFormat = 'json' | 'json-in-text' | 'markdown';

export interface IngestInput {
  /** texto colado (JSON, chat com blocos ```json```, Markdown) ou objeto já parseado */
  content: string | object;
  format?: InputFormat;
  filename?: string;
}

export interface IngestStats {
  planets: number;
  courses: number;
  units: number;
  lessons: Record<string, number>;
  questions: number;
  /** questões por tipo (banco das práticas + certificação + "confere rapidinho" das telas) */
  questionTypes: Record<string, number>;
  /** telas com widget interativo, por tipo */
  widgets: Record<string, number>;
  videosPending: number;
}

export interface IngestResult {
  format: DetectedFormat;
  /** conteúdo normalizado no formato canônico (mesmo com erros, para revisão/edição) */
  bundle: Bundle;
  /** bundle validado (null se houver erros) */
  valid: Bundle | null;
  issues: Issue[];
  errors: number;
  warnings: number;
  stats: IngestStats;
}

export function statsOf(b: Bundle): IngestStats {
  const s: IngestStats = { planets: b.planets.length, courses: 0, units: 0, lessons: {}, questions: 0, questionTypes: {}, widgets: {}, videosPending: 0 };
  const inc = (r: Record<string, number>, k: string) => (r[k] = (r[k] ?? 0) + 1);
  const countQs = (qs: Array<{ type: string }> | undefined) => qs?.forEach((q) => { s.questions++; inc(s.questionTypes, q.type); });
  for (const p of b.planets) for (const c of p.courses) {
    s.courses++;
    countQs(c.exam?.questions);
    for (const u of c.units) {
      s.units++;
      for (const l of u.lessons) {
        inc(s.lessons, l.type);
        if (l.type === 'PRACTICE') countQs(l.questions);
        if (l.type === 'LESSON') for (const sl of l.slides) { if (sl.widget) inc(s.widgets, sl.widget.type); if (sl.check) countQs([sl.check]); }
        if (l.type === 'VIDEO' && !l.vimeoUrl) s.videosPending++;
      }
    }
  }
  return s;
}

/**
 * Pipeline completo: detectar formato -> adaptar -> padrões de negócio -> validar.
 * Nunca lança erro por conteúdo ruim: tudo vira issue no relatório.
 */
export function ingest(input: IngestInput): IngestResult {
  const rep = new Reporter();
  let format: DetectedFormat = 'json';
  let bundle: Bundle;

  if (typeof input.content === 'object') {
    bundle = adaptLenientJson(input.content, rep);
  } else {
    const text = input.content;
    // sem JSON no texto (ou formato forçado) -> leitura de Markdown/texto do chat
    const wantMd = input.format === 'markdown' || (input.format !== 'json' && !looksLikeJson(text));
    if (wantMd) {
      format = 'markdown';
      bundle = adaptLenientJson(adaptMarkdown(text, rep), rep);
    } else {
      const { values, errors } = extractJsonBlocks(text);
      format = text.trim().startsWith('{') || text.trim().startsWith('[') ? 'json' : 'json-in-text';
      errors.forEach((e) => rep.error('$', 'json.parse', e));
      if (!values.length) {
        if (!errors.length) rep.error('$', 'json.not_found', 'Nenhum JSON encontrado no texto');
        bundle = { schemaVersion: 'folks.content/v1', planets: [] };
      } else {
        if (values.length > 1) rep.info('$', 'json.multiple_blocks', `${values.length} blocos JSON encontrados e combinados`);
        bundle = adaptLenientJson(values.length === 1 ? values[0] : values, rep);
      }
    }
  }
  applyDefaults(bundle, rep);
  const valid = validateBundle(bundle, rep);
  return {
    format,
    bundle,
    valid,
    issues: rep.issues,
    errors: rep.errors.length,
    warnings: rep.warnings.length,
    stats: statsOf(bundle),
  };
}

/**
 * Separa os planetas que podem ser gravados (sem erro e válidos no schema) dos que
 * precisam de correção — permite gravação parcial de um lote grande.
 */
export function splitValidPlanets(bundle: Bundle, issues: Issue[]) {
  const badIdx = new Set<number>();
  let globalError = false;
  for (const i of issues) {
    if (i.severity !== 'error') continue;
    const m = i.path.match(/^planets\[(\d+)\]/);
    if (m) badIdx.add(Number(m[1]));
    else globalError = true;
  }
  const valid: Planet[] = [];
  const invalid: Array<{ slug: string; name: string; errors: number }> = [];
  bundle.planets.forEach((p, idx) => {
    const parsed = planetSchema.safeParse(p);
    if (!globalError && !badIdx.has(idx) && parsed.success) valid.push(parsed.data);
    else invalid.push({ slug: p.slug, name: p.name, errors: issues.filter((i) => i.severity === 'error' && i.path.startsWith(`planets[${idx}]`)).length || 1 });
  });
  return { valid, invalid };
}
