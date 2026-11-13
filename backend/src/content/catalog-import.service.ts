import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AvatarSlot, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../common/utils';
/** questões de escolha do catálogo do protótipo */
type QuestionInput = { type: 'SINGLE_CHOICE'; prompt: string; explanation?: string; points: number; options: Array<{ text: string; isCorrect: boolean }> };

/* ---- formato de content/catalog.json (protótipo) ---- */
interface ProtoCourse { id: string; name: string; pathId: string | null; gameUrl: string | null; free: boolean; premium: boolean; certificate: boolean; meta?: string; icon?: string; position?: number }
interface ProtoTheme { id: string; galaxy: 'life' | 'work'; name: string; short?: string | null; description?: string; colors?: string[]; ring?: string | null; icon?: string; orbitIcons?: string[]; look?: Record<string, string>; comingSoon?: boolean; courses: ProtoCourse[] }
interface ProtoNode { id: string; kind: 'aula' | 'pratica' | 'prova' | 'badge' | 'video' | 'cert'; title: string; lesson?: { generators?: string[]; slides: unknown[] }; generator?: string | string[]; questionCount?: number; review?: boolean; videoDuration?: string; videoTitle?: string; questionSet?: string }
interface ProtoUnit { title: string; number: number; premium: boolean; nodes: ProtoNode[] }
interface ProtoPath { id: string; title: string; drillLabel?: string | null; badge?: { icon: string; name: string; text: string } | null; units: ProtoUnit[] }
interface ProtoQuestion { question: string; options: string[]; correctIndex: number; explanation?: string }
export interface ProtoCatalog {
  version: number;
  themes: ProtoTheme[];
  paths: Record<string, ProtoPath>;
  questionSets: Record<string, ProtoQuestion[]>;
  campoKeys?: string[];
  hangar?: Record<string, Array<[string, string, number, string?]>>;
}

const GALAXY: Record<string, { slug: string; name: string; order: number }> = {
  life: { slug: 'para-a-vida', name: 'Para a vida', order: 0 },
  work: { slug: 'para-o-trabalho', name: 'Para o trabalho', order: 1 },
};
const HANGAR_SLOT: Record<string, AvatarSlot> = { suit: 'SUIT', accent: 'DETAILS', visor: 'VISOR', head: 'HEAD', back: 'BACK' };
const toSeconds = (d?: string) => {
  if (!d) return undefined;
  const [m, s] = d.split(':').map(Number);
  return Number.isFinite(m) ? m * 60 + (s || 0) : undefined;
};

/**
 * Importa o catálogo do protótipo (content/catalog.json) para o modelo relacional:
 *   tema -> Planeta | curso -> Curso | trilha -> Unidades + Lições | prova -> Exam
 *   aula -> Lição LESSON (telas) | prática com gerador -> PRACTICE GENERATED
 *   prática com questionSet -> PRACTICE BANK (questões no banco)
 *   insígnia -> Course.badge | hangar -> AvatarItem
 * Idempotente: não sobrescreve nomes editados; trilhas só são regravadas com force=true
 * (e nunca em cursos que já têm progresso de alunos).
 */
@Injectable()
export class CatalogImportService {
  private readonly log = new Logger(CatalogImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async import(catalog: ProtoCatalog, opts: { force?: boolean } = {}) {
    if (!catalog?.themes?.length) throw new BadRequestException('Catálogo vazio ou em formato inválido');
    const stats = { planets: 0, courses: 0, trails: 0, skippedTrails: 0, avatarItems: 0 };

    for (const g of Object.values(GALAXY)) {
      await this.prisma.studyCategory.upsert({ where: { slug: g.slug }, create: { slug: g.slug, name: g.name, sortOrder: g.order }, update: {} });
    }
    const cats = new Map((await this.prisma.studyCategory.findMany()).map((c) => [c.slug, c.id]));

    for (const [ti, t] of catalog.themes.entries()) {
      const allFree = t.courses.length > 0 && t.courses.every((c) => c.free && !c.premium);
      const visual = { colors: t.colors, ring: t.ring, icon: t.icon, orbitIcons: t.orbitIcons, look: t.look } as Prisma.InputJsonValue;
      const planet = await this.prisma.planet.upsert({
        where: { slug: t.id },
        create: {
          slug: t.id,
          categoryId: cats.get(GALAXY[t.galaxy].slug)!,
          name: t.name,
          shortName: t.short ?? null,
          description: t.description,
          themeColor: t.colors?.[0],
          visual,
          status: t.comingSoon ? 'COMING_SOON' : 'PUBLISHED',
          accessTier: allFree ? 'FREE' : 'PREMIUM',
          availableB2C: true,
          availableB2B: true,
          sortOrder: ti,
        },
        update: { visual, themeColor: t.colors?.[0] },
      });
      stats.planets++;

      for (const c of t.courses) {
        const path = c.pathId ? catalog.paths[c.pathId] : undefined;
        const isGame = !!c.gameUrl;
        const gameId = isGame ? (c.id === 'campo' || /campo/.test(c.gameUrl ?? '') ? 'campo' : c.id) : null;
        const data = {
          planetId: planet.id,
          title: c.name,
          slug: slugify(c.id),
          status: (path || isGame ? 'PUBLISHED' : 'COMING_SOON') as 'PUBLISHED' | 'COMING_SOON',
          accessTier: (c.premium ? 'PREMIUM' : c.free ? 'FREE' : 'PREMIUM') as 'PREMIUM' | 'FREE',
          hasCertificate: c.certificate,
          icon: c.icon,
          meta: c.meta,
          sortOrder: c.position ?? 0,
          drillLabel: path?.drillLabel ?? null,
          badge: path?.badge ? (path.badge as Prisma.InputJsonValue) : Prisma.DbNull,
          gameId,
          gameUrl: c.gameUrl,
          gameConfig: isGame && catalog.campoKeys ? ({ masteryKeys: catalog.campoKeys } as Prisma.InputJsonValue) : Prisma.DbNull,
        };
        const existing = await this.prisma.course.findUnique({ where: { code: c.id } });
        const course = existing
          ? await this.prisma.course.update({ where: { id: existing.id }, data: { icon: data.icon, meta: data.meta, drillLabel: data.drillLabel, badge: data.badge, gameUrl: data.gameUrl, gameConfig: data.gameConfig, ...(path || isGame ? { status: existing.status === 'COMING_SOON' ? 'PUBLISHED' : existing.status } : {}) } })
          : await this.prisma.course.create({ data: { ...data, code: c.id } });
        stats.courses++;

        if (!path) continue;
        const hasUnits = (await this.prisma.unit.count({ where: { courseId: course.id } })) > 0;
        if (hasUnits && !opts.force) {
          stats.skippedTrails++;
          continue;
        }
        if (hasUnits) {
          const progress = await this.prisma.lessonProgress.count({ where: { lesson: { unit: { courseId: course.id } } } });
          if (progress) {
            this.log.warn(`Trilha de "${c.name}" não regravada: já existe progresso de alunos`);
            stats.skippedTrails++;
            continue;
          }
          await this.prisma.$transaction([this.prisma.unit.deleteMany({ where: { courseId: course.id } }), this.prisma.exam.deleteMany({ where: { courseId: course.id } })]);
        }
        await this.importTrail(course.id, c.premium, path, catalog.questionSets ?? {});
        stats.trails++;
      }
    }

    for (const [slotKey, items] of Object.entries(catalog.hangar ?? {})) {
      const slot = HANGAR_SLOT[slotKey];
      if (!slot) continue;
      for (const [i, [key, name, level, color]] of items.entries()) {
        await this.prisma.avatarItem.upsert({
          where: { slot_key: { slot, key } },
          create: { slot, key, name, requiredLevel: level, colorHex: color, sortOrder: i, isDefault: i === 0 },
          update: { name, requiredLevel: level, colorHex: color, sortOrder: i },
        });
        stats.avatarItems++;
      }
    }
    return stats;
  }

  private async importTrail(courseId: string, coursePremium: boolean, path: ProtoPath, sets: Record<string, ProtoQuestion[]>) {
    const toQuestions = (setId: string): QuestionInput[] => {
      const set = sets[setId];
      if (!set) throw new BadRequestException(`questionSet "${setId}" não existe no catálogo`);
      return set.map((q) => ({
        type: 'SINGLE_CHOICE' as const,
        prompt: q.question,
        explanation: q.explanation,
        points: 1,
        options: q.options.map((text, i) => ({ text, isCorrect: i === q.correctIndex })),
      }));
    };
    const createQuestions = async (tx: Prisma.TransactionClient, target: { lessonId?: string; examId?: string }, qs: QuestionInput[]) => {
      for (const [i, q] of qs.entries()) {
        await tx.question.create({
          data: { ...target, type: q.type, prompt: q.prompt, explanation: q.explanation, points: q.points, sortOrder: i, options: { create: q.options.map((o, j) => ({ text: o.text, isCorrect: o.isCorrect, sortOrder: j })) } },
        });
      }
    };

    await this.prisma.$transaction(
      async (tx) => {
        let unitOrder = 0;
        let lastVideoId: string | undefined;
        for (const u of path.units) {
          const learnNodes = u.nodes.filter((n) => n.kind !== 'prova' && n.kind !== 'badge' && n.kind !== 'cert');
          const prova = u.nodes.find((n) => n.kind === 'prova');
          // curso Premium inteiro (biblioteca para o trabalho) herda; curso grátis marca unidade a unidade
          const accessTier = coursePremium ? null : u.premium ? 'PREMIUM' : 'FREE';
          if (learnNodes.length) {
            const unit = await tx.unit.create({ data: { courseId, title: u.title, sortOrder: unitOrder++, accessTier } });
            for (const [i, n] of learnNodes.entries()) {
              const base = { unitId: unit.id, code: n.id, title: n.title, sortOrder: i };
              if (n.kind === 'aula') {
                await tx.lesson.create({ data: { ...base, type: 'LESSON', xpReward: 5, content: { slides: n.lesson?.slides ?? [], generators: n.lesson?.generators ?? [] } as Prisma.InputJsonValue } });
              } else if (n.kind === 'video') {
                const v = await tx.lesson.create({ data: { ...base, type: 'VIDEO', videoTitle: n.videoTitle, durationSeconds: toSeconds(n.videoDuration), xpReward: 10 } });
                lastVideoId = v.id;
              } else if (n.kind === 'pratica' && n.questionSet) {
                const l = await tx.lesson.create({ data: { ...base, type: 'PRACTICE', questionSource: 'BANK', relatedLessonId: lastVideoId, isReview: !!n.review, xpReward: 10 } });
                await createQuestions(tx, { lessonId: l.id }, toQuestions(n.questionSet));
              } else if (n.kind === 'pratica') {
                const gens = Array.isArray(n.generator) ? n.generator : n.generator ? [n.generator] : [];
                await tx.lesson.create({ data: { ...base, type: 'PRACTICE', questionSource: 'GENERATED', generators: gens, questionCount: n.questionCount ?? 8, isReview: !!n.review, xpReward: 10 } });
              }
            }
          }
          if (prova) {
            const gens = Array.isArray(prova.generator) ? prova.generator : prova.generator ? [prova.generator] : [];
            const exam = await tx.exam.create({
              data: {
                courseId,
                title: prova.title,
                questionSource: prova.questionSet ? 'BANK' : 'GENERATED',
                generators: [...new Set(gens)],
                questionCount: prova.questionCount ?? (prova.questionSet ? null : 10),
                shuffle: !prova.questionSet,
              },
            });
            if (prova.questionSet) await createQuestions(tx, { examId: exam.id }, toQuestions(prova.questionSet));
          }
        }
      },
      { timeout: 120_000 },
    );
  }
}
