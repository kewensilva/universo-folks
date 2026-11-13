import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityKind, AccessTier, Lesson, Prisma, XpSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { EntitlementsService } from '../access/entitlements.service';
import { GamificationService } from '../gamification/gamification.service';
import { CertificatesService } from '../certificates/certificates.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { AuthUser } from '../common/types';
import { pct, shuffle } from '../common/utils';
import { gradeQuestion, publicQuestion as toPublicQuestion } from '@folks/content-ingest';
import type { AnswerPayload, StoredQuestion } from '@folks/content-ingest';

export type StepState = 'COMPLETED' | 'AVAILABLE' | 'LOCKED';

/**
 * Resposta de uma questão. Escolha usa optionIds; NUMBER value; ORDER/BUILD_SENTENCE sequence;
 * MATCH_PAIRS pairs; CLASSIFY assignments; SIMULATOR simulator. timeMs dá bônus de XP com cronômetro.
 */
export type AnswerInput = AnswerPayload;

/** Resultado informado pelo app para exercícios GERADOS no aparelho. */
export interface GeneratedResult {
  correct: number;
  total: number;
  /** XP calculado no app (combo etc.). O servidor aplica teto. */
  xp?: number;
}

type LessonWithUnit = Lesson & { unit: { courseId: string; accessTier: AccessTier | null } };

const FAST_ANSWER_MS = 10_000;

const lessonKind = (l: Pick<Lesson, 'type' | 'isReview'>): ActivityKind =>
  l.type === 'LESSON' || l.type === 'VIDEO' ? 'LESSON' : l.type === 'INTERACTIVE' ? 'INTERACTIVE' : l.isReview ? 'REVIEW' : 'PRACTICE';
const lessonSource = (l: Pick<Lesson, 'type'>): XpSource =>
  l.type === 'LESSON' ? 'LESSON' : l.type === 'VIDEO' ? 'VIDEO' : l.type === 'INTERACTIVE' ? 'INTERACTIVE' : 'PRACTICE';

/**
 * Trilha e progresso. Suporta os dois modelos de conteúdo:
 *  - BANK: questões cadastradas no banco, corrigidas no servidor (certificações B2B);
 *  - GENERATED: exercícios gerados no aparelho pelos "generators" do protótipo
 *    (tabuada, porcentagem, ouvido...). O app informa acertos/total e o servidor
 *    valida ordem, acesso Premium, nota mínima e aplica teto de XP.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly entitlements: EntitlementsService,
    private readonly gamification: GamificationService,
    private readonly certificates: CertificatesService,
    private readonly settings: PlatformSettingsService,
  ) {}

  // =================================================================== trilha
  async trail(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        planet: { select: { id: true, name: true, slug: true, accessTier: true, status: true, categoryId: true, themeColor: true, imageUrl: true, mascotUrl: true, visual: true } },
        units: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true, code: true, type: true, title: true, xpReward: true, durationSeconds: true, videoTitle: true, sortOrder: true,
                questionSource: true, generators: true, questionCount: true, isReview: true,
              },
            },
          },
        },
        exam: { select: { id: true, title: true, timeLimitMinutes: true, passingScore: true, questionCount: true, questionSource: true, generators: true, _count: { select: { questions: true } } } },
      },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');
    const access = await this.access.courseAccess(user, course, course.planet);
    if (!access.visible) throw new NotFoundException('Curso não encontrado');
    // conteúdo Premium desta galáxia liberado pelo plano de acesso (Básico / Premium / Premium Plus)
    const premium = await this.access.premiumFor(user, course.planet.categoryId);
    const courseTier = this.access.effectiveTier(course, course.planet);

    const lessons = course.units.flatMap((u) => u.lessons);
    const [progress, record, badge] = await Promise.all([
      this.prisma.lessonProgress.findMany({ where: { userId: user.id, lessonId: { in: lessons.map((l) => l.id) } } }),
      this.prisma.infiniteRecord.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } }),
      this.prisma.userBadge.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } }),
    ]);
    const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
    const sequential = await this.access.sequentialFlow(user);

    let blocked = access.locked;
    let currentLessonId: string | null = null;
    const units = course.units.map((u, idx) => {
      const tier = u.accessTier ?? courseTier;
      const premiumLocked = tier === 'PREMIUM' && !premium;
      return {
        id: u.id,
        number: idx + 1,
        title: u.title,
        description: u.description,
        themeColor: u.themeColor,
        accessTier: tier,
        locked: premiumLocked,
        lockReason: premiumLocked ? ('PREMIUM_REQUIRED' as const) : undefined,
        lessons: u.lessons.map((l) => {
          const p = byLesson.get(l.id);
          const done = p?.status === 'COMPLETED';
          let state: StepState = done ? 'COMPLETED' : blocked || premiumLocked ? 'LOCKED' : 'AVAILABLE';
          if (state === 'AVAILABLE') {
            if (!currentLessonId) currentLessonId = l.id;
            if (sequential) blocked = true;
          } else if (!done && sequential) {
            blocked = true;
          }
          return { ...l, state, watchedSeconds: p?.watchedSeconds ?? 0, bestScorePct: p?.bestScorePct ?? null };
        }),
      };
    });

    const completed = progress.filter((p) => p.status === 'COMPLETED').length;
    const allLessonsDone = lessons.length > 0 && completed === lessons.length;
    const examInfo = course.exam ? await this.examStatus(user, course.exam.id, course.exam.passingScore) : null;
    const examTier = course.units.at(-1)?.accessTier ?? courseTier;
    const examPremiumLocked = examTier === 'PREMIUM' && !premium;
    const totalSteps = lessons.length + (course.exam ? 1 : 0);
    const doneSteps = completed + (examInfo?.passed ? 1 : 0);

    return {
      course: {
        id: course.id,
        code: course.code,
        title: course.title,
        description: course.description,
        imageUrl: course.imageUrl,
        icon: course.icon,
        hasCertificate: course.hasCertificate,
        badge: course.badge,
        drillLabel: course.drillLabel,
        gameUrl: course.gameUrl,
        accessTier: courseTier,
      },
      planet: course.planet,
      access,
      /** plano de acesso que libera as unidades Premium (null = já liberadas) */
      requiredPlan: premium ? null : access.requiredPlan ?? (user.mode === 'B2C' ? this.access.requiredPlanFor(course.planet.categoryId, await this.access.upgradeTiers()) : null),
      progressPct: pct(doneSteps, totalSteps),
      completedLessons: completed,
      totalLessons: lessons.length,
      currentLessonId,
      infinitePractice: { unlocked: completed > 0 && !access.locked, drillLabel: course.drillLabel, record: record ? { bestRun: record.bestRun, sessions: record.sessions } : null },
      badgeEarned: badge ? { earnedAt: badge.earnedAt } : null,
      units,
      exam: course.exam
        ? {
            id: course.exam.id,
            title: course.exam.title,
            timeLimitMinutes: course.exam.timeLimitMinutes,
            questionSource: course.exam.questionSource,
            generators: course.exam.generators,
            questionCount: course.exam.questionCount ?? course.exam._count.questions,
            state: (examInfo!.passed ? 'COMPLETED' : allLessonsDone && !access.locked && !examPremiumLocked ? 'AVAILABLE' : 'LOCKED') as StepState,
            lockReason: examPremiumLocked ? 'PREMIUM_REQUIRED' : undefined,
            ...examInfo,
          }
        : null,
    };
  }

  /** Próxima etapa de cada curso em andamento ("Continue estudando"). */
  async continueStudying(user: AuthUser, limit = 6) {
    const planetWhere = await this.access.planetWhere(user);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: user.id, status: 'IN_PROGRESS', course: { status: 'PUBLISHED', planet: planetWhere } },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { course: { select: { id: true, code: true, title: true, gameUrl: true, planet: { select: { id: true, name: true, slug: true, themeColor: true, mascotUrl: true, imageUrl: true, visual: true } } } } },
    });
    const out = [];
    for (const e of enrollments) {
      const next = e.course.gameUrl ? { type: 'GAME' as const, title: 'Continuar o jogo' } : await this.nextStep(user.id, e.courseId);
      out.push({ courseId: e.courseId, code: e.course.code, title: e.course.title, planet: e.course.planet, progressPct: e.progressPct, nextStep: next });
    }
    return out;
  }

  private async nextStep(userId: string, courseId: string) {
    const lessons = await this.prisma.lesson.findMany({
      where: { unit: { courseId } },
      orderBy: [{ unit: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      select: { id: true, type: true, title: true, progress: { where: { userId, status: 'COMPLETED' }, select: { id: true } } },
    });
    const l = lessons.find((x) => x.progress.length === 0);
    return l ? { lessonId: l.id, type: l.type, title: l.title } : { type: 'EXAM' as const, title: 'Desafio final' };
  }

  /** Tudo que o app precisa para montar o estado local (S do protótipo) numa chamada. */
  async snapshot(user: AuthUser) {
    const [completions, courseStates, gameStates, records, badges, recent] = await Promise.all([
      this.prisma.lessonProgress.findMany({
        where: { userId: user.id, status: 'COMPLETED' },
        select: { lessonId: true, bestScorePct: true, completedAt: true, lesson: { select: { code: true, unit: { select: { courseId: true } } } } },
      }),
      this.prisma.courseState.findMany({ where: { userId: user.id }, select: { courseId: true, state: true, updatedAt: true } }),
      this.prisma.gameState.findMany({ where: { userId: user.id }, select: { gameId: true, state: true, updatedAt: true } }),
      this.prisma.infiniteRecord.findMany({ where: { userId: user.id } }),
      this.prisma.userBadge.findMany({ where: { userId: user.id }, select: { courseId: true, earnedAt: true, course: { select: { code: true, badge: true } } } }),
      this.prisma.enrollment.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' }, take: 6, select: { courseId: true } }),
    ]);
    return {
      completions: completions.map((c) => ({ lessonId: c.lessonId, nodeCode: c.lesson.code, courseId: c.lesson.unit.courseId, scorePct: c.bestScorePct, completedAt: c.completedAt })),
      courseStates,
      gameStates,
      infiniteRecords: records.map((r) => ({ courseId: r.courseId, bestRun: r.bestRun, totalAnswered: r.totalAnswered, sessions: r.sessions })),
      badges: badges.map((b) => ({ courseId: b.courseId, code: b.course.code, badge: b.course.badge, earnedAt: b.earnedAt })),
      recentCourseIds: recent.map((r) => r.courseId),
    };
  }

  // =================================================================== lições
  async getLesson(user: AuthUser, lessonId: string) {
    const { lesson } = await this.assertLessonUnlocked(user, lessonId);
    const base = { id: lesson.id, code: lesson.code, type: lesson.type, title: lesson.title, description: lesson.description, xpReward: lesson.xpReward, courseId: lesson.unit.courseId };
    if (lesson.type === 'LESSON') return { ...base, content: lesson.content };
    if (lesson.type === 'VIDEO') {
      return {
        ...base,
        video: {
          provider: 'vimeo',
          videoId: lesson.vimeoVideoId,
          hash: lesson.vimeoHash,
          title: lesson.videoTitle,
          thumbnailUrl: lesson.thumbnailUrl,
          embedUrl: lesson.vimeoVideoId ? `https://player.vimeo.com/video/${lesson.vimeoVideoId}${lesson.vimeoHash ? `?h=${lesson.vimeoHash}` : ''}` : null,
          durationSeconds: lesson.durationSeconds,
          minWatchPct: lesson.minWatchPct,
        },
      };
    }
    if (lesson.type === 'PRACTICE') {
      if (lesson.questionSource === 'GENERATED') {
        return { ...base, questionSource: 'GENERATED', generators: lesson.generators, questionCount: lesson.questionCount, isReview: lesson.isReview, passingPct: lesson.passingPct };
      }
      const questions = await this.prisma.question.findMany({
        where: { lessonId },
        orderBy: { sortOrder: 'asc' },
        include: { options: { orderBy: { sortOrder: 'asc' }, select: { id: true, text: true } } },
      });
      // rodada: sorteia `questionCount` questões do banco (null = todas, na ordem)
      const perRound = lesson.questionCount && lesson.questionCount < questions.length ? lesson.questionCount : null;
      const round = perRound ? shuffle(questions).slice(0, perRound) : questions;
      return {
        ...base,
        questionSource: 'BANK',
        relatedLessonId: lesson.relatedLessonId,
        passingPct: lesson.passingPct,
        questionsPerRound: perRound,
        questions: round.map((q) => this.publicQuestion(q)),
      };
    }
    return { ...base, interactive: { packageId: lesson.interactivePackageId, launch: `/api/interactive/lessons/${lesson.id}/launch` } };
  }

  /** Conclui uma AULA (telas/slides). */
  async completeLessonScreen(user: AuthUser, lessonId: string) {
    const { lesson } = await this.assertLessonUnlocked(user, lessonId);
    if (lesson.type !== 'LESSON') throw new BadRequestException('Esta etapa não é uma aula');
    await this.touchEnrollment(user.id, lesson.unit.courseId, lessonId);
    return this.completeLesson(user, lesson, { xp: await this.settings.get('xp_lesson') });
  }

  /** Progresso do vídeo. Conclui ao atingir a % mínima assistida. */
  async videoProgress(user: AuthUser, lessonId: string, watchedSeconds: number, ended?: boolean) {
    const { lesson } = await this.assertLessonUnlocked(user, lessonId);
    if (lesson.type !== 'VIDEO') throw new BadRequestException('Lição não é um vídeo');
    const duration = lesson.durationSeconds ?? 0;
    const existing = await this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId } } });
    // Anti-pulo: o tempo assistido só avança no ritmo do relógio (até 2x de velocidade).
    // O app envia o progresso periodicamente (ex.: a cada 10-15s pelo Vimeo Player SDK).
    const prevWatched = existing?.watchedSeconds ?? 0;
    const elapsed = existing ? (Date.now() - existing.updatedAt.getTime()) / 1000 : 0;
    const antiSkip = await this.settings.get('video_anti_skip');
    // folga de 15s só no primeiro envio; depois, no máximo 2s de vídeo por segundo real
    const maxAllowed = antiSkip ? (existing ? prevWatched + Math.floor(elapsed * 2) : 15) : Infinity;
    let watched = Math.floor(Math.max(0, Math.min(watchedSeconds, duration || watchedSeconds, existing?.status === 'COMPLETED' ? Infinity : maxAllowed)));
    if (existing?.status === 'COMPLETED') watched = Math.max(watched, prevWatched);
    const reached = duration > 0 ? watched >= (duration * lesson.minWatchPct) / 100 : !!ended;

    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      create: { userId: user.id, lessonId, watchedSeconds: watched, status: 'IN_PROGRESS' },
      update: { watchedSeconds: Math.max(existing?.watchedSeconds ?? 0, watched) },
    });
    await this.touchEnrollment(user.id, lesson.unit.courseId, lessonId);
    const requiredSeconds = duration ? Math.ceil((duration * lesson.minWatchPct) / 100) : null;
    if (!reached) return { completed: existing?.status === 'COMPLETED', watchedSeconds: watched, requiredSeconds };
    // já concluído: rever conta engajamento uma vez (no fim do vídeo), não a cada envio de progresso
    if (existing?.status === 'COMPLETED' && !ended) return { completed: true, alreadyCompleted: true, watchedSeconds: watched, requiredSeconds, next: await this.nextStep(user.id, lesson.unit.courseId) };
    return this.completeLesson(user, lesson, { xp: lesson.xpReward });
  }

  /** Prática com questões do BANCO - corrigida no servidor. */
  async submitPractice(user: AuthUser, lessonId: string, answers: AnswerInput[]) {
    const { lesson } = await this.assertLessonUnlocked(user, lessonId);
    if (lesson.type !== 'PRACTICE') throw new BadRequestException('Lição não é uma prática');
    if (lesson.questionSource === 'GENERATED') throw new BadRequestException('Prática gerada no app: envie o resultado em /practice-result');
    const all = await this.loadQuestions({ lessonId });
    let questions = all;
    if (lesson.questionCount && lesson.questionCount < all.length) {
      // rodada sorteada: corrige as questões respondidas (todas precisam ser desta prática)
      const answered = new Set(answers.map((a) => a.questionId));
      questions = all.filter((q) => answered.has(q.id));
      if (questions.length < lesson.questionCount) throw new BadRequestException(`Responda as ${lesson.questionCount} questões da rodada`);
    }
    const graded = await this.grade(user, questions, answers, true);
    return this.finishPractice(user, lesson, graded.correct, graded.total, graded.scorePct, graded.xp, answers, graded.result);
  }

  /** Prática GERADA no aparelho - o app informa acertos/total. */
  async submitGeneratedPractice(user: AuthUser, lessonId: string, r: GeneratedResult) {
    const { lesson } = await this.assertLessonUnlocked(user, lessonId);
    if (lesson.type !== 'PRACTICE') throw new BadRequestException('Lição não é uma prática');
    if (lesson.questionSource !== 'GENERATED') throw new BadRequestException('Esta prática usa questões do banco: envie as respostas em /practice');
    this.assertResult(r, lesson.questionCount);
    const s = await this.settings.all();
    const xp = r.xp ?? r.correct * s.xp_practice_correct;
    return this.finishPractice(user, lesson, r.correct, r.total, pct(r.correct, r.total), xp, r, { correct: r.correct, total: r.total, scorePct: pct(r.correct, r.total) });
  }

  private async finishPractice(user: AuthUser, lesson: LessonWithUnit, correct: number, total: number, scorePct: number, xp: number, answers: unknown, result: Record<string, unknown>) {
    const prev = await this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } } });
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
      create: { userId: user.id, lessonId: lesson.id, attempts: 1, bestScorePct: scorePct, status: 'IN_PROGRESS' },
      update: { attempts: { increment: 1 }, bestScorePct: Math.max(prev?.bestScorePct ?? 0, scorePct) },
    });
    const passed = scorePct >= lesson.passingPct;
    const firstCompletion = passed && prev?.status !== 'COMPLETED';
    // XP cheio só na primeira conclusão; repetir conta engajamento (para XP há a prática infinita)
    const xpNow = firstCompletion ? xp : 0;
    await this.prisma.practiceAttempt.create({
      data: { userId: user.id, lessonId: lesson.id, courseId: lesson.unit.courseId, mode: 'LESSON', correctCount: correct, totalCount: total, scorePct, xpEarned: xpNow, answers: answers as Prisma.InputJsonValue },
    });
    await this.touchEnrollment(user.id, lesson.unit.courseId, lesson.id);
    let completion = null;
    if (passed) {
      completion = await this.completeLesson(user, lesson, { xp: xpNow, scorePct, correct, total });
    } else {
      await this.gamification.recordActivity(user, { kind: lessonKind(lesson), source: 'PRACTICE', xp: 0, courseId: lesson.unit.courseId, lessonId: lesson.id, correct, total });
    }
    return { passed, passingPct: lesson.passingPct, ...result, xpEarned: xpNow, completion };
  }

  // ======================================================== prática infinita
  /**
   * Começa uma rodada. No plano grátis consome a rodada do dia (409 daily_limit
   * quando acabou) e limita a 12 exercícios. Retorna os geradores das etapas já
   * liberadas e/ou questões do banco.
   */
  async startInfinite(user: AuthUser, courseId: string) {
    const course = await this.access.assertCourseUnlocked(user, courseId);
    const done = await this.prisma.lessonProgress.findMany({
      where: { userId: user.id, status: 'COMPLETED', lesson: { unit: { courseId } } },
      select: { lessonId: true, lesson: { select: { generators: true, generatorSpecs: true, content: true } } },
    });
    if (!done.length) throw new ForbiddenException('A prática infinita libera depois da sua primeira aula deste curso');
    const allowance = await this.entitlements.consume(user, 'INFINITE');
    const doneIds = done.map((d) => d.lessonId);
    const generators = [
      ...new Set(
        done.flatMap((d) => [...d.lesson.generators, ...(((d.lesson.content as any)?.generators as string[] | undefined) ?? [])]),
      ),
    ];
    // geradores com dados (formato do cliente): o app gera questões sem fim a partir deles
    const specs = new Map<string, unknown>();
    for (const d of done) for (const g of (Array.isArray(d.lesson.generatorSpecs) ? d.lesson.generatorSpecs : []) as unknown[]) specs.set(JSON.stringify(g), g);
    const pool = await this.prisma.question.findMany({
      where: { lesson: { type: 'PRACTICE', unit: { courseId }, OR: [{ id: { in: doneIds } }, { relatedLessonId: { in: doneIds } }] } },
      include: { options: { orderBy: { sortOrder: 'asc' }, select: { id: true, text: true } } },
    });
    const size = allowance.questionsPerRound ?? (await this.settings.get('infinite_practice_size'));
    const record = await this.prisma.infiniteRecord.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
    return {
      courseId,
      drillLabel: course.drillLabel,
      /** null = sem limite (Premium/empresa) */
      questionLimit: allowance.questionsPerRound,
      allowance,
      generators,
      generatorSpecs: [...specs.values()],
      questions: shuffle(pool).slice(0, size).map((q) => this.publicQuestion(q)),
      bestRun: record?.bestRun ?? 0,
    };
  }

  /** Fim da rodada: recorde de sequência, XP (com teto) e engajamento. */
  async finishInfinite(user: AuthUser, courseId: string, body: { answers?: AnswerInput[]; answered?: number; correct?: number; bestRun?: number; xp?: number }) {
    await this.access.assertCourseUnlocked(user, courseId);
    let answered: number;
    let correct: number;
    let xp: number;
    let items: unknown = undefined;
    if (body.answers?.length) {
      const questions = await this.loadQuestions({ id: { in: body.answers.map((a) => a.questionId) }, lesson: { unit: { courseId } } });
      if (questions.length !== body.answers.length) throw new BadRequestException('Questões inválidas para este curso');
      const g = await this.grade(user, questions, body.answers, true);
      answered = g.total;
      correct = g.correct;
      xp = g.xp;
      items = g.result.items;
    } else {
      answered = body.answered ?? 0;
      correct = body.correct ?? 0;
      if (correct > answered || answered > 500) throw new BadRequestException('Resultado inválido');
      xp = body.xp ?? correct * (await this.settings.get('xp_practice_correct'));
    }
    const bestRun = Math.min(body.bestRun ?? correct, correct);
    const prev = await this.prisma.infiniteRecord.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
    await this.prisma.infiniteRecord.upsert({
      where: { userId_courseId: { userId: user.id, courseId } },
      create: { userId: user.id, courseId, bestRun, totalAnswered: answered, sessions: 1 },
      update: { bestRun: Math.max(prev?.bestRun ?? 0, bestRun), totalAnswered: { increment: answered }, sessions: { increment: 1 } },
    });
    await this.prisma.practiceAttempt.create({
      data: { userId: user.id, courseId, mode: 'INFINITE', correctCount: correct, totalCount: answered, scorePct: pct(correct, answered), xpEarned: xp, answers: (body.answers ?? body) as Prisma.InputJsonValue },
    });
    const gamification = await this.gamification.recordActivity(user, { kind: 'INFINITE', source: 'INFINITE_PRACTICE', xp, courseId, correct, total: answered });
    return { answered, correct, scorePct: pct(correct, answered), bestRun, newBest: bestRun > (prev?.bestRun ?? 0), items, gamification };
  }

  // ============================================================ certificação
  async startExam(user: AuthUser, courseId: string) {
    await this.access.assertCourseUnlocked(user, courseId);
    const exam = await this.prisma.exam.findUnique({ where: { courseId } });
    if (!exam) throw new NotFoundException('Este curso não tem certificação');

    const trail = await this.trail(user, courseId);
    if (trail.exam?.lockReason === 'PREMIUM_REQUIRED') throw new ForbiddenException({ message: 'O desafio final faz parte do Premium', reason: 'PREMIUM_REQUIRED' });
    if (trail.completedLessons < trail.totalLessons) throw new ForbiddenException('Conclua todas as etapas da trilha para liberar a certificação');

    const open = await this.prisma.examAttempt.findFirst({
      where: { userId: user.id, examId: exam.id, submittedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    });
    const status = await this.examStatus(user, exam.id, exam.passingScore);
    if (!open) {
      if (status.passed) throw new BadRequestException('Você já foi aprovado nesta certificação');
      if (!status.canAttempt) throw new ForbiddenException({ message: 'Sem tentativas disponíveis no momento', nextAttemptAt: status.nextAttemptAt });
    }

    let attempt = open;
    if (!attempt) {
      let ids: string[] = [];
      if (exam.questionSource === 'BANK') {
        const all = await this.prisma.question.findMany({ where: { examId: exam.id }, select: { id: true }, orderBy: { sortOrder: 'asc' } });
        if (!all.length) throw new BadRequestException('Certificação sem questões cadastradas');
        ids = all.map((q) => q.id);
        if (exam.shuffle) ids = shuffle(ids);
        if (exam.questionCount) ids = ids.slice(0, exam.questionCount);
      }
      attempt = await this.prisma.examAttempt.create({
        data: {
          userId: user.id,
          examId: exam.id,
          tenantId: user.mode === 'TENANT' ? user.tenantId : null,
          questionIds: ids,
          passingScoreApplied: await this.access.passingScore(user, exam.passingScore),
          expiresAt: exam.timeLimitMinutes ? new Date(Date.now() + exam.timeLimitMinutes * 60_000) : null,
        },
      });
    }
    const base = { attemptId: attempt.id, title: exam.title, instructions: exam.instructions, passingScore: attempt.passingScoreApplied, expiresAt: attempt.expiresAt };
    if (exam.questionSource === 'GENERATED') {
      const count = exam.questionCount ?? 10;
      return { ...base, questionSource: 'GENERATED', generators: exam.generators, questionCount: count, minCorrect: Math.ceil((count * attempt.passingScoreApplied) / 100) };
    }
    const questions = await this.prisma.question.findMany({
      where: { id: { in: attempt.questionIds } },
      include: { options: { orderBy: { sortOrder: 'asc' }, select: { id: true, text: true } } },
    });
    const order = new Map(attempt.questionIds.map((id, i) => [id, i]));
    questions.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    return {
      ...base,
      questionSource: 'BANK',
      questions: questions.map((q) => this.publicQuestion(q, exam.shuffle)),
    };
  }

  /** Envio da prova: respostas (BANK) ou resultado (GENERATED). */
  async submitExam(user: AuthUser, attemptId: string, body: { answers?: AnswerInput[]; correct?: number; total?: number; xp?: number }) {
    const attempt = await this.prisma.examAttempt.findFirst({ where: { id: attemptId, userId: user.id }, include: { exam: true } });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');
    if (attempt.submittedAt) throw new BadRequestException('Tentativa já enviada');
    if (attempt.expiresAt && attempt.expiresAt.getTime() + 120_000 < Date.now()) {
      await this.prisma.examAttempt.update({ where: { id: attemptId }, data: { submittedAt: new Date(), scorePct: 0, passed: false } });
      throw new BadRequestException('Tempo da prova esgotado');
    }

    let correct: number;
    let total: number;
    let scorePct: number;
    if (attempt.exam.questionSource === 'GENERATED') {
      const r = { correct: body.correct ?? -1, total: body.total ?? 0 };
      this.assertResult(r, attempt.exam.questionCount);
      ({ correct, total } = r);
      scorePct = pct(correct, total);
    } else {
      const allowed = new Set(attempt.questionIds);
      const questions = await this.loadQuestions({ id: { in: attempt.questionIds } });
      const graded = await this.grade(user, questions, (body.answers ?? []).filter((a) => allowed.has(a.questionId)), false);
      ({ correct, total, scorePct } = graded);
    }
    const passed = scorePct >= attempt.passingScoreApplied;
    await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: { submittedAt: new Date(), answers: (body.answers ?? { correct, total }) as unknown as Prisma.InputJsonValue, scorePct, passed },
    });

    const courseId = attempt.exam.courseId;
    const xpExam = passed ? Math.max(body.xp ?? 0, await this.settings.get('xp_exam_passed')) : 0;
    const gamification = await this.gamification.recordActivity(user, { kind: 'EXAM', source: 'EXAM', xp: xpExam, courseId, correct, total, refId: attempt.examId });
    let certificates = null;
    let badge = null;
    if (passed) {
      const enrollment = await this.recalcEnrollment(user.id, courseId);
      badge = enrollment.badgeAwarded ?? null;
      certificates = await this.certificates.issueForCourse(user, courseId, scorePct);
    }
    const status = await this.examStatus(user, attempt.examId, attempt.exam.passingScore);
    return {
      scorePct,
      passingScore: attempt.passingScoreApplied,
      minCorrect: Math.ceil((total * attempt.passingScoreApplied) / 100),
      passed,
      correct,
      total,
      attemptsLeft: status.attemptsLeft,
      nextAttemptAt: status.nextAttemptAt,
      gamification,
      certificates,
      badge,
    };
  }

  async examStatus(user: AuthUser, examId: string, examPassingScore: number | null) {
    const [attempts, limits, passingScore] = await Promise.all([
      this.prisma.examAttempt.findMany({ where: { userId: user.id, examId, submittedAt: { not: null } }, orderBy: { submittedAt: 'desc' } }),
      this.access.examLimits(user),
      this.access.passingScore(user, examPassingScore),
    ]);
    const passed = attempts.some((a) => a.passed);
    const best = attempts.reduce((m, a) => Math.max(m, a.scorePct ?? 0), 0);
    const used = attempts.length;
    const attemptsLeft = limits.maxAttempts === 0 ? null : Math.max(0, limits.maxAttempts - used);
    const last = attempts[0]?.submittedAt;
    const nextAttemptAt = last && limits.cooldownHours > 0 ? new Date(last.getTime() + limits.cooldownHours * 3600_000) : null;
    // N tentativas livres; esgotadas, libera mais uma a cada "cooldown" horas.
    const cooldownOver = !nextAttemptAt || nextAttemptAt <= new Date();
    const canAttempt = !passed && (attemptsLeft === null || attemptsLeft > 0 || cooldownOver);
    return { passed, bestScorePct: used ? best : null, attemptsUsed: used, attemptsLeft, canAttempt, nextAttemptAt: canAttempt ? null : nextAttemptAt, passingScore };
  }

  // ======================================================== estados do app
  async saveCourseState(user: AuthUser, courseId: string, state: unknown) {
    await this.access.assertCourseUnlocked(user, courseId);
    await this.prisma.courseState.upsert({
      where: { userId_courseId: { userId: user.id, courseId } },
      create: { userId: user.id, courseId, state: state as Prisma.InputJsonValue },
      update: { state: state as Prisma.InputJsonValue },
    });
    return { ok: true };
  }

  /** Estado do jogo (Campo Harmônico). Atualiza o progresso do curso-jogo (dominados ÷ total). */
  async saveGameState(user: AuthUser, gameId: string, state: any) {
    await this.prisma.gameState.upsert({
      where: { userId_gameId: { userId: user.id, gameId } },
      create: { userId: user.id, gameId, state },
      update: { state },
    });
    const courses = await this.prisma.course.findMany({ where: { gameId }, select: { id: true, gameConfig: true } });
    for (const c of courses) {
      const keys: unknown[] = (c.gameConfig as any)?.masteryKeys ?? [];
      const mastered: unknown[] = Array.isArray(state?.mastered) ? state.mastered : [];
      if (!keys.length) continue;
      const progressPct = Math.min(100, pct(mastered.length, keys.length));
      const completed = progressPct >= 100;
      await this.prisma.enrollment.upsert({
        where: { userId_courseId: { userId: user.id, courseId: c.id } },
        create: { userId: user.id, courseId: c.id, progressPct, status: completed ? 'COMPLETED' : 'IN_PROGRESS', completedAt: completed ? new Date() : null },
        update: { progressPct, status: completed ? 'COMPLETED' : 'IN_PROGRESS', completedAt: completed ? new Date() : null },
      });
    }
    return { ok: true };
  }

  /** Fim de um ensaio / jam / prova do jogo: XP e engajamento. */
  async gameSession(user: AuthUser, gameId: string, r: { mode: string; correct: number; total: number; xp: number }) {
    if (r.correct > r.total) throw new BadRequestException('Resultado inválido');
    const course = await this.prisma.course.findFirst({ where: { gameId }, select: { id: true } });
    const gamification = await this.gamification.recordActivity(user, { kind: 'GAME', source: 'GAME', xp: r.xp, courseId: course?.id, correct: r.correct, total: r.total, refId: `${gameId}:${r.mode}` });
    return { gamification };
  }

  // ================================================== conclusão / progresso
  /** Usado também pelo runtime SCORM/xAPI quando o conteúdo interativo reporta conclusão. */
  async completeLesson(user: AuthUser, lesson: Lesson & { unit: { courseId: string } }, r: { xp: number; scorePct?: number; correct?: number; total?: number }) {
    const prev = await this.prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } } });
    if (prev?.status === 'COMPLETED') {
      // repetir uma etapa concluída conta engajamento, sem XP
      await this.gamification.recordActivity(user, { kind: lessonKind(lesson), source: lessonSource(lesson), xp: 0, courseId: lesson.unit.courseId, lessonId: lesson.id, correct: r.correct, total: r.total });
      return { completed: true, alreadyCompleted: true, enrollment: await this.recalcEnrollment(user.id, lesson.unit.courseId), next: await this.nextStep(user.id, lesson.unit.courseId) };
    }
    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId: lesson.id } },
      create: { userId: user.id, lessonId: lesson.id, status: 'COMPLETED', completedAt: new Date(), bestScorePct: r.scorePct },
      update: { status: 'COMPLETED', completedAt: new Date(), ...(r.scorePct != null ? { bestScorePct: Math.max(prev?.bestScorePct ?? 0, r.scorePct) } : {}) },
    });
    const gamification = await this.gamification.recordActivity(user, {
      kind: lessonKind(lesson), source: lessonSource(lesson), xp: r.xp, courseId: lesson.unit.courseId, lessonId: lesson.id, correct: r.correct, total: r.total,
    });
    const enrollment = await this.recalcEnrollment(user.id, lesson.unit.courseId, lesson.id);
    const next = await this.nextStep(user.id, lesson.unit.courseId);
    return { completed: true, gamification, enrollment, next };
  }

  private async touchEnrollment(userId: string, courseId: string, lastLessonId: string) {
    await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId, lastLessonId },
      update: { lastLessonId },
    });
  }

  /** Recalcula o progresso; ao concluir o curso concede a insígnia (se houver). */
  async recalcEnrollment(userId: string, courseId: string, lastLessonId?: string) {
    const [total, done, exam, course] = await Promise.all([
      this.prisma.lesson.count({ where: { unit: { courseId } } }),
      this.prisma.lessonProgress.count({ where: { userId, status: 'COMPLETED', lesson: { unit: { courseId } } } }),
      this.prisma.exam.findUnique({ where: { courseId }, select: { id: true } }),
      this.prisma.course.findUnique({ where: { id: courseId }, select: { badge: true } }),
    ]);
    const examPassed = exam ? (await this.prisma.examAttempt.count({ where: { userId, examId: exam.id, passed: true } })) > 0 : false;
    const steps = total + (exam ? 1 : 0);
    const doneSteps = done + (examPassed ? 1 : 0);
    const completed = steps > 0 && doneSteps === steps;
    const enrollment = await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId, progressPct: pct(doneSteps, steps), status: completed ? 'COMPLETED' : 'IN_PROGRESS', completedAt: completed ? new Date() : null, lastLessonId },
      update: { progressPct: pct(doneSteps, steps), status: completed ? 'COMPLETED' : 'IN_PROGRESS', ...(completed ? {} : { completedAt: null }), ...(lastLessonId ? { lastLessonId } : {}) },
      select: { courseId: true, progressPct: true, status: true, completedAt: true },
    });
    if (completed && !enrollment.completedAt) {
      await this.prisma.enrollment.update({ where: { userId_courseId: { userId, courseId } }, data: { completedAt: new Date() } });
    }
    let badgeAwarded: unknown = undefined;
    if (completed && course?.badge) {
      const had = await this.prisma.userBadge.findUnique({ where: { userId_courseId: { userId, courseId } } });
      if (!had) {
        await this.prisma.userBadge.create({ data: { userId, courseId } });
        badgeAwarded = course.badge;
      }
    }
    return { ...enrollment, badgeAwarded };
  }

  // ================================================================ helpers
  async assertLessonUnlocked(user: AuthUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { unit: { select: { courseId: true, accessTier: true } } } });
    if (!lesson) throw new NotFoundException('Lição não encontrada');
    const course = await this.access.assertCourseUnlocked(user, lesson.unit.courseId);
    const tier = lesson.unit.accessTier ?? this.access.effectiveTier(course, course.planet);
    if (tier === 'PREMIUM' && !(await this.access.premiumFor(user, course.planet.categoryId))) {
      throw new ForbiddenException({ message: 'Esta etapa não faz parte do seu plano.', reason: 'PREMIUM_REQUIRED' });
    }
    if (await this.access.sequentialFlow(user)) {
      const ordered = await this.prisma.lesson.findMany({
        where: { unit: { courseId: lesson.unit.courseId } },
        orderBy: [{ unit: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
        select: { id: true },
      });
      const idx = ordered.findIndex((l) => l.id === lessonId);
      const before = ordered.slice(0, idx).map((l) => l.id);
      if (before.length) {
        const done = await this.prisma.lessonProgress.count({ where: { userId: user.id, status: 'COMPLETED', lessonId: { in: before } } });
        if (done < before.length) throw new ForbiddenException('Conclua as etapas anteriores da trilha primeiro');
      }
    }
    return { lesson: lesson as LessonWithUnit };
  }

  private assertResult(r: GeneratedResult, expected?: number | null) {
    if (!Number.isInteger(r.correct) || !Number.isInteger(r.total) || r.total <= 0 || r.correct < 0 || r.correct > r.total || r.total > 200) {
      throw new BadRequestException('Informe acertos e total válidos');
    }
    if (expected && r.total < expected) throw new BadRequestException(`Esta etapa tem ${expected} exercícios`);
  }

  private loadQuestions(where: Prisma.QuestionWhereInput) {
    return this.prisma.question.findMany({ where, include: { options: true } });
  }

  /** Visão do aluno: sem resposta; peças/pares/itens embaralhados (ver @folks/content-ingest questions.ts). */
  private publicQuestion(q: Parameters<typeof toPublicQuestion>[0], shuffleOptions = false) {
    return toPublicQuestion(q, { shuffleOptions });
  }

  /**
   * Correção no servidor, por tipo de questão (gradeQuestion). SIMULATOR: o app informa o acerto.
   * XP: cronômetro ligado -> acerto rápido ganha bônus; desligado -> todo acerto vale o mesmo.
   */
  private async grade(user: AuthUser, questions: StoredQuestion[], answers: AnswerInput[], withFeedback: boolean) {
    const [prefs, s] = await Promise.all([this.prisma.userPreferences.findUnique({ where: { userId: user.id } }), this.settings.all()]);
    const timer = prefs?.questionTimer ?? true;
    const ans = new Map(answers.map((a) => [a.questionId, a]));
    let correct = 0;
    let points = 0;
    let earned = 0;
    let xp = 0;
    const items = questions.map((q) => {
      const a = ans.get(q.id);
      const g = gradeQuestion(q, a);
      points += q.points;
      if (g.correct) {
        correct++;
        earned += q.points;
        xp += s.xp_practice_correct + (timer && a?.timeMs != null && a.timeMs <= FAST_ANSWER_MS ? s.xp_practice_fast_bonus : 0);
      }
      return withFeedback
        ? { questionId: q.id, type: q.type, correct: g.correct, ...(g.selfReported ? { selfReported: true } : {}), ...g.feedback }
        : { questionId: q.id, correct: g.correct };
    });
    const scorePct = pct(earned, points);
    return { correct, total: questions.length, scorePct, xp, result: { correct, total: questions.length, scorePct, xpEarned: xp, items } };
  }
}
