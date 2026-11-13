import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { addInterval, AsaasBillingType, AsaasService } from './asaas.service';


@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly asaas: AsaasService,
  ) {}

  // ------------------------------------------------------------------ planos
  publicPlans(audience: 'B2C' | 'B2B' | 'B2G' = 'B2C') {
    return this.prisma.plan.findMany({
      where: { isActive: true, audience },
      orderBy: { priceCents: 'asc' },
      select: {
        id: true, code: true, name: true, description: true, interval: true, priceCents: true, currency: true, trialDays: true, appleProductId: true, googleProductId: true,
        // plano de acesso que o preço libera, com as galáxias (tela de assinatura)
        tier: { select: { code: true, name: true, description: true, includesAllCategories: true, sortOrder: true, categories: { select: { category: { select: { slug: true, name: true } } } } } },
      },
    });
  }

  /**
   * Planos de acesso do aluno para a tela de assinatura (web e app): Básico, Premium, Premium Plus,
   * as galáxias de cada um e os preços ativos. Público, sem dado de ninguém.
   */
  async publicTiers() {
    const [tiers, all] = await Promise.all([
      this.prisma.planTier.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          code: true, name: true, description: true, isDefault: true, includesAllCategories: true, sortOrder: true,
          categories: { select: { category: { select: { slug: true, name: true, isActive: true } } } },
          plans: {
            where: { isActive: true, audience: 'B2C' },
            orderBy: { priceCents: 'asc' },
            select: { id: true, code: true, name: true, interval: true, priceCents: true, currency: true, trialDays: true, appleProductId: true, googleProductId: true },
          },
        },
      }),
      this.prisma.studyCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true } }),
    ]);
    return tiers.map(({ categories, ...t }) => ({
      ...t,
      categories: t.includesAllCategories ? all : categories.map((c) => c.category).filter((c) => c.isActive).map(({ slug, name }) => ({ slug, name })),
    }));
  }

  listPlans() {
    return this.prisma.plan.findMany({ orderBy: [{ audience: 'asc' }, { priceCents: 'asc' }], include: { tier: { select: { id: true, code: true, name: true } }, _count: { select: { subscriptions: true } } } });
  }

  async savePlan(me: AuthUser, data: Prisma.PlanUncheckedCreateInput & { id?: string }) {
    const { id, ...rest } = data;
    if (rest.tierId && !(await this.prisma.planTier.count({ where: { id: rest.tierId } }))) throw new BadRequestException('Plano de acesso não encontrado');
    const plan = id ? await this.prisma.plan.update({ where: { id }, data: rest }) : await this.prisma.plan.create({ data: rest });
    await this.audit.log(me, id ? 'plan.update' : 'plan.create', 'plan', plan.id, rest);
    return plan;
  }

  // ----------------------------------------------------------- assinaturas
  mySubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { name: true, interval: true, priceCents: true, currency: true } } },
    });
  }

  /** Premium na versão WEB, pelo Asaas (Pix, boleto ou cartão). No app, a compra é pela loja (RevenueCat). */
  webCheckout(user: AuthUser, planId: string, cpfCnpj: string, billingType?: AsaasBillingType) {
    return this.asaas.createB2CCheckout(user, planId, cpfCnpj, billingType);
  }

  // -------------------------------------------- lançamentos manuais (MASTER)
  /** Contratos B2B/B2G e cortesias B2C lançados pelo MASTER. */
  async grantSubscription(me: AuthUser, dto: { userId?: string; tenantId?: string; planId: string; periodEnd?: string; seats?: number; adminSeats?: number; amountCents?: number }) {
    if (!!dto.userId === !!dto.tenantId) throw new BadRequestException('Informe userId OU tenantId');
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: dto.planId } });
    const start = new Date();
    const sub = await this.prisma.subscription.create({
      data: {
        userId: dto.userId,
        tenantId: dto.tenantId,
        planId: plan.id,
        provider: 'MANUAL',
        status: 'ACTIVE',
        seats: dto.seats,
        amountCents: dto.amountCents,
        currentPeriodStart: start,
        currentPeriodEnd: dto.periodEnd ? new Date(dto.periodEnd) : addInterval(start, plan.interval),
      },
    });
    if (dto.tenantId && (dto.seats || dto.adminSeats)) {
      await this.prisma.tenantSettings.update({
        where: { tenantId: dto.tenantId },
        data: { ...(dto.seats ? { maxCollaborators: dto.seats } : {}), ...(dto.adminSeats ? { maxAdmins: dto.adminSeats } : {}) },
      });
    }
    await this.audit.log(me, 'subscription.grant', 'subscription', sub.id, dto, dto.tenantId);
    return sub;
  }

  async recordPayment(me: AuthUser, dto: { subscriptionId?: string; userId?: string; tenantId?: string; amountCents: number; description?: string; paidAt?: string; status?: 'PAID' | 'PENDING' }) {
    const p = await this.prisma.payment.create({
      data: {
        subscriptionId: dto.subscriptionId,
        userId: dto.userId,
        tenantId: dto.tenantId,
        amountCents: dto.amountCents,
        description: dto.description,
        provider: 'MANUAL',
        status: dto.status ?? 'PAID',
        paidAt: (dto.status ?? 'PAID') === 'PAID' ? (dto.paidAt ? new Date(dto.paidAt) : new Date()) : null,
      },
    });
    await this.audit.log(me, 'payment.record', 'payment', p.id, dto, dto.tenantId);
    return p;
  }

  async cancel(me: AuthUser, subscriptionId: string, immediately = false) {
    const sub = await this.prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    if (me.mode !== 'PLATFORM' && sub.userId !== me.id) throw new NotFoundException();
    if (sub.provider === 'APPLE' || sub.provider === 'GOOGLE' || sub.provider === 'REVENUECAT') {
      throw new BadRequestException('Assinaturas feitas pela loja são canceladas nas configurações da Apple/Google');
    }
    if (sub.provider === 'ASAAS') await this.asaas.cancelRemote(sub);
    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: immediately ? { status: 'CANCELED', canceledAt: new Date(), currentPeriodEnd: new Date() } : { cancelAtPeriodEnd: true, canceledAt: new Date() },
    });
    await this.audit.log(me, 'subscription.cancel', 'subscription', subscriptionId, { immediately }, sub.tenantId ?? undefined);
    return updated;
  }

  listPayments(filter: { tenantId?: string; userId?: string; status?: string; take?: number }) {
    return this.prisma.payment.findMany({
      where: { tenantId: filter.tenantId, userId: filter.userId, status: filter.status as any },
      orderBy: { createdAt: 'desc' },
      take: filter.take ?? 100,
      include: { tenant: { select: { tradeName: true } }, user: { select: { name: true, email: true } } },
    });
  }

  /** Expira assinaturas vencidas (renovações chegam por webhook). */
  @Cron(CronExpression.EVERY_HOUR)
  async expireSubscriptions() {
    const r = await this.prisma.subscription.updateMany({
      where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }, provider: { not: 'ASAAS' }, currentPeriodEnd: { lt: new Date(Date.now() - 3 * 86400_000) } },
      data: { status: 'EXPIRED' },
    });
    if (r.count) this.log.log(`${r.count} assinatura(s) expirada(s)`);
  }
}
