import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toStorage } from '@folks/content-ingest';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { slugify } from '../common/utils';
import { AuditService } from '../audit/audit.service';
import { VimeoService } from '../vimeo/vimeo.service';
import {
  categoryCreate, categoryUpdate, courseCreate, CourseTree, courseUpdate, examUpsert, lessonCreate, lessonUpdate,
  planetCreate, PlanetTree, planetUpdate, QuestionInput, reorderSchema, unitCreate, unitUpdate,
} from './content.schemas';

type Tx = Prisma.TransactionClient;

/**
 * CRUD do conteúdo global (MASTER-FOLKS) + "builder" que cria a árvore
 * completa de um planeta numa única transação (usado pelo Claude via MCP).
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly vimeo: VimeoService,
  ) {}

  // ============================================================ categorias
  listCategories() {
    return this.prisma.studyCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { planets: true } } },
    });
  }

  async createCategory(me: AuthUser, dto: z.infer<typeof categoryCreate>) {
    const c = await this.prisma.studyCategory.create({ data: { ...dto, slug: dto.slug ?? slugify(dto.name) } });
    await this.audit.log(me, 'category.create', 'category', c.id, dto);
    return c;
  }

  async updateCategory(me: AuthUser, id: string, dto: z.infer<typeof categoryUpdate>) {
    const c = await this.prisma.studyCategory.update({ where: { id }, data: dto });
    await this.audit.log(me, 'category.update', 'category', id, dto);
    return c;
  }

  async deleteCategory(me: AuthUser, id: string) {
    const n = await this.prisma.planet.count({ where: { categoryId: id } });
    if (n) throw new ConflictException('Categoria possui planetas. Mova-os ou desative a categoria.');
    await this.prisma.studyCategory.delete({ where: { id } });
    await this.audit.log(me, 'category.delete', 'category', id);
    return { deleted: true };
  }

  // =============================================================== planetas
  listPlanets(filter: { categoryId?: string; status?: string; search?: string }) {
    return this.prisma.planet.findMany({
      where: {
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.status ? { status: filter.status as any } : {}),
        ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { category: { select: { id: true, name: true, slug: true } }, _count: { select: { courses: true } } },
    });
  }

  /** Árvore completa (planeta > cursos > unidades > lições > questões + prova). */
  async planetTree(idOrSlug: string) {
    const where = /^[0-9a-f-]{36}$/i.test(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug };
    const p = await this.prisma.planet.findUnique({
      where,
      include: {
        category: true,
        courses: {
          orderBy: { sortOrder: 'asc' },
          include: {
            units: {
              orderBy: { sortOrder: 'asc' },
              include: {
                lessons: {
                  orderBy: { sortOrder: 'asc' },
                  include: { questions: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } } },
                },
              },
            },
            exam: { include: { questions: { orderBy: { sortOrder: 'asc' }, include: { options: { orderBy: { sortOrder: 'asc' } } } } } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Planeta não encontrado');
    return p;
  }

  async createPlanet(me: AuthUser, dto: z.infer<typeof planetCreate>, tx: Tx = this.prisma) {
    const { categorySlug, categoryId, ...data } = dto;
    const catId = await this.resolveCategory(tx, categoryId, categorySlug);
    const slug = dto.slug ?? (await this.uniquePlanetSlug(tx, dto.name));
    const planet = await tx.planet.create({ data: { ...data, visual: (data.visual ?? undefined) as Prisma.InputJsonValue | undefined, slug, categoryId: catId } });
    await this.audit.log(me, 'planet.create', 'planet', planet.id, { name: dto.name });
    return planet;
  }

  async updatePlanet(me: AuthUser, id: string, dto: z.infer<typeof planetUpdate>) {
    const { categorySlug, categoryId, ...data } = dto;
    const catId = categoryId || categorySlug ? await this.resolveCategory(this.prisma, categoryId, categorySlug) : undefined;
    const p = await this.prisma.planet.update({
      where: { id },
      data: { ...data, visual: data.visual === null ? Prisma.DbNull : (data.visual as Prisma.InputJsonValue | undefined), ...(catId ? { categoryId: catId } : {}) },
    });
    await this.audit.log(me, 'planet.update', 'planet', id, dto);
    return p;
  }

  /** Planetas com progresso de alunos são arquivados em vez de apagados. */
  async deletePlanet(me: AuthUser, id: string) {
    const hasProgress = await this.prisma.enrollment.count({ where: { course: { planetId: id } } });
    if (hasProgress) {
      await this.prisma.planet.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await this.audit.log(me, 'planet.archive', 'planet', id);
      return { archived: true, reason: 'Planeta possui progresso de alunos e foi arquivado' };
    }
    await this.prisma.planet.delete({ where: { id } });
    await this.audit.log(me, 'planet.delete', 'planet', id);
    return { deleted: true };
  }

  // ================================================================= cursos
  async createCourse(me: AuthUser, dto: z.infer<typeof courseCreate>, tx: Tx = this.prisma) {
    const sortOrder = dto.sortOrder ?? (await tx.course.count({ where: { planetId: dto.planetId } }));
    const slug = dto.slug ?? (await this.uniqueCourseSlug(tx, dto.planetId, dto.title));
    const c = await tx.course.create({ data: { ...this.courseJson(dto), slug, sortOrder } });
    await this.audit.log(me, 'course.create', 'course', c.id, { title: dto.title });
    return c;
  }

  async updateCourse(me: AuthUser, id: string, dto: z.infer<typeof courseUpdate>) {
    const c = await this.prisma.course.update({ where: { id }, data: this.courseJson(dto) });
    await this.audit.log(me, 'course.update', 'course', id, dto);
    return c;
  }

  async deleteCourse(me: AuthUser, id: string) {
    const hasProgress = await this.prisma.enrollment.count({ where: { courseId: id } });
    if (hasProgress) {
      await this.prisma.course.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await this.audit.log(me, 'course.archive', 'course', id);
      return { archived: true, reason: 'Curso possui progresso de alunos e foi arquivado' };
    }
    await this.prisma.course.delete({ where: { id } });
    await this.audit.log(me, 'course.delete', 'course', id);
    return { deleted: true };
  }

  // ============================================================== unidades
  async createUnit(me: AuthUser, dto: z.infer<typeof unitCreate>, tx: Tx = this.prisma) {
    const sortOrder = dto.sortOrder ?? (await tx.unit.count({ where: { courseId: dto.courseId } }));
    const u = await tx.unit.create({ data: { ...dto, sortOrder } });
    await this.audit.log(me, 'unit.create', 'unit', u.id, { title: dto.title });
    return u;
  }

  async updateUnit(me: AuthUser, id: string, dto: z.infer<typeof unitUpdate>) {
    const u = await this.prisma.unit.update({ where: { id }, data: dto });
    await this.audit.log(me, 'unit.update', 'unit', id, dto);
    return u;
  }

  async deleteUnit(me: AuthUser, id: string) {
    await this.prisma.unit.delete({ where: { id } });
    await this.audit.log(me, 'unit.delete', 'unit', id);
    return { deleted: true };
  }

  // ================================================================ lições
  async createLesson(me: AuthUser, dto: z.infer<typeof lessonCreate>, tx: Tx = this.prisma) {
    const { questions, vimeoUrl, content, ...data } = dto;
    const vimeo = dto.type === 'VIDEO' && !vimeoUrl ? {} : await this.resolveVimeo(dto.type, vimeoUrl);
    if (dto.type === 'LESSON' && !content) throw new BadRequestException('Aula precisa de "content" com as telas (slides)');
    if (dto.type === 'PRACTICE' && dto.questionSource === 'GENERATED' && !dto.generators?.length) throw new BadRequestException('Prática gerada precisa de "generators"');
    if (dto.type === 'INTERACTIVE' && !dto.interactivePackageId) throw new BadRequestException('interactivePackageId obrigatório');
    const sortOrder = dto.sortOrder ?? (await tx.lesson.count({ where: { unitId: dto.unitId } }));
    const lesson = await tx.lesson.create({
      data: {
        ...data,
        content: content as Prisma.InputJsonValue | undefined,
        sortOrder,
        ...vimeo,
        durationSeconds: dto.durationSeconds ?? (vimeo as { durationSeconds?: number }).durationSeconds,
      },
    });
    if (questions?.length) await this.createQuestions(tx, { lessonId: lesson.id }, questions);
    await this.audit.log(me, 'lesson.create', 'lesson', lesson.id, { title: dto.title, type: dto.type });
    return lesson;
  }

  async updateLesson(me: AuthUser, id: string, dto: z.infer<typeof lessonUpdate>) {
    const current = await this.prisma.lesson.findUniqueOrThrow({ where: { id } });
    const { vimeoUrl, content, ...data } = dto;
    const vimeo = vimeoUrl ? await this.resolveVimeo(current.type, vimeoUrl) : {};
    const l = await this.prisma.lesson.update({
      where: { id },
      data: { ...data, ...vimeo, ...(content !== undefined ? { content: content as Prisma.InputJsonValue } : {}) } as Prisma.LessonUncheckedUpdateInput,
    });
    await this.audit.log(me, 'lesson.update', 'lesson', id, dto);
    return l;
  }

  async deleteLesson(me: AuthUser, id: string) {
    await this.prisma.lesson.delete({ where: { id } });
    await this.audit.log(me, 'lesson.delete', 'lesson', id);
    return { deleted: true };
  }

  // =============================================================== questões
  async addQuestion(me: AuthUser, target: { lessonId?: string; examId?: string }, q: QuestionInput) {
    if (!!target.lessonId === !!target.examId) throw new BadRequestException('Informe lessonId OU examId');
    const [created] = await this.createQuestions(this.prisma, target, [q]);
    await this.audit.log(me, 'question.create', 'question', created.id);
    return created;
  }

  async updateQuestion(me: AuthUser, id: string, q: QuestionInput) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({ where: { questionId: id } });
      const st = toStorage(q);
      return tx.question.update({
        where: { id },
        data: {
          type: st.type,
          prompt: st.prompt,
          explanation: st.explanation,
          methodology: st.methodology,
          timeLimitMs: st.timeLimitMs,
          data: st.data ? (st.data as Prisma.InputJsonValue) : Prisma.DbNull,
          media: st.media ? (st.media as Prisma.InputJsonValue) : Prisma.DbNull,
          mediaUrl: q.mediaUrl,
          points: q.points,
          options: { create: st.options.map((o, i) => ({ ...o, sortOrder: i })) },
        },
        include: { options: true },
      });
    });
    await this.audit.log(me, 'question.update', 'question', id);
    return updated;
  }

  async deleteQuestion(me: AuthUser, id: string) {
    await this.prisma.question.delete({ where: { id } });
    await this.audit.log(me, 'question.delete', 'question', id);
    return { deleted: true };
  }

  private async createQuestions(tx: Tx, target: { lessonId?: string; examId?: string }, questions: QuestionInput[]) {
    const start = await tx.question.count({ where: target });
    const out = [];
    for (const [i, q] of questions.entries()) {
      // formato completo (som em media.audio, microfone em data.simulator...): mesma gravação da importação
      const st = toStorage(q);
      out.push(
        await tx.question.create({
          data: {
            ...target,
            type: st.type,
            prompt: st.prompt,
            explanation: st.explanation,
            methodology: st.methodology,
            timeLimitMs: st.timeLimitMs,
            data: st.data ? (st.data as Prisma.InputJsonValue) : Prisma.DbNull,
            media: st.media ? (st.media as Prisma.InputJsonValue) : Prisma.DbNull,
            mediaUrl: q.mediaUrl,
            points: q.points,
            sortOrder: start + i,
            options: { create: st.options.map((o, j) => ({ text: o.text, isCorrect: o.isCorrect, feedback: o.feedback, sortOrder: j })) },
          },
          include: { options: true },
        }),
      );
    }
    return out;
  }

  // ========================================================= certificação
  async upsertExam(me: AuthUser, courseId: string, dto: z.infer<typeof examUpsert>, tx?: Tx) {
    const run = async (t: Tx) => {
      const { questions, ...data } = dto;
      const exam = await t.exam.upsert({ where: { courseId }, create: { ...data, courseId }, update: data });
      if (questions) {
        await t.question.deleteMany({ where: { examId: exam.id } });
        await this.createQuestions(t, { examId: exam.id }, questions);
      }
      return t.exam.findUniqueOrThrow({ where: { id: exam.id }, include: { _count: { select: { questions: true } } } });
    };
    const exam = tx ? await run(tx) : await this.prisma.$transaction(run);
    await this.audit.log(me, 'exam.upsert', 'exam', exam.id, { courseId });
    return exam;
  }

  // ============================================================ ordenação
  async reorder(me: AuthUser, dto: z.infer<typeof reorderSchema>) {
    const model: Record<string, any> = {
      category: this.prisma.studyCategory,
      planet: this.prisma.planet,
      course: this.prisma.course,
      unit: this.prisma.unit,
      lesson: this.prisma.lesson,
      question: this.prisma.question,
    };
    await this.prisma.$transaction(
      dto.orderedIds.map((id, i) => model[dto.entity].update({ where: { id }, data: { sortOrder: i } })),
    );
    await this.audit.log(me, 'content.reorder', dto.entity, undefined, dto);
    return { ok: true };
  }

  // ================================================================ Vimeo
  /**
   * Liga os vídeos de uma pasta do Vimeo às lições de VÍDEO de um curso,
   * comparando o nome do vídeo com o título do vídeo/lição (sem acento, sem
   * caixa). Com dryRun=true só mostra o que faria.
   */
  async linkCourseVideosFromFolder(me: AuthUser, courseId: string, folderId: string, opts: { dryRun?: boolean; overwrite?: boolean; restrictEmbed?: boolean } = {}) {
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } });
    const lessons = await this.prisma.lesson.findMany({
      where: { type: 'VIDEO', unit: { courseId } },
      orderBy: [{ unit: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      select: { id: true, title: true, videoTitle: true, vimeoVideoId: true, unit: { select: { title: true } } },
    });
    const folder = await this.vimeo.listFolder(folderId);
    const norm = (t?: string | null) => slugify(t ?? '').replace(/^(video|aula|\d+)-+/, '');
    const byName = new Map(folder.videos.map((v) => [norm(v.name), v]));
    const used = new Set<string>();
    const matches: Array<{ lessonId: string; lesson: string; unit: string; video: { id: string; name?: string; durationSeconds?: number } | null; action: string }> = [];
    for (const l of lessons) {
      const keys = [norm(l.videoTitle), norm(l.title), norm(l.unit.title)].filter(Boolean);
      const video = keys.map((k) => byName.get(k)).find((v) => v && !used.has(v.id)) ?? null;
      let action = 'SEM_CORRESPONDENCIA';
      if (video) {
        used.add(video.id);
        action = l.vimeoVideoId && !opts.overwrite ? (l.vimeoVideoId === video.id ? 'JA_VINCULADO' : 'MANTIDO (use overwrite)') : 'VINCULAR';
      }
      matches.push({ lessonId: l.id, lesson: l.videoTitle ?? l.title, unit: l.unit.title, video: video ? { id: video.id, name: video.name, durationSeconds: video.durationSeconds } : null, action });
    }
    if (!opts.dryRun) {
      for (const m of matches.filter((x) => x.action === 'VINCULAR')) {
        const v = folder.videos.find((x) => x.id === m.video!.id)!;
        await this.prisma.lesson.update({
          where: { id: m.lessonId },
          data: {
            vimeoVideoId: v.id,
            vimeoHash: v.hash ?? null,
            vimeoUrl: v.link ?? `https://vimeo.com/${v.id}${v.hash ? `/${v.hash}` : ''}`,
            durationSeconds: v.durationSeconds,
            thumbnailUrl: v.thumbnail,
            vimeoSyncedAt: new Date(),
          },
        });
        if (opts.restrictEmbed) await this.vimeo.restrictEmbedToApp(v.id).catch((e) => (m.action = `VINCULADO (embed não restringido: ${e.message})`));
      }
      await this.audit.log(me, 'vimeo.link_folder', 'course', courseId, { folderId, linked: matches.filter((x) => x.action === 'VINCULAR').length });
    }
    return {
      course: course.title,
      folderId,
      dryRun: !!opts.dryRun,
      linked: matches.filter((x) => x.action === 'VINCULAR').length,
      unmatchedLessons: matches.filter((x) => !x.video).map((x) => x.lesson),
      unusedVideos: folder.videos.filter((v) => !used.has(v.id)).map((v) => ({ id: v.id, name: v.name })),
      matches,
    };
  }

  /** Atualiza duração, miniatura e hash de todas as lições de vídeo (ou de um curso). */
  async syncVimeoMetadata(me: AuthUser, courseId?: string) {
    if (!this.vimeo.enabled) throw new BadRequestException('Integração com o Vimeo não configurada (VIMEO_ACCESS_TOKEN)');
    const lessons = await this.prisma.lesson.findMany({
      where: { type: 'VIDEO', vimeoVideoId: { not: null }, ...(courseId ? { unit: { courseId } } : {}) },
      select: { id: true, title: true, vimeoVideoId: true, vimeoHash: true },
    });
    const result = { total: lessons.length, updated: 0, failed: [] as Array<{ lessonId: string; title: string; reason: string }>, notReady: [] as string[] };
    for (const l of lessons) {
      const info = await this.vimeo.getVideo(l.vimeoVideoId!);
      if (!info?.name) {
        result.failed.push({ lessonId: l.id, title: l.title, reason: 'vídeo não encontrado ou sem permissão' });
        continue;
      }
      if (info.status && info.status !== 'available') result.notReady.push(`${l.title} (${info.status})`);
      await this.prisma.lesson.update({
        where: { id: l.id },
        data: { durationSeconds: info.durationSeconds, thumbnailUrl: info.thumbnail, vimeoHash: l.vimeoHash ?? info.hash ?? null, vimeoSyncedAt: new Date() },
      });
      result.updated++;
    }
    await this.audit.log(me, 'vimeo.sync', 'lesson', undefined, { courseId, updated: result.updated });
    return result;
  }

  // ====================================================== builder (Claude)
  /**
   * Cria um planeta completo numa única transação: se qualquer parte falhar,
   * nada é gravado. É o que o Claude chama quando o MASTER pede
   * "cria para mim o planeta Comunicação com estes vídeos do Vimeo".
   */
  async buildPlanet(me: AuthUser, spec: PlanetTree) {
    const { courses, ...planetData } = spec;
    if (planetData.slug && (await this.prisma.planet.findUnique({ where: { slug: planetData.slug } }))) {
      throw new ConflictException(`Já existe um planeta com slug "${planetData.slug}"`);
    }
    const videoMeta = await this.prefetchVimeo(courses);
    const planet = await this.prisma.$transaction(
      async (tx) => {
        const p = await this.createPlanet(me, planetData, tx);
        for (const [i, c] of courses.entries()) await this.buildCourseTx(me, tx, p.id, c, i, videoMeta);
        return p;
      },
      { timeout: 120_000 },
    );
    return this.summary(planet.id);
  }

  /** Adiciona um curso completo (unidades, vídeos, práticas, prova) a um planeta existente. */
  async buildCourse(me: AuthUser, planetId: string, spec: CourseTree) {
    await this.prisma.planet.findUniqueOrThrow({ where: { id: planetId } });
    const videoMeta = await this.prefetchVimeo([spec]);
    const order = await this.prisma.course.count({ where: { planetId } });
    await this.prisma.$transaction((tx) => this.buildCourseTx(me, tx, planetId, spec, order, videoMeta), { timeout: 120_000 });
    return this.summary(planetId);
  }

  private async buildCourseTx(me: AuthUser, tx: Tx, planetId: string, c: CourseTree, order: number, videoMeta: Map<string, { durationSeconds?: number; thumbnail?: string; hash?: string }>) {
    const { units, exam, trailTemplate, ...courseData } = c;
    // modelo de trilha pelo código (ADR 0013); código desconhecido é recusado para o Claude corrigir
    let trailTemplateId: string | undefined;
    if (trailTemplate) {
      const t = await tx.trailTemplate.findUnique({ where: { code: trailTemplate }, select: { id: true } });
      if (!t) throw new BadRequestException(`Modelo de trilha "${trailTemplate}" não existe. Use list_trail_templates.`);
      trailTemplateId = t.id;
    }
    const course = await this.createCourse(me, { ...courseData, planetId, sortOrder: order, ...(trailTemplateId ? { trailTemplateId } : {}) }, tx);
    for (const [ui, u] of units.entries()) {
      const unit = await tx.unit.create({
        data: { courseId: course.id, title: u.title, description: u.description, themeColor: u.themeColor, accessTier: u.accessTier ?? null, sortOrder: ui },
      });
      let pos = 0;
      let lastVideoId: string | undefined;
      for (const l of u.lessons) {
        if (l.type === 'LESSON') {
          await tx.lesson.create({
            data: { unitId: unit.id, type: 'LESSON', title: l.title, code: l.code, content: l.content as Prisma.InputJsonValue, sortOrder: pos++, xpReward: l.xpReward ?? 5 },
          });
          continue;
        }
        if (l.type === 'GENERATED_PRACTICE') {
          await tx.lesson.create({
            data: {
              unitId: unit.id, type: 'PRACTICE', questionSource: 'GENERATED', title: l.title, code: l.code, generators: l.generators,
              questionCount: l.questionCount, isReview: l.isReview ?? false, passingPct: l.passingPct ?? 0, sortOrder: pos++, xpReward: l.xpReward ?? 10,
            },
          });
          continue;
        }
        if (l.type === 'VIDEO') {
          const parsed = this.vimeo.parse(l.vimeoUrl);
          if (!parsed) throw new BadRequestException(`URL do Vimeo inválida: ${l.vimeoUrl}`);
          const video = await tx.lesson.create({
            data: {
              unitId: unit.id,
              type: 'VIDEO',
              title: l.title,
              code: l.code,
              videoTitle: l.videoTitle,
              description: l.description,
              sortOrder: pos++,
              xpReward: l.xpReward ?? 10,
              vimeoUrl: l.vimeoUrl,
              vimeoVideoId: parsed.id,
              vimeoHash: parsed.hash ?? videoMeta.get(l.vimeoUrl)?.hash,
              durationSeconds: l.durationSeconds ?? videoMeta.get(l.vimeoUrl)?.durationSeconds,
              thumbnailUrl: videoMeta.get(l.vimeoUrl)?.thumbnail,
              vimeoSyncedAt: videoMeta.has(l.vimeoUrl) ? new Date() : null,
            },
          });
          lastVideoId = video.id;
          if (l.practice) {
            const practice = await tx.lesson.create({
              data: {
                unitId: unit.id,
                type: 'PRACTICE',
                title: l.practice.title ?? `Prática: ${l.title}`,
                sortOrder: pos++,
                relatedLessonId: video.id,
                passingPct: l.practice.passingPct ?? 0,
                xpReward: l.practice.xpReward ?? 10,
              },
            });
            await this.createQuestions(tx, { lessonId: practice.id }, l.practice.questions);
          }
        } else if (l.type === 'PRACTICE') {
          const practice = await tx.lesson.create({
            data: {
              unitId: unit.id,
              type: 'PRACTICE',
              title: l.title,
              code: l.code,
              sortOrder: pos++,
              relatedLessonId: lastVideoId,
              passingPct: l.passingPct ?? 0,
              xpReward: l.xpReward ?? 10,
            },
          });
          await this.createQuestions(tx, { lessonId: practice.id }, l.questions);
        } else {
          await tx.lesson.create({
            data: { unitId: unit.id, type: 'INTERACTIVE', title: l.title, sortOrder: pos++, interactivePackageId: l.interactivePackageId, xpReward: l.xpReward ?? 20 },
          });
        }
      }
    }
    if (exam) await this.upsertExam(me, course.id, exam, tx);
    return course;
  }

  /** Busca duração dos vídeos no Vimeo ANTES da transação (evita I/O externo dentro dela). */
  private async prefetchVimeo(courses: CourseTree[]) {
    const map = new Map<string, { durationSeconds?: number; thumbnail?: string; hash?: string }>();
    if (!this.vimeo.enabled) return map;
    const urls = courses.flatMap((c) => c.units.flatMap((u) => u.lessons.flatMap((l) => (l.type === 'VIDEO' ? [l.vimeoUrl] : []))));
    await Promise.all(
      [...new Set(urls)].map(async (url) => {
        const info = await this.vimeo.getVideo(url);
        if (info) map.set(url, { durationSeconds: info.durationSeconds, thumbnail: info.thumbnail, hash: info.hash });
      }),
    );
    return map;
  }

  async summary(planetId: string) {
    const p = await this.prisma.planet.findUniqueOrThrow({
      where: { id: planetId },
      include: {
        category: { select: { name: true } },
        courses: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            title: true,
            status: true,
            units: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, lessons: { orderBy: { sortOrder: 'asc' }, select: { id: true, type: true, title: true } } } },
            exam: { select: { id: true, _count: { select: { questions: true } } } },
          },
        },
      },
    });
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category.name,
      status: p.status,
      accessTier: p.accessTier,
      courses: p.courses.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        units: c.units.map((u) => ({ id: u.id, title: u.title, lessons: u.lessons })),
        examQuestions: c.exam?._count.questions ?? 0,
      })),
    };
  }

  // =============================================================== helpers
  private courseJson<T extends { badge?: unknown; gameConfig?: unknown }>(dto: T) {
    const j = (v: unknown) => (v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue | undefined));
    return { ...dto, badge: j(dto.badge), gameConfig: j(dto.gameConfig) } as Omit<T, 'badge' | 'gameConfig'> & { badge: any; gameConfig: any };
  }

  private async resolveCategory(tx: Tx, id?: string, slug?: string) {
    if (id) return id;
    if (!slug) throw new BadRequestException('Informe categoryId ou categorySlug');
    const c = await tx.studyCategory.findUnique({ where: { slug } });
    if (!c) throw new NotFoundException(`Categoria "${slug}" não existe`);
    return c.id;
  }

  private async resolveVimeo(type: string, url?: string) {
    if (type !== 'VIDEO') return {};
    if (!url) throw new BadRequestException('vimeoUrl obrigatório para lições de vídeo');
    const info = await this.vimeo.getVideo(url);
    if (!info) throw new BadRequestException(`URL do Vimeo inválida: ${url}`);
    return {
      vimeoUrl: url,
      vimeoVideoId: info.id,
      vimeoHash: info.hash,
      durationSeconds: info.durationSeconds,
      thumbnailUrl: info.thumbnail,
      vimeoSyncedAt: this.vimeo.enabled ? new Date() : null,
    };
  }

  private async uniquePlanetSlug(tx: Tx, name: string) {
    const base = slugify(name);
    let s = base;
    for (let i = 2; await tx.planet.findUnique({ where: { slug: s } }); i++) s = `${base}-${i}`;
    return s;
  }

  private async uniqueCourseSlug(tx: Tx, planetId: string, title: string) {
    const base = slugify(title);
    let s = base;
    for (let i = 2; await tx.course.findUnique({ where: { planetId_slug: { planetId, slug: s } } }); i++) s = `${base}-${i}`;
    return s;
  }
}
