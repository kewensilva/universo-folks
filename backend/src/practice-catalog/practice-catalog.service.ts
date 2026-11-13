import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MethodologyStatus, Prisma } from '@prisma/client';
import { QUESTION_TYPES, checkCourseStructure, slugify, trailStructureSchema, type Catalog, type TrailStructure } from '@folks/content-ingest';
import { z } from 'zod';
import { patchOf } from '../common/zod-partial';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

/** Formatos de captura: entram no catálogo, mas o app ainda não captura (ADR 0013). */
export const CAPTURE_FORMATS = ['VOICE', 'PHOTO', 'VIDEO'] as const;
const FORMATS = [...QUESTION_TYPES, ...CAPTURE_FORMATS] as [string, ...string[]];

export const methodologyCreate = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'Código: minúsculas, números e _ (ex.: mito_verdade)'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullish(),
  answerFormats: z.array(z.enum(FORMATS)).min(1, 'Escolha ao menos um tipo de resposta'),
  guidance: z.string().trim().max(2000).nullish(),
  status: z.nativeEnum(MethodologyStatus).default('ACTIVE'),
  defaultTimeLimitMs: z.number().int().min(1000).max(600_000).nullish(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export const methodologyUpdate = patchOf(methodologyCreate.omit({ code: true }));

export const templateCreate = z.object({
  code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/, 'Código: minúsculas, números e hífen').optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullish(),
  structure: trailStructureSchema,
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export const templateUpdate = patchOf(templateCreate.omit({ code: true }));

/** Catálogo do MASTER: metodologias de prática e modelos de trilha (ADR 0013). */
@Injectable()
export class PracticeCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ========================================================== metodologias
  async listMethodologies() {
    const [rows, usage] = await Promise.all([
      this.prisma.methodology.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.question.groupBy({ by: ['methodology'], _count: { _all: true }, where: { methodology: { not: null } } }),
    ]);
    const used = new Map(usage.map((u) => [u.methodology, u._count._all]));
    return rows.map((m) => ({ ...m, questionCount: used.get(m.code) ?? 0, capture: m.answerFormats.some((f) => (CAPTURE_FORMATS as readonly string[]).includes(f)) }));
  }

  private assertCaptureRule(formats: string[], status: MethodologyStatus) {
    if (status === 'ACTIVE' && formats.some((f) => (CAPTURE_FORMATS as readonly string[]).includes(f))) {
      throw new BadRequestException('Captura por voz, foto ou vídeo ainda não existe no app: deixe como "Em breve".');
    }
  }

  async createMethodology(me: AuthUser, dto: z.infer<typeof methodologyCreate>) {
    this.assertCaptureRule(dto.answerFormats, dto.status);
    if (await this.prisma.methodology.findUnique({ where: { code: dto.code } })) throw new ConflictException(`Já existe uma metodologia com o código "${dto.code}"`);
    const m = await this.prisma.methodology.create({ data: { ...dto, isSystem: false } });
    await this.audit.log(me, 'methodology.create', 'methodology', m.id, dto);
    return m;
  }

  async updateMethodology(me: AuthUser, id: string, dto: z.infer<typeof methodologyUpdate>) {
    const cur = await this.prisma.methodology.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Metodologia não encontrada');
    this.assertCaptureRule(dto.answerFormats ?? cur.answerFormats, dto.status ?? cur.status);
    const m = await this.prisma.methodology.update({ where: { id }, data: dto });
    await this.audit.log(me, 'methodology.update', 'methodology', id, dto);
    return m;
  }

  async deleteMethodology(me: AuthUser, id: string) {
    const cur = await this.prisma.methodology.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Metodologia não encontrada');
    if (cur.isSystem) throw new BadRequestException('Metodologia da plataforma não pode ser excluída. Desative-a se não quiser mais usar.');
    const n = await this.prisma.question.count({ where: { methodology: cur.code } });
    if (n) throw new ConflictException(`${n} questão(ões) usam esta metodologia. Desative-a em vez de excluir.`);
    await this.prisma.methodology.delete({ where: { id } });
    await this.audit.log(me, 'methodology.delete', 'methodology', id, { code: cur.code });
    return { deleted: true };
  }

  // ====================================================== modelos de trilha
  async listTemplates() {
    const rows = await this.prisma.trailTemplate.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { courses: true } } } });
    return rows.map(({ _count, ...t }) => ({ ...t, courseCount: _count.courses }));
  }

  private async assertMethodologies(s: TrailStructure) {
    if (!s.methodologies.length) return;
    const found = await this.prisma.methodology.findMany({ where: { code: { in: s.methodologies } }, select: { code: true } });
    const missing = s.methodologies.filter((c) => !found.some((f) => f.code === c));
    if (missing.length) throw new BadRequestException(`Metodologia(s) inexistente(s) no modelo: ${missing.join(', ')}`);
  }

  async createTemplate(me: AuthUser, dto: z.infer<typeof templateCreate>) {
    await this.assertMethodologies(dto.structure);
    const code = dto.code ?? slugify(dto.name);
    if (await this.prisma.trailTemplate.findUnique({ where: { code } })) throw new ConflictException(`Já existe um modelo com o código "${code}"`);
    const t = await this.prisma.trailTemplate.create({ data: { ...dto, code, structure: dto.structure as Prisma.InputJsonValue } });
    await this.audit.log(me, 'trail_template.create', 'trail_template', t.id, dto);
    return t;
  }

  async updateTemplate(me: AuthUser, id: string, dto: z.infer<typeof templateUpdate>) {
    if (!(await this.prisma.trailTemplate.findUnique({ where: { id } }))) throw new NotFoundException('Modelo de trilha não encontrado');
    if (dto.structure) await this.assertMethodologies(dto.structure);
    const t = await this.prisma.trailTemplate.update({ where: { id }, data: { ...dto, structure: dto.structure as Prisma.InputJsonValue | undefined } });
    await this.audit.log(me, 'trail_template.update', 'trail_template', id, dto);
    return t;
  }

  async deleteTemplate(me: AuthUser, id: string) {
    const t = await this.prisma.trailTemplate.findUnique({ where: { id }, include: { _count: { select: { courses: true } } } });
    if (!t) throw new NotFoundException('Modelo de trilha não encontrado');
    if (t._count.courses) throw new ConflictException(`${t._count.courses} curso(s) seguem este modelo. Desative-o em vez de excluir.`);
    await this.prisma.trailTemplate.delete({ where: { id } });
    await this.audit.log(me, 'trail_template.delete', 'trail_template', id, { code: t.code });
    return { deleted: true };
  }

  /** O curso segue o modelo dele? Lista as diferenças (vazia = segue). */
  async checkCourse(courseId: string) {
    const c = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true, title: true, trailTemplate: true, exam: { select: { id: true } },
        units: { orderBy: { sortOrder: 'asc' }, select: { title: true, lessons: { orderBy: { sortOrder: 'asc' }, select: { type: true } } } },
      },
    });
    if (!c) throw new NotFoundException('Curso não encontrado');
    if (!c.trailTemplate) return { template: null, follows: null, differences: [] as string[] };
    const differences = checkCourseStructure({ units: c.units, exam: c.exam }, trailStructureSchema.parse(c.trailTemplate.structure));
    return { template: { id: c.trailTemplate.id, code: c.trailTemplate.code, name: c.trailTemplate.name }, follows: differences.length === 0, differences };
  }

  // ============================================== uso pela importação e pelo Claude
  /** Catálogo para a conferência da importação (checkAgainstCatalog). */
  async catalog(): Promise<Catalog> {
    const [methodologies, templates] = await Promise.all([
      this.prisma.methodology.findMany({ select: { code: true, name: true, status: true, answerFormats: true } }),
      this.prisma.trailTemplate.findMany({ select: { code: true, name: true, isActive: true, structure: true } }),
    ]);
    return { methodologies, templates: templates.map((t) => ({ ...t, structure: trailStructureSchema.parse(t.structure) })) };
  }

  /** O que o Claude pode usar: só metodologias ativas e modelos ativos. */
  async forClaude() {
    const [methodologies, templates] = await Promise.all([
      this.prisma.methodology.findMany({ where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' }, select: { code: true, name: true, description: true, answerFormats: true, guidance: true, defaultTimeLimitMs: true } }),
      this.prisma.trailTemplate.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { code: true, name: true, description: true, structure: true } }),
    ]);
    return { methodologies, templates };
  }

  /**
   * Revisão de um planeta já gravado (criação direta pelo Claude): cursos que fogem do modelo
   * e metodologias fora do catálogo, inativas ou em breve. Só avisos.
   */
  async reviewPlanet(planetId: string) {
    const warnings: string[] = [];
    const courses = await this.prisma.course.findMany({ where: { planetId, trailTemplateId: { not: null } }, select: { id: true, title: true } });
    for (const c of courses) {
      const r = await this.checkCourse(c.id);
      for (const d of r.differences) warnings.push(`Curso "${c.title}" foge do modelo "${r.template?.name}": ${d}.`);
    }
    const used = await this.prisma.question.groupBy({
      by: ['methodology'], _count: { _all: true },
      where: { methodology: { not: null }, OR: [{ lesson: { unit: { course: { planetId } } } }, { exam: { course: { planetId } } }] },
    });
    if (used.length) {
      const cat = new Map((await this.prisma.methodology.findMany({ where: { code: { in: used.map((u) => u.methodology!) } } })).map((m) => [m.code, m]));
      for (const u of used) {
        const m = cat.get(u.methodology!);
        if (!m) warnings.push(`Metodologia "${u.methodology}" não está no catálogo (${u._count._all} questões).`);
        else if (m.status !== 'ACTIVE') warnings.push(`Metodologia "${m.name}" está ${m.status === 'INACTIVE' ? 'inativa' : 'em breve'} (${u._count._all} questões).`);
      }
    }
    return warnings;
  }

  /** Id do modelo pelo código (usado ao gravar a importação). */
  async templateIdByCode(code?: string | null) {
    if (!code) return null;
    return (await this.prisma.trailTemplate.findUnique({ where: { code }, select: { id: true } }))?.id ?? null;
  }
}

