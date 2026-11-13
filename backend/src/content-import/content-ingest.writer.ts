import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Course, Lesson, Planet, Plan, Question } from '@folks/content-ingest';
import { parseVimeo, slugify, toStorage } from '@folks/content-ingest';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;
type PlanPlanet = Plan['planets'][number];

export interface PlanetWriteResult {
  slug: string;
  name: string;
  action: string;
  planetId?: string;
  courses: Array<{ key: string; title: string; action: string; courseId?: string; reason?: string }>;
  videosPending: number;
  error?: string;
}

const XP: Record<Lesson['type'], number> = { LESSON: 5, VIDEO: 10, PRACTICE: 10, GENERATED_PRACTICE: 10, INTERACTIVE: 20 };

/**
 * Grava UM planeta do formato canônico no banco, dentro de uma transação.
 * Segue o plano (planImport) à risca: só cria/substitui o que o plano mandou.
 * Curso com progresso de alunos nunca chega aqui como REPLACE (vira CONFLICT no plano).
 */
@Injectable()
export class ContentIngestWriter {
  constructor(private readonly prisma: PrismaService) {}

  async writePlanet(
    planet: Planet,
    planRow: PlanPlanet,
    opts: { importId: string; publish: boolean; durations?: Map<string, number> },
  ): Promise<PlanetWriteResult> {
    const result: PlanetWriteResult = { slug: planet.slug, name: planet.name, action: planRow.action, courses: [], videosPending: 0 };
    if (planRow.action !== 'CREATE' && planRow.action !== 'UPDATE') {
      result.courses = planRow.courses.map((c) => ({ key: c.key, title: c.title, action: c.action, reason: c.reason }));
      return result;
    }

    await this.prisma.$transaction(
      async (tx) => {
        const category = await tx.studyCategory.findUniqueOrThrow({ where: { slug: planet.category } });
        // Só campos PRESENTES na importação: atualizar um planeta existente (ex.: vindo do
        // catálogo, com cor e visual próprios) nunca apaga o que a importação não trouxe.
        const meta = {
          name: planet.name,
          accessTier: planet.accessTier,
          categoryId: category.id,
          contentHash: planRow.planetHash,
          sourceImportId: opts.importId,
          ...(planet.shortName !== undefined ? { shortName: planet.shortName } : {}),
          ...(planet.description !== undefined ? { description: planet.description } : {}),
          ...(planet.themeColor !== undefined ? { themeColor: planet.themeColor } : {}),
          ...(planet.visual !== undefined ? { visual: planet.visual as Prisma.InputJsonValue } : {}),
          ...(planet.sortOrder !== undefined ? { sortOrder: planet.sortOrder } : {}),
          ...(planet.vimeoFolder ? { vimeoFolderUri: `/projects/${planet.vimeoFolder.match(/(\d+)\/?$/)?.[1] ?? planet.vimeoFolder}` } : {}),
        };
        const defaultStatus = planet.courses.length ? (opts.publish ? 'PUBLISHED' : 'DRAFT') : 'COMING_SOON';
        const row =
          planRow.action === 'CREATE'
            ? await tx.planet.create({ data: { ...meta, slug: planet.slug, status: planet.status ?? defaultStatus } })
            : await tx.planet.update({ where: { slug: planet.slug }, data: { ...meta, ...(planet.status ? { status: planet.status } : opts.publish ? { status: 'PUBLISHED' } : {}) } });
        result.planetId = row.id;

        for (const [ci, course] of planet.courses.entries()) {
          const pc = planRow.courses.find((c) => c.key === course.key);
          if (!pc || (pc.action !== 'CREATE' && pc.action !== 'REPLACE')) {
            result.courses.push({ key: course.key, title: course.title, action: pc?.action ?? 'SKIP', reason: pc?.reason });
            continue;
          }
          const courseId = await this.writeCourse(tx, row.id, course, ci, pc.action, pc.contentHash, opts);
          result.videosPending += course.units.flatMap((u) => u.lessons).filter((l) => l.type === 'VIDEO' && !l.vimeoUrl).length;
          result.courses.push({ key: course.key, title: course.title, action: pc.action, courseId });
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return result;
  }

  private async writeCourse(tx: Tx, planetId: string, c: Course, order: number, action: 'CREATE' | 'REPLACE', hash: string, opts: { importId: string; publish: boolean; durations?: Map<string, number> }) {
    // modelo de trilha (ADR 0013): só quando a importação informa; código inexistente já virou aviso na prévia
    const trailTemplateId = c.trailTemplate ? ((await tx.trailTemplate.findUnique({ where: { code: c.trailTemplate }, select: { id: true } }))?.id ?? null) : undefined;
    const data = {
      ...(trailTemplateId !== undefined ? { trailTemplateId } : {}),
      title: c.title,
      slug: c.slug,
      description: c.description ?? null,
      accessTier: c.accessTier ?? null,
      hasCertificate: c.hasCertificate,
      estimatedMinutes: c.estimatedMinutes ?? null,
      icon: c.icon ?? null,
      meta: c.meta ?? null,
      drillLabel: c.drillLabel ?? null,
      badge: c.badge ? (c.badge as Prisma.InputJsonValue) : Prisma.DbNull,
      contentHash: hash,
      sourceImportId: opts.importId,
    };
    const status = c.status ?? (c.units.length ? (opts.publish ? 'PUBLISHED' : 'DRAFT') : 'COMING_SOON');
    let courseId: string;
    if (action === 'CREATE') {
      courseId = (await tx.course.create({ data: { ...data, planetId, code: c.key, sortOrder: order, status } })).id;
    } else {
      // nunca substitui curso arquivado (mesma regra do planejador)
      const existing = await tx.course.findFirst({ where: { planetId, status: { not: 'ARCHIVED' }, OR: [{ code: c.key }, { slug: c.slug }] } })
        ?? (await tx.course.findMany({ where: { planetId, status: { not: 'ARCHIVED' } } })).find((x) => slugify(x.title) === slugify(c.title));
      if (!existing) throw new Error(`Curso "${c.title}" não encontrado para substituir`);
      courseId = existing.id;
      // trilha antiga sai inteira (unidades -> etapas -> questões em cascata) e é recriada
      await tx.unit.deleteMany({ where: { courseId } });
      await tx.exam.deleteMany({ where: { courseId } });
      // mantém o code existente (ex.: "comunicacao-0" do catálogo) para não quebrar referências;
      // status: o informado, ou PUBLISHED se pedido, ou DRAFT se era um "Em breve" sem trilha
      const status = c.status ?? (opts.publish ? 'PUBLISHED' : existing.status === 'COMING_SOON' && c.units.length ? 'DRAFT' : undefined);
      await tx.course.update({ where: { id: courseId }, data: { ...data, code: existing.code ?? c.key, ...(status ? { status } : {}) } });
    }

    for (const [ui, u] of c.units.entries()) {
      const unit = await tx.unit.create({ data: { courseId, title: u.title, description: u.description ?? null, accessTier: u.accessTier ?? null, themeColor: u.color ?? null, sortOrder: ui } });
      let lastContentLessonId: string | undefined; // prática se refere ao vídeo/aula anterior
      for (const [li, l] of u.lessons.entries()) {
        const base = { unitId: unit.id, title: l.title, sortOrder: li, xpReward: XP[l.type] };
        if (l.type === 'LESSON') {
          // telas: texto em partes, widget interativo e "confere rapidinho" ficam no JSON da aula
          const row = await tx.lesson.create({ data: { ...base, type: 'LESSON', content: { slides: l.slides } as unknown as Prisma.InputJsonValue } });
          lastContentLessonId = row.id;
        } else if (l.type === 'VIDEO') {
          const v = l.vimeoUrl ? parseVimeo(l.vimeoUrl) : null;
          const row = await tx.lesson.create({
            data: {
              ...base,
              type: 'VIDEO',
              description: l.description ?? null,
              videoTitle: l.videoTitle ?? l.title,
              vimeoUrl: l.vimeoUrl,
              vimeoVideoId: v?.id ?? null,
              vimeoHash: v?.hash ?? null,
              durationSeconds: l.durationSeconds ?? (l.vimeoUrl ? opts.durations?.get(l.vimeoUrl) : undefined) ?? null,
            },
          });
          lastContentLessonId = row.id;
        } else if (l.type === 'PRACTICE') {
          const row = await tx.lesson.create({
            data: {
              ...base,
              type: 'PRACTICE',
              questionSource: 'BANK',
              passingPct: l.passingPct ?? 0,
              isReview: !!l.isReview,
              relatedLessonId: lastContentLessonId ?? null,
              questionCount: l.questionsPerRound ?? null,
              generators: l.generators?.map((g) => g.methodology) ?? [],
              generatorSpecs: l.generators?.length ? (l.generators as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            },
          });
          await this.writeQuestions(tx, { lessonId: row.id }, l.questions);
        } else if (l.type === 'GENERATED_PRACTICE') {
          await tx.lesson.create({ data: { ...base, type: 'PRACTICE', questionSource: 'GENERATED', generators: l.generators, questionCount: l.questionCount, isReview: !!l.isReview } });
        } else {
          await tx.lesson.create({ data: { ...base, type: 'INTERACTIVE', interactivePackageId: l.interactivePackageId } });
        }
      }
    }

    if (c.exam) {
      const exam = await tx.exam.create({
        data: {
          courseId,
          title: c.exam.title,
          questionSource: c.exam.questionSource,
          generators: c.exam.generators ?? [],
          questionCount: c.exam.questionCount ?? null,
          passingScore: c.exam.passingScore ?? null,
          timeLimitMinutes: c.exam.timeLimitMinutes ?? null,
          shuffle: true,
        },
      });
      if (c.exam.questions?.length) await this.writeQuestions(tx, { examId: exam.id }, c.exam.questions);
    }
    return courseId;
  }

  private async writeQuestions(tx: Tx, target: { lessonId?: string; examId?: string }, qs: Question[]) {
    for (const [i, q] of qs.entries()) {
      const st = toStorage(q);
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
          sortOrder: i,
          ...(st.options.length ? { options: { create: st.options.map((o, j) => ({ ...o, sortOrder: j })) } } : {}),
        },
      });
    }
  }
}
