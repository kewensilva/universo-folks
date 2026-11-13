import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pct } from '../common/utils';
import { SeatsService } from '../access/seats.service';

const DAY = 86400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const growthPct = (cur: number, prev: number) => (prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100));
const monthlyFactor: Record<string, number> = { MONTHLY: 1, QUARTERLY: 1 / 3, YEARLY: 1 / 12, ONE_TIME: 0 };

export interface Period {
  from: Date;
  to: Date;
}

/**
 * Dashboards com dados REAIS (consultas diretas no banco) e percentuais.
 *  - master():  visão de todo o ecossistema + financeiro
 *  - tenant():  visão da empresa (ADMIN-CLIENTE) com filtro por departamento
 */
@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatsService,
  ) {}

  // ========================================================== MASTER-FOLKS
  async master(period: Period) {
    const { from, to } = period;
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const now = new Date();
    const activeSub = { status: { in: ['ACTIVE', 'TRIALING'] as any }, currentPeriodEnd: { gt: now } };

    const [
      tenantsByType, tenantsByStatus, usersTotal, usersNew, usersNewPrev, collaborators, b2cOnly, premiumUsers,
      activeUsers7, activeUsers30, enrollTotal, enrollCompleted, certsPeriod, certsTotal, examAgg, examPassed, practiceAgg,
      planetsByStatus, courses, lessonsByType, activeSubs, revenuePeriod, revenuePrev, revenueByProvider, churned,
    ] = await Promise.all([
      this.prisma.tenant.groupBy({ by: ['type'], where: { deletedAt: null, status: 'ACTIVE' }, _count: true }),
      this.prisma.tenant.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: from, lte: to } } }),
      this.prisma.user.count({ where: { deletedAt: null, createdAt: { gte: prevFrom, lt: from } } }),
      this.prisma.membership.count({ where: { status: 'ACTIVE', tenant: { deletedAt: null } } }),
      this.prisma.user.count({ where: { deletedAt: null, platformRole: 'USER', memberships: { none: { status: 'ACTIVE' } } } }),
      this.prisma.user.count({ where: { deletedAt: null, subscriptions: { some: { ...activeSub, plan: { audience: 'B2C' } } } } }),
      this.activeUsers(daysAgo(7)),
      this.activeUsers(daysAgo(30)),
      this.prisma.enrollment.count(),
      this.prisma.enrollment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.certificate.count({ where: { revokedAt: null, issuedAt: { gte: from, lte: to } } }),
      this.prisma.certificate.count({ where: { revokedAt: null } }),
      this.prisma.examAttempt.aggregate({ where: { submittedAt: { gte: from, lte: to } }, _count: true, _avg: { scorePct: true } }),
      this.prisma.examAttempt.count({ where: { submittedAt: { gte: from, lte: to }, passed: true } }),
      this.prisma.practiceAttempt.aggregate({ where: { createdAt: { gte: from, lte: to } }, _sum: { correctCount: true, totalCount: true } }),
      this.prisma.planet.groupBy({ by: ['status'], _count: true }),
      this.prisma.course.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.lesson.groupBy({ by: ['type'], _count: true }),
      this.prisma.subscription.findMany({ where: activeSub, include: { plan: true } }),
      this.prisma.payment.aggregate({ where: { status: 'PAID', paidAt: { gte: from, lte: to } }, _sum: { amountCents: true }, _count: true }),
      this.prisma.payment.aggregate({ where: { status: 'PAID', paidAt: { gte: prevFrom, lt: from } }, _sum: { amountCents: true } }),
      this.prisma.payment.groupBy({ by: ['provider'], where: { status: 'PAID', paidAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
      this.prisma.subscription.count({ where: { OR: [{ status: 'EXPIRED' }, { status: 'CANCELED' }], updatedAt: { gte: from, lte: to } } }),
    ]);

    // MRR normalizado: contratos B2B (assinatura do tenant) + premium B2C
    const mrrBy = { B2C: 0, B2B: 0, B2G: 0 } as Record<string, number>;
    for (const s of activeSubs) mrrBy[s.plan.audience] += Math.round((s.amountCents ?? s.plan.priceCents) * (monthlyFactor[s.plan.interval] ?? 0));
    const mrr = mrrBy.B2C + mrrBy.B2B + mrrBy.B2G;
    const revenueCents = revenuePeriod._sum.amountCents ?? 0;
    const examCount = examAgg._count;

    const [signupsSeries, activeSeries, revenueSeries, topPlanets, topTenants] = await Promise.all([
      this.dailySeries(`SELECT date_trunc('day', created_at)::date AS d, count(*)::int AS v FROM users WHERE created_at BETWEEN $1 AND $2 AND deleted_at IS NULL GROUP BY 1`, from, to),
      this.dailySeries(`SELECT date AS d, count(DISTINCT user_id)::int AS v FROM daily_activity WHERE date BETWEEN $1::date AND $2::date GROUP BY 1`, from, to),
      this.monthlyRevenue(12),
      this.topPlanets(),
      this.topTenants(from),
    ]);

    return {
      period: { from, to },
      clients: {
        activeTenants: tenantsByType.reduce((a, t) => a + t._count, 0),
        byType: Object.fromEntries(tenantsByType.map((t) => [t.type, t._count])),
        byStatus: Object.fromEntries(tenantsByStatus.map((t) => [t.status, t._count])),
      },
      users: {
        total: usersTotal,
        newInPeriod: usersNew,
        growthPct: growthPct(usersNew, usersNewPrev),
        collaborators,
        b2cOnly,
        b2cPremium: premiumUsers,
        premiumConversionPct: pct(premiumUsers, b2cOnly + premiumUsers),
        active7d: activeUsers7,
        active30d: activeUsers30,
        engagement7dPct: pct(activeUsers7, usersTotal),
        engagement30dPct: pct(activeUsers30, usersTotal),
      },
      learning: {
        enrollments: enrollTotal,
        completions: enrollCompleted,
        completionRatePct: pct(enrollCompleted, enrollTotal),
        certificatesInPeriod: certsPeriod,
        certificatesTotal: certsTotal,
        examAttempts: examCount,
        examPassRatePct: pct(examPassed, examCount),
        examAvgScorePct: Math.round(examAgg._avg.scorePct ?? 0),
        practiceAccuracyPct: pct(practiceAgg._sum.correctCount ?? 0, practiceAgg._sum.totalCount ?? 0),
      },
      content: {
        planetsByStatus: Object.fromEntries(planetsByStatus.map((p) => [p.status, p._count])),
        publishedCourses: courses,
        lessonsByType: Object.fromEntries(lessonsByType.map((l) => [l.type, l._count])),
      },
      financial: {
        currency: 'BRL',
        mrrCents: mrr,
        mrrByAudienceCents: mrrBy,
        mrrShareByAudiencePct: { B2C: pct(mrrBy.B2C, mrr), B2B: pct(mrrBy.B2B, mrr), B2G: pct(mrrBy.B2G, mrr) },
        arrCents: mrr * 12,
        activeSubscriptions: activeSubs.length,
        revenueInPeriodCents: revenueCents,
        revenueGrowthPct: growthPct(revenueCents, revenuePrev._sum.amountCents ?? 0),
        paymentsInPeriod: revenuePeriod._count,
        revenueByProvider: revenueByProvider.map((r) => ({ provider: r.provider, cents: r._sum.amountCents ?? 0, sharePct: pct(r._sum.amountCents ?? 0, revenueCents) })),
        churnedInPeriod: churned,
        churnRatePct: pct(churned, activeSubs.length + churned),
        monthlyRevenue: revenueSeries,
      },
      series: { signups: signupsSeries, activeUsers: activeSeries },
      rankings: { topPlanets, topTenants },
    };
  }

  /** Financeiro por cliente (empresa ou aluno). */
  async masterFinancialByClient() {
    const now = new Date();
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      select: {
        id: true, tradeName: true, type: true, status: true,
        settings: { select: { contractEnd: true } },
        subscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now } }, include: { plan: true } },
        payments: { where: { status: { in: ['PAID', 'PENDING'] } }, select: { amountCents: true, status: true, paidAt: true } },
        _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: { tradeName: 'asc' },
    });
    const seatsBy = new Map(await Promise.all(tenants.map(async (t) => [t.id, await this.seats.usage(t.id)] as const)));
    return tenants.map((t) => {
      const seats = seatsBy.get(t.id)!;
      const paid = t.payments.filter((p) => p.status === 'PAID');
      const pending = t.payments.filter((p) => p.status === 'PENDING');
      return {
        tenantId: t.id,
        name: t.tradeName,
        type: t.type,
        status: t.status,
        seats,
        contractEnd: t.settings?.contractEnd ?? null,
        mrrCents: t.subscriptions.reduce((a, s) => a + Math.round((s.amountCents ?? s.plan.priceCents) * (monthlyFactor[s.plan.interval] ?? 0)), 0),
        totalPaidCents: paid.reduce((a, p) => a + p.amountCents, 0),
        pendingCents: pending.reduce((a, p) => a + p.amountCents, 0),
        lastPaymentAt: paid.map((p) => p.paidAt).filter(Boolean).sort().pop() ?? null,
      };
    });
  }

  // ============================================================== EMPRESA
  async tenant(tenantId: string, period: Period, departmentId?: string) {
    const { from, to } = period;
    const now = new Date();

    const [settings, departments, members, access, assignments] = await Promise.all([
      this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
      this.prisma.department.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.membership.findMany({
        where: { tenantId, status: 'ACTIVE', ...(departmentId ? { departments: { some: { departmentId } } } : {}) },
        select: {
          id: true, userId: true, role: true,
          user: { select: { name: true, lastLoginAt: true, gamification: { select: { totalXp: true, level: true, currentStreak: true } } } },
          departments: { select: { departmentId: true } },
        },
      }),
      this.prisma.tenantPlanetAccess.findMany({
        where: { tenantId, enabled: true },
        select: {
          allDepartments: true,
          departments: { select: { departmentId: true } },
          planet: { select: { id: true, name: true, courses: { where: { status: 'PUBLISHED' }, select: { id: true, title: true } } } },
        },
      }),
      this.prisma.assignment.findMany({
        where: { tenantId },
        include: { planet: { select: { name: true, courses: { where: { status: 'PUBLISHED' }, select: { id: true } } } }, course: { select: { title: true } } },
      }),
    ]);
    const seatUsage = await this.seats.usage(tenantId);

    const userIds = members.map((m) => m.userId);
    const allCourseIds = [...new Set(access.flatMap((a) => a.planet.courses.map((c) => c.id)))];
    const [enrollments, activity, certs, exams, lessonsDone] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId: { in: userIds }, courseId: { in: allCourseIds } }, select: { userId: true, courseId: true, status: true, progressPct: true, completedAt: true } }),
      this.prisma.dailyActivity.findMany({ where: { userId: { in: userIds }, date: { gte: daysAgo(30) } }, select: { userId: true, date: true, xp: true } }),
      this.prisma.certificate.findMany({ where: { userId: { in: userIds }, tenantId, revokedAt: null }, select: { userId: true, type: true, issuedAt: true } }),
      this.prisma.examAttempt.findMany({ where: { userId: { in: userIds }, tenantId, submittedAt: { gte: from, lte: to } }, select: { userId: true, passed: true, scorePct: true, examId: true } }),
      this.prisma.lessonProgress.findMany({ where: { userId: { in: userIds }, status: 'COMPLETED', completedAt: { gte: from, lte: to } }, select: { completedAt: true } }),
    ]);

    // cursos elegíveis por colaborador (planeta liberado p/ todos ou p/ algum depto dele)
    const eligible = new Map<string, Set<string>>();
    for (const m of members) {
      const depts = new Set(m.departments.map((d) => d.departmentId));
      const set = new Set<string>();
      for (const a of access) {
        if (m.role === 'ADMIN_CLIENTE' || a.allDepartments || a.departments.some((d) => depts.has(d.departmentId))) {
          a.planet.courses.forEach((c) => set.add(c.id));
        }
      }
      eligible.set(m.userId, set);
    }
    const enrollKey = new Map(enrollments.map((e) => [`${e.userId}:${e.courseId}`, e]));
    const eligiblePairs = [...eligible.entries()].flatMap(([u, s]) => [...s].map((c) => `${u}:${c}`));
    const completedPairs = eligiblePairs.filter((k) => enrollKey.get(k)?.status === 'COMPLETED').length;
    const startedPairs = eligiblePairs.filter((k) => enrollKey.has(k)).length;
    const avgProgress = eligiblePairs.length ? Math.round(eligiblePairs.reduce((a, k) => a + (enrollKey.get(k)?.progressPct ?? 0), 0) / eligiblePairs.length) : 0;

    const active7 = new Set(activity.filter((a) => a.date >= daysAgo(7)).map((a) => a.userId));
    const active30 = new Set(activity.map((a) => a.userId));
    const neverAccessed = members.filter((m) => !m.user.lastLoginAt).length;

    // ---- trilhas obrigatórias / prazos
    const deptOf = new Map(members.map((m) => [m.id, new Set(m.departments.map((d) => d.departmentId))]));
    const assignmentStats = assignments.map((a) => {
      const targets = members.filter((m) => (a.membershipId ? m.id === a.membershipId : a.departmentId ? deptOf.get(m.id)!.has(a.departmentId) : true));
      const courseIds = a.courseId ? [a.courseId] : a.planet?.courses.map((c) => c.id) ?? [];
      const done = targets.filter((m) => courseIds.length > 0 && courseIds.every((c) => enrollKey.get(`${m.userId}:${c}`)?.status === 'COMPLETED'));
      const overdue = a.dueDate && a.dueDate < now ? targets.length - done.length : 0;
      return {
        id: a.id,
        title: a.course?.title ?? a.planet?.name,
        mandatory: a.mandatory,
        priority: a.priority,
        dueDate: a.dueDate,
        targets: targets.length,
        completed: done.length,
        completionPct: pct(done.length, targets.length),
        overdue,
        overduePct: pct(overdue, targets.length),
      };
    });
    const mandatory = assignmentStats.filter((a) => a.mandatory);
    const mandatoryTargets = mandatory.reduce((a, x) => a + x.targets, 0);
    const mandatoryDone = mandatory.reduce((a, x) => a + x.completed, 0);

    // ---- por departamento
    const byDepartment = departments
      .filter((d) => !departmentId || d.id === departmentId)
      .map((d) => {
        const ms = members.filter((m) => m.departments.some((x) => x.departmentId === d.id));
        const pairs = ms.flatMap((m) => [...(eligible.get(m.userId) ?? [])].map((c) => `${m.userId}:${c}`));
        const comp = pairs.filter((k) => enrollKey.get(k)?.status === 'COMPLETED').length;
        return {
          departmentId: d.id,
          name: d.name,
          members: ms.length,
          active7dPct: pct(ms.filter((m) => active7.has(m.userId)).length, ms.length),
          avgProgressPct: pairs.length ? Math.round(pairs.reduce((a, k) => a + (enrollKey.get(k)?.progressPct ?? 0), 0) / pairs.length) : 0,
          completionPct: pct(comp, pairs.length),
          certificates: certs.filter((c) => ms.some((m) => m.userId === c.userId)).length,
        };
      });

    // ---- por planeta / curso
    const byCourse = access.flatMap((a) =>
      a.planet.courses.map((c) => {
        const eligibleUsers = members.filter((m) => eligible.get(m.userId)?.has(c.id));
        const es = eligibleUsers.map((m) => enrollKey.get(`${m.userId}:${c.id}`)).filter(Boolean);
        return {
          planet: a.planet.name,
          courseId: c.id,
          course: c.title,
          eligible: eligibleUsers.length,
          started: es.length,
          completed: es.filter((e) => e!.status === 'COMPLETED').length,
          adoptionPct: pct(es.length, eligibleUsers.length),
          completionPct: pct(es.filter((e) => e!.status === 'COMPLETED').length, eligibleUsers.length),
          avgProgressPct: eligibleUsers.length ? Math.round(es.reduce((s, e) => s + e!.progressPct, 0) / eligibleUsers.length) : 0,
        };
      }),
    );

    const passed = exams.filter((e) => e.passed).length;
    const ranking = [...members]
      .sort((a, b) => (b.user.gamification?.totalXp ?? 0) - (a.user.gamification?.totalXp ?? 0))
      .slice(0, 10)
      .map((m) => ({ userId: m.userId, name: m.user.name, xp: m.user.gamification?.totalXp ?? 0, level: m.user.gamification?.level ?? 1, streak: m.user.gamification?.currentStreak ?? 0 }));

    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const days = this.daysBetween(from, to);
    const activeByDay = new Map<string, Set<string>>();
    for (const a of activity) {
      const k = dayKey(a.date);
      if (!activeByDay.has(k)) activeByDay.set(k, new Set());
      activeByDay.get(k)!.add(a.userId);
    }
    const lessonsByDay = new Map<string, number>();
    for (const l of lessonsDone) {
      const k = dayKey(l.completedAt!);
      lessonsByDay.set(k, (lessonsByDay.get(k) ?? 0) + 1);
    }

    return {
      period: { from, to },
      filter: { departmentId: departmentId ?? null },
      seats: seatUsage,
      engagement: {
        members: members.length,
        active7d: active7.size,
        active7dPct: pct(active7.size, members.length),
        active30d: active30.size,
        active30dPct: pct(active30.size, members.length),
        neverAccessed,
        neverAccessedPct: pct(neverAccessed, members.length),
      },
      learning: {
        coursesReleased: allCourseIds.length,
        adoptionPct: pct(startedPairs, eligiblePairs.length),
        completionPct: pct(completedPairs, eligiblePairs.length),
        avgProgressPct: avgProgress,
        lessonsCompletedInPeriod: lessonsDone.length,
        examAttempts: exams.length,
        examPassRatePct: pct(passed, exams.length),
        examAvgScorePct: exams.length ? Math.round(exams.reduce((a, e) => a + (e.scorePct ?? 0), 0) / exams.length) : 0,
        passingScoreRequired: settings?.passingScore ?? null,
        certificatesTotal: certs.length,
        certificatesInPeriod: certs.filter((c) => c.issuedAt >= from && c.issuedAt <= to).length,
        planetCertificates: certs.filter((c) => c.type === 'PLANET').length,
      },
      compliance: {
        mandatoryAssignments: mandatory.length,
        mandatoryCompletionPct: pct(mandatoryDone, mandatoryTargets),
        overdue: assignmentStats.reduce((a, x) => a + x.overdue, 0),
        dueNext7Days: assignmentStats.filter((a) => a.dueDate && a.dueDate >= now && a.dueDate <= new Date(now.getTime() + 7 * DAY)).length,
        assignments: assignmentStats,
      },
      byDepartment,
      byCourse,
      ranking,
      series: days.map((d) => ({ date: d, activeLearners: activeByDay.get(d)?.size ?? 0, lessonsCompleted: lessonsByDay.get(d) ?? 0 })),
    };
  }

  /** Detalhe de um colaborador: progresso em cada curso liberado. */
  async member(tenantId: string, membershipId: string) {
    const m = await this.prisma.membership.findFirstOrThrow({
      where: { id: membershipId, tenantId },
      include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true, gamification: true } }, departments: { include: { department: true } } },
    });
    const courses = await this.prisma.course.findMany({
      where: { status: 'PUBLISHED', planet: { tenantAccess: { some: { tenantId, enabled: true } } } },
      select: { id: true, title: true, planet: { select: { name: true } } },
    });
    const [enrollments, attempts, certs] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId: m.userId, courseId: { in: courses.map((c) => c.id) } } }),
      this.prisma.examAttempt.findMany({ where: { userId: m.userId, submittedAt: { not: null }, exam: { courseId: { in: courses.map((c) => c.id) } } }, include: { exam: { select: { courseId: true } } } }),
      this.prisma.certificate.findMany({ where: { userId: m.userId, revokedAt: null, tenantId }, select: { code: true, type: true, courseId: true, planetId: true, issuedAt: true } }),
    ]);
    return {
      membershipId: m.id,
      user: m.user,
      departments: m.departments.map((d) => d.department),
      courses: courses.map((c) => {
        const e = enrollments.find((x) => x.courseId === c.id);
        const at = attempts.filter((a) => a.exam.courseId === c.id);
        return {
          courseId: c.id,
          course: c.title,
          planet: c.planet.name,
          status: e?.status ?? 'NOT_STARTED',
          progressPct: e?.progressPct ?? 0,
          startedAt: e?.startedAt ?? null,
          completedAt: e?.completedAt ?? null,
          examAttempts: at.length,
          bestExamScorePct: at.length ? Math.max(...at.map((a) => a.scorePct ?? 0)) : null,
          certificateCode: certs.find((x) => x.courseId === c.id)?.code ?? null,
        };
      }),
      certificates: certs,
    };
  }

  // ============================================================== helpers
  private async activeUsers(since: Date) {
    const r = await this.prisma.dailyActivity.findMany({ where: { date: { gte: since } }, distinct: ['userId'], select: { userId: true } });
    return r.length;
  }

  private async dailySeries(sql: string, from: Date, to: Date) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ d: Date; v: number }>>(sql, from, to);
    const map = new Map(rows.map((r) => [new Date(r.d).toISOString().slice(0, 10), Number(r.v)]));
    return this.daysBetween(from, to).map((d) => ({ date: d, value: map.get(d) ?? 0 }));
  }

  private async monthlyRevenue(months: number) {
    const rows = await this.prisma.$queryRaw<Array<{ m: Date; cents: bigint }>>(Prisma.sql`
      SELECT date_trunc('month', paid_at) AS m, COALESCE(SUM(amount_cents), 0) AS cents
      FROM payments WHERE status = 'PAID' AND paid_at >= date_trunc('month', now()) - (${months - 1} * interval '1 month')
      GROUP BY 1 ORDER BY 1`);
    const map = new Map(rows.map((r) => [new Date(r.m).toISOString().slice(0, 7), Number(r.cents)]));
    const out = [];
    const d = new Date();
    d.setUTCDate(1);
    for (let i = months - 1; i >= 0; i--) {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
      const k = x.toISOString().slice(0, 7);
      out.push({ month: k, cents: map.get(k) ?? 0 });
    }
    return out;
  }

  private async topPlanets() {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; enrollments: bigint; completed: bigint }>>(Prisma.sql`
      SELECT p.id, p.name, COUNT(e.id) AS enrollments, COUNT(e.id) FILTER (WHERE e.status = 'COMPLETED') AS completed
      FROM planets p JOIN courses c ON c.planet_id = p.id LEFT JOIN enrollments e ON e.course_id = c.id
      GROUP BY p.id, p.name ORDER BY enrollments DESC LIMIT 10`);
    return rows.map((r) => ({ planetId: r.id, name: r.name, enrollments: Number(r.enrollments), completionPct: pct(Number(r.completed), Number(r.enrollments)) }));
  }

  private async topTenants(since: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; members: bigint; active: bigint }>>(Prisma.sql`
      SELECT t.id, t.trade_name AS name, COUNT(DISTINCT m.user_id) AS members,
             COUNT(DISTINCT da.user_id) AS active
      FROM tenants t
      JOIN memberships m ON m.tenant_id = t.id AND m.status = 'ACTIVE'
      LEFT JOIN daily_activity da ON da.user_id = m.user_id AND da.date >= ${since}::date
      WHERE t.deleted_at IS NULL
      GROUP BY t.id, t.trade_name ORDER BY active DESC LIMIT 10`);
    return rows.map((r) => ({ tenantId: r.id, name: r.name, members: Number(r.members), activeMembers: Number(r.active), engagementPct: pct(Number(r.active), Number(r.members)) }));
  }

  private daysBetween(from: Date, to: Date) {
    const out: string[] = [];
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    while (d <= to && out.length < 400) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }
}
