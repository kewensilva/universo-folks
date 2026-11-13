import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { LearningService } from '../learning/learning.service';
import { GamificationService } from '../gamification/gamification.service';
import { AuthUser } from '../common/types';
import { pct } from '../common/utils';

export type PlanetFilter = 'all' | 'in_progress' | 'free' | 'premium' | 'coming_soon';

/** Catálogo do aluno (telas Início / Cursos / Planeta). Respeita contexto B2B/B2C. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly learning: LearningService,
    private readonly gamification: GamificationService,
  ) {}

  /** Tela "Início": saudação, jornada/meta do dia, continue estudando, trilhas obrigatórias. */
  async home(user: AuthUser) {
    const [me, progress, continueStudying, assignments, categories] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, displayName: true } }),
      this.gamification.profile(user.id),
      this.learning.continueStudying(user),
      this.myAssignments(user),
      this.categories(user),
    ]);
    return {
      greetingName: me.displayName ?? me.name.split(' ')[0],
      premium: await this.access.isPremium(user),
      progress,
      continueStudying,
      inProgressCount: continueStudying.length,
      assignments,
      categories,
    };
  }

  /** Abas "Para a vida" / "Para o trabalho" / "Para a escola"... */
  async categories(user: AuthUser) {
    const planetWhere = await this.access.planetWhere(user);
    const cats = await this.prisma.studyCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { planets: { where: planetWhere } } } },
    });
    return cats.filter((c) => c._count.planets > 0).map(({ _count, ...c }) => ({ ...c, planetCount: _count.planets }));
  }

  /** Lista de planetas com selos (GRÁTIS / PREMIUM / EM BREVE / CERTIFICADO) e progresso. */
  async planets(user: AuthUser, opts: { category?: string; filter?: PlanetFilter; search?: string }) {
    const base = await this.access.planetWhere(user);
    const where: Prisma.PlanetWhereInput = {
      AND: [
        base,
        opts.category ? { category: { slug: opts.category } } : {},
        opts.search
          ? { OR: [{ name: { contains: opts.search, mode: 'insensitive' } }, { courses: { some: { title: { contains: opts.search, mode: 'insensitive' }, status: 'PUBLISHED' } } }] }
          : {},
      ],
    };
    const planets = await this.prisma.planet.findMany({
      where,
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: {
        category: { select: { id: true, name: true, slug: true } },
        courses: { where: { status: { in: ['PUBLISHED', 'COMING_SOON'] } }, select: { id: true, accessTier: true, hasCertificate: true, status: true } },
      },
    });
    const [coverage, upgrades] = await Promise.all([this.access.planCoverage(user), user.mode === 'B2C' ? this.access.upgradeTiers() : []]);
    const courseIds = planets.flatMap((p) => p.courses.map((c) => c.id));
    const enrollments = await this.prisma.enrollment.findMany({ where: { userId: user.id, courseId: { in: courseIds } } });
    const byCourse = new Map(enrollments.map((e) => [e.courseId, e]));

    const items = planets.map(({ courses, ...p }) => {
      const published = courses.filter((c) => c.status === 'PUBLISHED');
      const tiers = published.map((c) => this.access.effectiveTier(c, p));
      const isFree = published.length > 0 && tiers.every((t) => t === 'FREE');
      const comingSoon = p.status === 'COMING_SOON' || published.length === 0;
      const progresses = published.map((c) => byCourse.get(c.id)?.progressPct ?? 0);
      const started = published.some((c) => byCourse.has(c.id));
      const completedCourses = published.filter((c) => byCourse.get(c.id)?.status === 'COMPLETED').length;
      const badges: string[] = [];
      if (comingSoon) badges.push('EM_BREVE');
      else badges.push(isFree ? 'GRATIS' : 'PREMIUM');
      if (published.some((c) => c.hasCertificate)) badges.push('CERTIFICADO');
      const premium = this.access.covers(coverage, p.categoryId);
      return {
        ...p,
        courseCount: published.length,
        badges,
        comingSoon,
        locked: !comingSoon && !isFree && !premium && !tiers.includes('FREE'),
        /** plano de acesso que libera o conteúdo Premium do planeta (null = já liberado) */
        requiredPlan: !comingSoon && !isFree && !premium ? this.access.requiredPlanFor(p.categoryId, upgrades) : null,
        inProgress: started && completedCourses < published.length,
        completedCourses,
        progressPct: published.length ? Math.round(progresses.reduce((a, b) => a + b, 0) / published.length) : 0,
      };
    });

    const filtered = items.filter((p) => {
      switch (opts.filter) {
        case 'in_progress': return p.inProgress;
        case 'free': return p.badges.includes('GRATIS');
        case 'premium': return p.badges.includes('PREMIUM');
        case 'coming_soon': return p.comingSoon;
        default: return true;
      }
    });
    return {
      total: filtered.length,
      counters: {
        all: items.length,
        in_progress: items.filter((p) => p.inProgress).length,
        free: items.filter((p) => p.badges.includes('GRATIS')).length,
        premium: items.filter((p) => p.badges.includes('PREMIUM')).length,
        byCategory: Object.fromEntries(
          [...new Set(items.map((p) => p.category.slug))].map((slug) => [slug, items.filter((p) => p.category.slug === slug).length]),
        ),
      },
      items: filtered,
    };
  }

  /** Planeta aberto: cursos com estado de acesso e progresso. */
  async planet(user: AuthUser, slug: string) {
    const planet = await this.prisma.planet.findFirst({
      where: { AND: [await this.access.planetWhere(user), { slug }] },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        courses: {
          where: { status: { in: ['PUBLISHED', 'COMING_SOON'] } },
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { units: true } }, exam: { select: { id: true } } },
        },
      },
    });
    if (!planet) throw new NotFoundException('Planeta não encontrado');
    const premium = await this.access.premiumFor(user, planet.categoryId);
    const enrollments = await this.prisma.enrollment.findMany({ where: { userId: user.id, courseId: { in: planet.courses.map((c) => c.id) } } });
    const certs = await this.prisma.certificate.findMany({
      where: { userId: user.id, revokedAt: null, OR: [{ courseId: { in: planet.courses.map((c) => c.id) } }, { planetId: planet.id, type: 'PLANET' }] },
      select: { code: true, type: true, courseId: true },
    });
    const badges = await this.prisma.userBadge.findMany({ where: { userId: user.id, courseId: { in: planet.courses.map((c) => c.id) } }, select: { courseId: true } });
    const freeUnits = await this.prisma.unit.groupBy({ by: ['courseId'], where: { courseId: { in: planet.courses.map((c) => c.id) }, accessTier: 'FREE' }, _count: true });
    const courses = [];
    for (const c of planet.courses) {
      const access = await this.access.courseAccess(user, c, planet, premium);
      const e = enrollments.find((x) => x.courseId === c.id);
      courses.push({
        id: c.id,
        code: c.code,
        slug: c.slug,
        icon: c.icon,
        meta: c.meta,
        gameUrl: c.gameUrl,
        badge: c.badge,
        badgeEarned: badges.some((b) => b.courseId === c.id),
        /** unidades liberadas no plano grátis (as demais são Premium) */
        freeUnits: freeUnits.find((f) => f.courseId === c.id)?._count ?? 0,
        title: c.title,
        description: c.description,
        imageUrl: c.imageUrl,
        estimatedMinutes: c.estimatedMinutes,
        units: c._count.units,
        hasCertificate: c.hasCertificate,
        hasExam: !!c.exam,
        accessTier: this.access.effectiveTier(c, planet),
        locked: access.locked,
        lockReason: access.reason,
        requiredPlan: access.requiredPlan ?? null,
        progressPct: e?.progressPct ?? 0,
        status: e?.status ?? 'NOT_STARTED',
        certificateCode: certs.find((x) => x.courseId === c.id && x.type === 'COURSE')?.code ?? null,
      });
    }
    const { courses: _omit, ...rest } = planet;
    return {
      ...rest,
      courses,
      progressPct: courses.length ? Math.round(courses.reduce((a, c) => a + c.progressPct, 0) / courses.length) : 0,
      planetCertificateCode: certs.find((x) => x.type === 'PLANET')?.code ?? null,
    };
  }

  /** Trilhas obrigatórias / prioridades / prazos definidos pela empresa para o colaborador. */
  async myAssignments(user: AuthUser) {
    if (user.mode !== 'TENANT' || !user.tenantId) return [];
    const deptIds = await this.access.userDepartmentIds(user);
    const now = new Date();
    const rows = await this.prisma.assignment.findMany({
      where: {
        tenantId: user.tenantId,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ membershipId: user.membershipId }, { departmentId: { in: deptIds } }, { AND: [{ membershipId: null }, { departmentId: null }] }] },
        ],
      },
      orderBy: [{ mandatory: 'desc' }, { priority: 'asc' }, { dueDate: 'asc' }],
      include: {
        planet: { select: { id: true, name: true, slug: true, courses: { where: { status: 'PUBLISHED' }, select: { id: true } } } },
        course: { select: { id: true, title: true, planet: { select: { slug: true, name: true } } } },
      },
    });
    const courseIds = rows.flatMap((r) => (r.course ? [r.course.id] : r.planet?.courses.map((c) => c.id) ?? []));
    const enrollments = await this.prisma.enrollment.findMany({ where: { userId: user.id, courseId: { in: courseIds } } });
    const prog = (ids: string[]) => {
      if (!ids.length) return 0;
      return Math.round(ids.reduce((a, id) => a + (enrollments.find((e) => e.courseId === id)?.progressPct ?? 0), 0) / ids.length);
    };
    return rows.map((r) => {
      const ids = r.course ? [r.course.id] : r.planet?.courses.map((c) => c.id) ?? [];
      const progressPct = prog(ids);
      return {
        id: r.id,
        targetType: r.targetType,
        title: r.course?.title ?? r.planet?.name,
        planetSlug: r.course?.planet.slug ?? r.planet?.slug,
        courseId: r.course?.id ?? null,
        mandatory: r.mandatory,
        priority: r.priority,
        dueDate: r.dueDate,
        progressPct,
        completed: progressPct === 100,
        overdue: !!r.dueDate && r.dueDate < now && progressPct < 100,
        daysLeft: r.dueDate ? Math.ceil((r.dueDate.getTime() - now.getTime()) / 86400_000) : null,
      };
    });
  }

  /** Busca global ("Buscar tema ou curso"). */
  async search(user: AuthUser, q: string) {
    const planetWhere = await this.access.planetWhere(user);
    const [planets, courses] = await Promise.all([
      this.prisma.planet.findMany({
        where: { AND: [planetWhere, { name: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, slug: true, name: true, imageUrl: true },
        take: 10,
      }),
      this.prisma.course.findMany({
        where: { status: 'PUBLISHED', planet: planetWhere, OR: [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, title: true, planet: { select: { slug: true, name: true } } },
        take: 20,
      }),
    ]);
    return { planets, courses };
  }

  /** Resumo pessoal (usado no dashboard do aluno). */
  async myStats(user: AuthUser) {
    const planetWhere = await this.access.planetWhere(user);
    const [available, enrollments, certificates, practice] = await Promise.all([
      this.prisma.course.count({ where: { status: 'PUBLISHED', planet: planetWhere } }),
      this.prisma.enrollment.findMany({ where: { userId: user.id, course: { planet: planetWhere } } }),
      this.prisma.certificate.count({ where: { userId: user.id, revokedAt: null } }),
      this.prisma.practiceAttempt.aggregate({ where: { userId: user.id }, _sum: { correctCount: true, totalCount: true } }),
    ]);
    const completed = enrollments.filter((e) => e.status === 'COMPLETED').length;
    return {
      coursesAvailable: available,
      coursesStarted: enrollments.length,
      coursesCompleted: completed,
      completionPct: pct(completed, available),
      certificates,
      practiceAccuracyPct: pct(practice._sum.correctCount ?? 0, practice._sum.totalCount ?? 0),
    };
  }
}
