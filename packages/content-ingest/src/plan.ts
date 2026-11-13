import type { Bundle, Course, Planet } from './schema';
import { contentHash, slugify } from './text';

/** Estado atual do banco, informado por quem chama (o pacote não acessa banco). */
export interface Snapshot {
  categories: string[];
  planets: Array<{
    id: string;
    slug: string;
    status: string;
    contentHash: string | null;
    courses: Array<{ id: string; code: string | null; slug: string; title?: string; contentHash: string | null; hasProgress: boolean; status: string }>;
  }>;
  /** códigos de curso que existem em OUTROS planetas (Course.code é único global) */
  courseCodesElsewhere?: Record<string, string>;
}

/**
 * create_only: nunca altera o que já existe (planeta existente é pulado).
 * upsert (padrão): cria o que falta e substitui trilhas alteradas SEM progresso;
 *                  curso com progresso de alunos nunca é sobrescrito (CONFLICT).
 */
export type Strategy = 'create_only' | 'upsert';

export type PlanetAction = 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'SKIP' | 'BLOCKED';
export type CourseAction = 'CREATE' | 'REPLACE' | 'UNCHANGED' | 'CONFLICT' | 'SKIP';

export interface Plan {
  strategy: Strategy;
  planets: Array<{
    key: string;
    slug: string;
    name: string;
    action: PlanetAction;
    reason?: string;
    planetHash: string;
    courses: Array<{ key: string; slug: string; title: string; action: CourseAction; reason?: string; contentHash: string }>;
  }>;
  summary: Record<string, number>;
  /** há algo a gravar? */
  hasChanges: boolean;
}

export const planetHash = (p: Planet) =>
  contentHash({ name: p.name, shortName: p.shortName, category: p.category, description: p.description, accessTier: p.accessTier, themeColor: p.themeColor, visual: p.visual, sortOrder: p.sortOrder, status: p.status, vimeoFolder: p.vimeoFolder });
export const courseHash = (c: Course) => contentHash(c);

export function planImport(bundle: Bundle, snap: Snapshot, strategy: Strategy = 'upsert'): Plan {
  const summary: Record<string, number> = {};
  const count = (k: string) => (summary[k] = (summary[k] ?? 0) + 1);
  const planets = bundle.planets.map((p) => {
    const pHash = planetHash(p);
    const existing = snap.planets.find((x) => x.slug === p.slug);
    const base = { key: p.key, slug: p.slug, name: p.name, planetHash: pHash };
    const courseRows = (action: CourseAction, reason?: string) =>
      p.courses.map((c) => ({ key: c.key, slug: c.slug, title: c.title, action, reason, contentHash: courseHash(c) }));

    if (!snap.categories.includes(p.category)) {
      count('planet.BLOCKED');
      return { ...base, action: 'BLOCKED' as const, reason: `Categoria "${p.category}" não existe. Crie a categoria ou corrija o conteúdo.`, courses: courseRows('SKIP', 'planeta bloqueado') };
    }
    if (!existing) {
      count('planet.CREATE');
      const rows = p.courses.map((c) => {
        const elsewhere = snap.courseCodesElsewhere?.[c.key];
        if (elsewhere) { count('course.CONFLICT'); return { key: c.key, slug: c.slug, title: c.title, action: 'CONFLICT' as const, reason: `Chave "${c.key}" já usada no planeta "${elsewhere}"`, contentHash: courseHash(c) }; }
        count('course.CREATE');
        return { key: c.key, slug: c.slug, title: c.title, action: 'CREATE' as const, contentHash: courseHash(c) };
      });
      return { ...base, action: 'CREATE' as const, courses: rows };
    }
    if (strategy === 'create_only') {
      count('planet.SKIP');
      return { ...base, action: 'SKIP' as const, reason: 'Planeta já existe (estratégia create_only)', courses: courseRows('SKIP', 'planeta existente') };
    }
    const rows = p.courses.map((c) => {
      const h = courseHash(c);
      // casa por chave -> slug -> título (ex.: curso "Em breve" do catálogo com o mesmo nome).
      // Curso ARQUIVADO fica fora do casamento: arquivar o antigo libera criar a trilha nova.
      const active = existing.courses.filter((x) => x.status !== 'ARCHIVED');
      const byTitle = active.find((x) => x.title && slugify(x.title) === slugify(c.title));
      const cur = active.find((x) => x.code === c.key) ?? active.find((x) => x.slug === c.slug) ?? byTitle;
      const row = { key: c.key, slug: c.slug, title: c.title, contentHash: h };
      const fillsPlaceholder = !!cur && cur === byTitle && cur.code !== c.key && cur.slug !== c.slug;
      if (!cur) {
        const archived = existing.courses.find((x) => x.status === 'ARCHIVED' && (x.code === c.key || x.slug === c.slug));
        if (archived) { count('course.CONFLICT'); return { ...row, action: 'CONFLICT' as const, reason: `Já existe um curso ARQUIVADO com a mesma chave/slug ("${archived.title ?? archived.slug}"): use outra key e outro slug` }; }
        const elsewhere = snap.courseCodesElsewhere?.[c.key];
        if (elsewhere) { count('course.CONFLICT'); return { ...row, action: 'CONFLICT' as const, reason: `Chave "${c.key}" já usada no planeta "${elsewhere}"` }; }
        count('course.CREATE');
        return { ...row, action: 'CREATE' as const };
      }
      if (cur.contentHash === h) { count('course.UNCHANGED'); return { ...row, action: 'UNCHANGED' as const }; }
      if (cur.hasProgress) {
        count('course.CONFLICT');
        return { ...row, action: 'CONFLICT' as const, reason: 'Curso já tem progresso de alunos: a trilha não é sobrescrita (crie um curso novo ou edite manualmente)' };
      }
      count('course.REPLACE');
      return { ...row, action: 'REPLACE' as const, ...(fillsPlaceholder ? { reason: `Preenche o curso existente "${cur.title}" (mesmo nome)` } : {}) };
    });
    const metaChanged = existing.contentHash !== pHash;
    const anyCourseChange = rows.some((r) => r.action === 'CREATE' || r.action === 'REPLACE');
    const action: PlanetAction = metaChanged || anyCourseChange ? 'UPDATE' : 'UNCHANGED';
    count(`planet.${action}`);
    return { ...base, action, courses: rows };
  });
  const hasChanges = planets.some((p) => p.action === 'CREATE' || p.action === 'UPDATE');
  return { strategy, planets, summary, hasChanges };
}
