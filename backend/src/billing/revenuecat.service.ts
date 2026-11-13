import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan, Prisma, SubscriptionStatus } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

/** Evento do webhook da RevenueCat (campos usados). */
interface RcEvent {
  id: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id: string;
  period_type?: 'TRIAL' | 'INTRO' | 'NORMAL' | 'PROMOTIONAL' | 'PREPAID';
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  store?: string; // APP_STORE | PLAY_STORE | STRIPE | RC_BILLING | PROMOTIONAL | AMAZON
  environment?: 'SANDBOX' | 'PRODUCTION';
  transaction_id?: string;
  original_transaction_id?: string;
  price_in_purchased_currency?: number;
  currency?: string;
  cancel_reason?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT']);
const PAID_TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE']);

/**
 * Premium pelas lojas via RevenueCat (decisão do protótipo).
 * No app: Purchases.logIn(<id do usuário da API>) -> app_user_id = users.id.
 * No painel da RevenueCat: webhook para POST /api/billing/webhooks/revenuecat
 * com o header Authorization = REVENUECAT_WEBHOOK_AUTH.
 */
@Injectable()
export class RevenueCatService {
  private readonly log = new Logger(RevenueCatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  assertAuth(header?: string) {
    const expected = this.config.get<string>('REVENUECAT_WEBHOOK_AUTH');
    if (!expected) throw new UnauthorizedException('REVENUECAT_WEBHOOK_AUTH não configurado');
    const a = Buffer.from(header ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
  }

  async handle(body: { event?: RcEvent }) {
    const e = body?.event;
    if (!e?.id || !e.type) return { ok: true, ignored: 'sem evento' };
    const exists = await this.prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: 'REVENUECAT', externalId: e.id } } });
    if (exists?.processedAt) return { ok: true, duplicate: true };
    const evt = exists ?? (await this.prisma.webhookEvent.create({ data: { provider: 'REVENUECAT', externalId: e.id, type: e.type, payload: body as Prisma.InputJsonValue } }));

    try {
      const result = await this.process(e);
      await this.prisma.webhookEvent.update({ where: { id: evt.id }, data: { processedAt: new Date(), error: null } });
      return { ok: true, ...result };
    } catch (err: any) {
      await this.prisma.webhookEvent.update({ where: { id: evt.id }, data: { error: String(err?.message ?? err) } });
      throw err;
    }
  }

  private async process(e: RcEvent) {
    if (e.type === 'TEST') return { ignored: 'TEST' };
    const acceptSandbox = this.config.get('REVENUECAT_ACCEPT_SANDBOX') === 'true' || this.config.get('NODE_ENV') !== 'production';
    if (e.environment === 'SANDBOX' && !acceptSandbox) return { ignored: 'SANDBOX' };

    const userId = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])].find((id) => id && UUID.test(id));
    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }) : null;
    if (!user) {
      this.log.warn(`RevenueCat ${e.type}: app_user_id ${e.app_user_id} não corresponde a um usuário`);
      return { ignored: 'usuário desconhecido' };
    }

    const plan = await this.planFor(e);
    const subKey = e.original_transaction_id ?? `${user.id}:${e.product_id}`;
    const current = await this.prisma.subscription.findUnique({
      where: { provider_providerSubscriptionId: { provider: 'REVENUECAT', providerSubscriptionId: subKey } },
    });

    let status: SubscriptionStatus | undefined;
    let cancelAtPeriodEnd: boolean | undefined;
    if (ACTIVE_TYPES.has(e.type)) {
      status = e.period_type === 'TRIAL' ? 'TRIALING' : 'ACTIVE';
      cancelAtPeriodEnd = false;
    } else if (e.type === 'CANCELLATION') {
      // reembolso pelo suporte encerra na hora; cancelamento normal vale até o fim do período
      if (e.cancel_reason === 'CUSTOMER_SUPPORT') status = 'CANCELED';
      cancelAtPeriodEnd = true;
    } else if (e.type === 'EXPIRATION') {
      status = 'EXPIRED';
    } else if (e.type === 'BILLING_ISSUE') {
      status = 'PAST_DUE';
    } else {
      return { ignored: e.type };
    }

    const start = e.purchased_at_ms ? new Date(e.purchased_at_ms) : new Date();
    const end = e.expiration_at_ms ? new Date(e.expiration_at_ms) : e.type === 'NON_RENEWING_PURCHASE' ? new Date(Date.now() + 100 * 365 * 86400_000) : current?.currentPeriodEnd ?? new Date();
    const sub = await this.prisma.subscription.upsert({
      where: { provider_providerSubscriptionId: { provider: 'REVENUECAT', providerSubscriptionId: subKey } },
      create: {
        userId: user.id,
        planId: plan.id,
        provider: 'REVENUECAT',
        providerSubscriptionId: subKey,
        status: status ?? 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: cancelAtPeriodEnd ?? false,
      },
      update: {
        planId: plan.id,
        ...(status ? { status } : {}),
        ...(cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd } : {}),
        ...(ACTIVE_TYPES.has(e.type) || e.type === 'EXPIRATION' ? { currentPeriodStart: start, currentPeriodEnd: end } : {}),
        ...(status === 'CANCELED' ? { canceledAt: new Date(), currentPeriodEnd: new Date() } : {}),
      },
    });

    if (PAID_TYPES.has(e.type) && e.transaction_id && (e.price_in_purchased_currency ?? 0) > 0) {
      await this.prisma.payment.upsert({
        where: { provider_providerPaymentId: { provider: 'REVENUECAT', providerPaymentId: e.transaction_id } },
        create: {
          subscriptionId: sub.id,
          userId: user.id,
          amountCents: Math.round((e.price_in_purchased_currency ?? 0) * 100),
          currency: e.currency ?? 'BRL',
          status: 'PAID',
          provider: 'REVENUECAT',
          providerPaymentId: e.transaction_id,
          description: `${plan.name} (${e.store ?? 'loja'})`,
          paidAt: start,
          raw: e as unknown as Prisma.InputJsonValue,
        },
        update: {},
      });
    }
    return { subscriptionId: sub.id, status: sub.status };
  }

  /** Produto -> plano. Produto desconhecido cria um plano B2C inativo para não perder o Premium. */
  private async planFor(e: RcEvent): Promise<Plan> {
    const found = await this.prisma.plan.findFirst({
      where: { OR: [{ appleProductId: e.product_id }, { googleProductId: e.product_id }, { webPriceId: e.product_id }] },
    });
    if (found) return found;
    this.log.warn(`Produto ${e.product_id} sem plano vinculado - criando plano automático (revise em /master/billing/plans)`);
    const code = `rc-${e.product_id}`.slice(0, 60);
    return this.prisma.plan.upsert({
      where: { code },
      create: {
        code,
        name: `Premium (${e.product_id})`,
        audience: 'B2C',
        interval: /year|anual|annual/i.test(e.product_id) ? 'YEARLY' : 'MONTHLY',
        priceCents: Math.round((e.price_in_purchased_currency ?? 0) * 100),
        currency: e.currency ?? 'BRL',
        isActive: false,
        ...(e.store === 'APP_STORE' ? { appleProductId: e.product_id } : e.store === 'PLAY_STORE' ? { googleProductId: e.product_id } : { webPriceId: e.product_id }),
      },
      update: {},
    });
  }
}
