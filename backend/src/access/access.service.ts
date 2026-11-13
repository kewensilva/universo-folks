import { BadRequestException, ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { AccessTier, ContentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { PlatformSettingsService } from '../settings/platform-settings.service';

export interface CourseAccess {
  visible: boolean;
  locked: boolean;
  reason?: 'PREMIUM_REQUIRED' | 'COMING_SOON' | 'NOT_RELEASED_FOR_DEPARTMENT';
  /** plano de acesso mais barato que libera o curso (só B2C bloqueado por plano) */
  requiredPlan?: string | null;
}

/** Galáxias (categorias) com o conteúdo Premium liberado no contexto atual. */
export interface PlanCoverage {
  /** plano de acesso B2C vigente (o maior assinado, ou o padrão de quem não assina) */
  tier: { code: string; name: string } | null;
  all: boolean;
  categoryIds: Set<string>;
  categorySlugs: string[];
}

type TierWithCats = { id: string; code: string; name: string; includesAllCategories: boolean; sortOrder: number; categories: { categoryId: string; category: { slug: string } }[] };
const tierInclude = { categories: { select: { categoryId: true, category: { select: { slug: true } } } } } as const;

/**
 * Ponto ÚNICO de regras de acesso / isolamento multi-tenant.
 * Todos os módulos consultam este serviço em vez de reimplementar regras.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  // ----------------------------------------------------------- multi-tenant
  /**
   * Resolve em qual tenant a operação administrativa acontece.
   *  - MASTER: precisa informar o tenantId (rota /master/tenants/:id/...)
   *  - ADMIN-CLIENTE: sempre o próprio tenant; qualquer outro id é negado.
   */
  resolveTenant(user: AuthUser, requestedTenantId?: string): string {
    if (user.platformRole === 'MASTER_FOLKS' && user.mode === 'PLATFORM') {
      if (!requestedTenantId) throw new BadRequestException('tenantId é obrigatório para o MASTER');
      return requestedTenantId;
    }
    if (user.mode === 'TENANT' && user.tenantRole === 'ADMIN_CLIENTE' && user.tenantId) {
      if (requestedTenantId && requestedTenantId !== user.tenantId) throw new ForbiddenException('Acesso a outra empresa negado');
      return user.tenantId;
    }
    throw new ForbiddenException('Ação exclusiva de administradores');
  }

  isMaster(user: AuthUser) {
    return user.platformRole === 'MASTER_FOLKS' && user.mode === 'PLATFORM';
  }

  // --------------------------------------------------------------- premium
  async hasB2CPremium(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { gt: new Date() },
        plan: { audience: 'B2C' },
      },
      select: { id: true },
    });
    return !!sub;
  }

  /** Premium efetivo no contexto atual. */
  async isPremium(user: AuthUser): Promise<boolean> {
    if (user.mode === 'PLATFORM') return true;
    if (user.mode === 'B2C') return this.hasB2CPremium(user.id);
    const s = await this.prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId! } });
    return s?.grantsPremiumAccess ?? true;
  }

  // ------------------------------------------------------ planos de acesso
  /**
   * Planos de acesso (Básico, Premium, Premium Plus): cada um libera o conteúdo Premium de
   * algumas galáxias. O conteúdo grátis vale para todos. Empresa e MASTER não usam planos:
   * empresa segue "grantsPremiumAccess" + planetas liberados; MASTER vê tudo.
   * Preço sem plano de acesso vinculado (tierId null) libera tudo, como antes dos planos.
   */
  async planCoverage(user: AuthUser): Promise<PlanCoverage> {
    if (user.mode !== 'B2C') {
      const all = await this.isPremium(user);
      return { tier: null, all, categoryIds: new Set(), categorySlugs: [] };
    }
    const [subs, def] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: new Date() }, plan: { audience: 'B2C' } },
        select: { plan: { select: { tierId: true, tier: { include: tierInclude } } } },
      }),
      this.prisma.planTier.findFirst({ where: { isDefault: true }, include: tierInclude }),
    ]);
    const tiers: TierWithCats[] = [...(def ? [def] : []), ...subs.flatMap((s) => (s.plan.tier ? [s.plan.tier] : []))];
    const legacy = subs.some((s) => !s.plan.tierId);
    const ids = new Set<string>();
    const slugs = new Set<string>();
    for (const t of tiers) for (const c of t.categories) { ids.add(c.categoryId); slugs.add(c.category.slug); }
    const top = tiers.reduce<TierWithCats | null>((a, t) => (!a || t.sortOrder > a.sortOrder ? t : a), null);
    return {
      tier: top ? { code: top.code, name: top.name } : null,
      all: legacy || tiers.some((t) => t.includesAllCategories),
      categoryIds: ids,
      categorySlugs: [...slugs],
    };
  }

  covers(c: PlanCoverage, categoryId: string) {
    return c.all || c.categoryIds.has(categoryId);
  }

  /** Conteúdo Premium desta galáxia liberado para o usuário? */
  async premiumFor(user: AuthUser, categoryId: string): Promise<boolean> {
    return this.covers(await this.planCoverage(user), categoryId);
  }

  /** Planos à venda (não o padrão), do mais barato ao mais completo: base do "Disponível no Premium Plus". */
  upgradeTiers() {
    return this.prisma.planTier.findMany({ where: { isActive: true, isDefault: false }, orderBy: { sortOrder: 'asc' }, include: tierInclude });
  }

  requiredPlanFor(categoryId: string, tiers: TierWithCats[]): string | null {
    return tiers.find((t) => t.includesAllCategories || t.categories.some((c) => c.categoryId === categoryId))?.name ?? null;
  }

  // ---------------------------------------------------------- visibilidade
  async userDepartmentIds(user: AuthUser): Promise<string[]> {
    if (!user.membershipId) return [];
    const rows = await this.prisma.membershipDepartment.findMany({
      where: { membershipId: user.membershipId },
      select: { departmentId: true },
    });
    return rows.map((r) => r.departmentId);
  }

  /** Filtro Prisma dos planetas que o usuário enxerga no contexto atual. */
  async planetWhere(user: AuthUser): Promise<Prisma.PlanetWhereInput> {
    const visibleStatus: ContentStatus[] = ['PUBLISHED', 'COMING_SOON'];
    if (user.mode === 'PLATFORM') return {};
    if (user.mode === 'B2C') {
      return { status: { in: visibleStatus }, availableB2C: true, category: { isActive: true } };
    }
    const deptIds = await this.userDepartmentIds(user);
    // ADMIN enxerga tudo o que a empresa liberou (para gerenciar)
    const deptFilter: Prisma.TenantPlanetAccessWhereInput =
      user.tenantRole === 'ADMIN_CLIENTE'
        ? {}
        : { OR: [{ allDepartments: true }, { departments: { some: { departmentId: { in: deptIds } } } }] };
    return {
      status: { in: visibleStatus },
      availableB2B: true,
      category: { isActive: true },
      tenantAccess: { some: { tenantId: user.tenantId, enabled: true, ...deptFilter } },
    };
  }

  async canSeePlanet(user: AuthUser, planetId: string): Promise<boolean> {
    const where = await this.planetWhere(user);
    return (await this.prisma.planet.count({ where: { AND: [where, { id: planetId }] } })) > 0;
  }

  effectiveTier(course: { accessTier: AccessTier | null }, planet: { accessTier: AccessTier }): AccessTier {
    return course.accessTier ?? planet.accessTier;
  }

  /**
   * Regra de acesso de um curso (grátis/premium/em breve/setor).
   * `premium` = conteúdo Premium desta galáxia liberado (se omitido, é calculado pelo plano de acesso).
   */
  async courseAccess(
    user: AuthUser,
    course: { accessTier: AccessTier | null; status: ContentStatus; planetId: string },
    planet: { accessTier: AccessTier; status: ContentStatus; categoryId: string },
    premium?: boolean,
  ): Promise<CourseAccess> {
    if (user.mode === 'PLATFORM') return { visible: true, locked: false };
    if (!(await this.canSeePlanet(user, course.planetId))) {
      return { visible: false, locked: true, reason: 'NOT_RELEASED_FOR_DEPARTMENT' };
    }
    if (planet.status === 'COMING_SOON' || course.status === 'COMING_SOON') {
      return { visible: true, locked: true, reason: 'COMING_SOON' };
    }
    if (course.status !== 'PUBLISHED') return { visible: false, locked: true };
    const tier = this.effectiveTier(course, planet);
    if (tier === 'FREE') return { visible: true, locked: false };
    const isPremium = premium ?? (await this.premiumFor(user, planet.categoryId));
    if (isPremium) return { visible: true, locked: false };
    const requiredPlan = user.mode === 'B2C' ? this.requiredPlanFor(planet.categoryId, await this.upgradeTiers()) : null;
    return { visible: true, locked: true, reason: 'PREMIUM_REQUIRED', requiredPlan };
  }

  /** Lança 403 se o usuário não pode consumir o curso. */
  async assertCourseUnlocked(user: AuthUser, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, include: { planet: true } });
    if (!course) throw new BadRequestException('Curso não encontrado');
    const access = await this.courseAccess(user, course, course.planet);
    if (!access.visible || access.locked) {
      throw new ForbiddenException({ message: 'Curso bloqueado', reason: access.reason ?? 'LOCKED' });
    }
    return course;
  }

  // ------------------------------------------------------- regras do tenant
  async sequentialFlow(user: AuthUser): Promise<boolean> {
    if (user.mode !== 'TENANT') return true;
    const s = await this.prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId! } });
    return s?.enforceSequentialFlow ?? true;
  }

  /** Média exigida: prova > empresa (contexto TENANT) > plataforma. */
  async passingScore(user: AuthUser, examPassingScore?: number | null): Promise<number> {
    if (examPassingScore != null) return examPassingScore;
    if (user.mode === 'TENANT' && user.tenantId) {
      const s = await this.prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId } });
      if (s) return s.passingScore;
    }
    return this.settings.get('default_passing_score');
  }

  async examLimits(user: AuthUser): Promise<{ maxAttempts: number; cooldownHours: number }> {
    if (user.mode === 'TENANT' && user.tenantId) {
      const s = await this.prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId } });
      if (s) return { maxAttempts: s.maxExamAttempts, cooldownHours: s.examRetryCooldownHrs };
    }
    const all = await this.settings.all();
    return { maxAttempts: all.default_max_exam_attempts, cooldownHours: all.default_exam_cooldown_hours };
  }
}

@Global()
@Module({ providers: [AccessService], exports: [AccessService] })
export class AccessModule {}
