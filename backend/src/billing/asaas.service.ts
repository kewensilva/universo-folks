import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingInterval, PaymentStatus, Plan, Prisma, Subscription } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { dayInTz } from '../common/utils';

export type AsaasBillingType = 'UNDEFINED' | 'PIX' | 'BOLETO' | 'CREDIT_CARD';

const CYCLE: Record<BillingInterval, string | null> = { MONTHLY: 'MONTHLY', QUARTERLY: 'QUARTERLY', YEARLY: 'YEARLY', ONE_TIME: null };
const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

export function addInterval(start: Date, interval: BillingInterval): Date {
  const d = new Date(start);
  if (interval === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (interval === 'QUARTERLY') d.setUTCMonth(d.getUTCMonth() + 3);
  else if (interval === 'YEARLY') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 100);
  return d;
}

const today = () => dayInTz(new Date(), 'America/Sao_Paulo').toISOString().slice(0, 10);
const onlyDigits = (v: string) => v.replace(/\D/g, '');

/**
 * Gateway Asaas (Pix, boleto e cartão).
 *  - Premium B2C na versão WEB (no app, as lojas exigem compra in-app -> RevenueCat)
 *  - Contratos de empresas B2B/B2G (boleto/Pix recorrente)
 *
 * Configuração:
 *   ASAAS_API_KEY        chave da conta (Integrações > Chave de API)
 *   ASAAS_API_URL        https://api-sandbox.asaas.com/v3 (sandbox) | https://api.asaas.com/v3 (produção)
 *   ASAAS_WEBHOOK_TOKEN  token de autenticação do webhook (header asaas-access-token)
 * Webhook no painel do Asaas: POST {APP_URL}/api/billing/webhooks/asaas (eventos de cobrança e assinatura).
 */
@Injectable()
export class AsaasService {
  private readonly log = new Logger(AsaasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  get enabled() {
    return !!this.config.get('ASAAS_API_KEY');
  }

  private get baseUrl() {
    return this.config.get<string>('ASAAS_API_URL', 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '');
  }

  // ------------------------------------------------------------- clientes
  private async customerForUser(userId: string, cpfCnpj: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const doc = onlyDigits(cpfCnpj);
    if (![11, 14].includes(doc.length)) throw new BadRequestException('Informe um CPF ou CNPJ válido');
    if (u.asaasCustomerId) {
      await this.request(`/customers/${u.asaasCustomerId}`, 'POST', { cpfCnpj: doc });
      return u.asaasCustomerId;
    }
    const c = await this.request('/customers', 'POST', { name: u.name, email: u.email, cpfCnpj: doc, externalReference: `user:${u.id}`, notificationDisabled: false });
    await this.prisma.user.update({ where: { id: u.id }, data: { asaasCustomerId: c.id } });
    return c.id as string;
  }

  private async customerForTenant(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (t.asaasCustomerId) return t.asaasCustomerId;
    if (!t.document) throw new BadRequestException('Cadastre o CNPJ da empresa antes de gerar a cobrança');
    const c = await this.request('/customers', 'POST', {
      name: t.legalName,
      company: t.tradeName,
      cpfCnpj: onlyDigits(t.document),
      email: t.contactEmail ?? undefined,
      mobilePhone: t.contactPhone ? onlyDigits(t.contactPhone) : undefined,
      externalReference: `tenant:${t.id}`,
    });
    await this.prisma.tenant.update({ where: { id: t.id }, data: { asaasCustomerId: c.id } });
    return c.id as string;
  }

  // ------------------------------------------------------- B2C (web)
  /** Assinatura Premium na web. Devolve a fatura do Asaas, onde a pessoa paga com Pix, boleto ou cartão. */
  async createB2CCheckout(user: AuthUser, planId: string, cpfCnpj: string, billingType: AsaasBillingType = 'UNDEFINED') {
    this.assertEnabled();
    const plan = await this.prisma.plan.findFirst({ where: { id: planId, audience: 'B2C', isActive: true } });
    if (!plan) throw new BadRequestException('Plano não encontrado ou inativo');
    if (plan.priceCents <= 0) throw new BadRequestException('Plano sem preço definido');
    const active = await this.prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: new Date() }, plan: { audience: 'B2C' } },
    });
    if (active) throw new BadRequestException('Você já tem uma assinatura Premium ativa');

    // checkout anterior não pago é substituído
    const pending = await this.prisma.subscription.findMany({ where: { userId: user.id, provider: 'ASAAS', status: 'PENDING' } });
    for (const p of pending) await this.cancelRemote(p).catch(() => undefined);
    await this.prisma.subscription.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: 'CANCELED', canceledAt: new Date() } });

    const customer = await this.customerForUser(user.id, cpfCnpj);
    const local = await this.prisma.subscription.create({
      data: { userId: user.id, planId: plan.id, provider: 'ASAAS', status: 'PENDING', amountCents: plan.priceCents, currentPeriodStart: new Date(), currentPeriodEnd: new Date() },
    });
    const { remoteId, payment } = await this.createRemote(customer, plan, plan.priceCents, billingType, today(), `sub:${local.id}`, `Universo Folks - ${plan.name}`);
    await this.prisma.subscription.update({ where: { id: local.id }, data: { providerSubscriptionId: remoteId } });
    if (payment) await this.upsertPayment(payment, local);
    return { subscriptionId: local.id, checkoutUrl: payment?.invoiceUrl ?? null, paymentId: payment?.id ?? null, dueDate: payment?.dueDate ?? today() };
  }

  // ------------------------------------------------- contratos B2B/B2G
  /** MASTER gera a cobrança recorrente do contrato da empresa (boleto/Pix). */
  async createTenantContract(
    me: AuthUser,
    tenantId: string,
    dto: { planId: string; valueCents?: number; seats?: number; adminSeats?: number; billingType?: AsaasBillingType; nextDueDate?: string; description?: string },
  ) {
    this.assertEnabled();
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: dto.planId } });
    if (plan.audience === 'B2C') throw new BadRequestException('Use um plano B2B/B2G para contratos de empresa');
    const value = dto.valueCents ?? plan.priceCents * (dto.seats ?? 1);
    if (value <= 0) throw new BadRequestException('Informe o valor do contrato (valueCents)');
    const customer = await this.customerForTenant(tenantId);
    const due = dto.nextDueDate ?? today();
    const start = new Date(`${due}T00:00:00.000Z`);
    const local = await this.prisma.subscription.create({
      data: {
        tenantId, planId: plan.id, provider: 'ASAAS', status: 'ACTIVE', seats: dto.seats, amountCents: value,
        currentPeriodStart: start, currentPeriodEnd: addInterval(start, plan.interval),
      },
    });
    const { remoteId, payment } = await this.createRemote(customer, plan, value, dto.billingType ?? 'BOLETO', due, `sub:${local.id}`, dto.description ?? `Universo Folks - ${plan.name}`);
    await this.prisma.subscription.update({ where: { id: local.id }, data: { providerSubscriptionId: remoteId } });
    if (payment) await this.upsertPayment(payment, local);
    if (dto.seats || dto.adminSeats) {
      await this.prisma.tenantSettings.update({
        where: { tenantId },
        data: { ...(dto.seats ? { maxCollaborators: dto.seats } : {}), ...(dto.adminSeats ? { maxAdmins: dto.adminSeats } : {}) },
      });
    }
    await this.audit.log(me, 'asaas.tenant_contract', 'subscription', local.id, { ...dto, value }, tenantId);
    return { subscriptionId: local.id, asaasId: remoteId, firstInvoiceUrl: payment?.invoiceUrl ?? null, valueCents: value, dueDate: due };
  }

  /** Assinatura recorrente (ou cobrança avulsa em planos ONE_TIME). */
  private async createRemote(customer: string, plan: Plan, valueCents: number, billingType: AsaasBillingType, dueDate: string, externalReference: string, description: string) {
    const cycle = CYCLE[plan.interval];
    if (!cycle) {
      const p = await this.request('/payments', 'POST', { customer, billingType, value: valueCents / 100, dueDate, description, externalReference });
      return { remoteId: `pay:${p.id}`, payment: p };
    }
    const sub = await this.request('/subscriptions', 'POST', { customer, billingType, value: valueCents / 100, nextDueDate: dueDate, cycle, description, externalReference });
    const list = await this.request(`/subscriptions/${sub.id}/payments`, 'GET').catch(() => ({ data: [] }));
    return { remoteId: sub.id as string, payment: list.data?.[0] ?? null };
  }

  async cancelRemote(sub: Subscription) {
    if (!sub.providerSubscriptionId || !this.enabled) return;
    if (sub.providerSubscriptionId.startsWith('pay:')) await this.request(`/payments/${sub.providerSubscriptionId.slice(4)}`, 'DELETE');
    else await this.request(`/subscriptions/${sub.providerSubscriptionId}`, 'DELETE');
  }

  // --------------------------------------------------------------- webhook
  assertWebhookToken(token?: string) {
    const expected = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (!expected) throw new UnauthorizedException('ASAAS_WEBHOOK_TOKEN não configurado');
    const a = Buffer.from(token ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
  }

  async handleWebhook(body: any) {
    const event: string = body?.event ?? '';
    const payment = body?.payment;
    const externalId: string = body?.id ?? `${event}:${payment?.id ?? body?.subscription?.id}:${payment?.status ?? ''}`;
    if (!event) return { ok: true, ignored: 'sem evento' };
    const exists = await this.prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: 'ASAAS', externalId } } });
    if (exists?.processedAt) return { ok: true, duplicate: true };
    const evt = exists ?? (await this.prisma.webhookEvent.create({ data: { provider: 'ASAAS', externalId, type: event, payload: body as Prisma.InputJsonValue } }));
    try {
      const r = await this.process(event, body);
      await this.prisma.webhookEvent.update({ where: { id: evt.id }, data: { processedAt: new Date(), error: null } });
      return { ok: true, ...r };
    } catch (e: any) {
      await this.prisma.webhookEvent.update({ where: { id: evt.id }, data: { error: String(e?.message ?? e) } });
      throw e;
    }
  }

  private async process(event: string, body: any) {
    if (event.startsWith('SUBSCRIPTION_')) {
      const remote = body.subscription;
      if (!remote?.id) return { ignored: event };
      const sub = await this.prisma.subscription.findUnique({ where: { provider_providerSubscriptionId: { provider: 'ASAAS', providerSubscriptionId: remote.id } } });
      if (!sub) return { ignored: 'assinatura desconhecida' };
      if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED') {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: sub.status === 'PENDING' ? 'CANCELED' : sub.status, cancelAtPeriodEnd: true, canceledAt: new Date() } });
      }
      return { subscriptionId: sub.id };
    }
    if (!event.startsWith('PAYMENT_')) return { ignored: event };
    const p = body.payment;
    if (!p?.id) return { ignored: 'sem cobrança' };
    const sub = await this.findSubscription(p);
    if (!sub) {
      this.log.warn(`Asaas ${event}: cobrança ${p.id} sem assinatura local`);
      return { ignored: 'assinatura desconhecida' };
    }
    const status = await this.upsertPayment(p, sub, event === 'PAYMENT_DELETED' ? 'FAILED' : undefined);
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: sub.planId } });

    if (status === 'PAID') {
      const base = new Date(`${(p.dueDate ?? today()).slice(0, 10)}T00:00:00.000Z`);
      const newEnd = addInterval(base, plan.interval);
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: sub.status === 'PENDING' ? new Date() : sub.currentPeriodStart,
          currentPeriodEnd: newEnd > sub.currentPeriodEnd ? newEnd : sub.currentPeriodEnd,
        },
      });
    } else if (event === 'PAYMENT_OVERDUE') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: sub.status === 'PENDING' ? 'PENDING' : 'PAST_DUE' } });
      if (sub.tenantId) await this.audit.log(null, 'asaas.tenant_overdue', 'tenant', sub.tenantId, { paymentId: p.id, dueDate: p.dueDate }, sub.tenantId);
    } else if (event === 'PAYMENT_REFUNDED' && sub.userId) {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED', canceledAt: new Date(), currentPeriodEnd: new Date() } });
    }
    return { subscriptionId: sub.id, paymentStatus: status };
  }

  private async findSubscription(p: any) {
    if (p.subscription) {
      const s = await this.prisma.subscription.findUnique({ where: { provider_providerSubscriptionId: { provider: 'ASAAS', providerSubscriptionId: p.subscription } } });
      if (s) return s;
    }
    const ref: string | undefined = p.externalReference;
    if (ref?.startsWith('sub:')) return this.prisma.subscription.findUnique({ where: { id: ref.slice(4) } });
    return this.prisma.subscription.findUnique({ where: { provider_providerSubscriptionId: { provider: 'ASAAS', providerSubscriptionId: `pay:${p.id}` } } });
  }

  private async upsertPayment(p: any, sub: Subscription, forced?: PaymentStatus): Promise<PaymentStatus> {
    const status: PaymentStatus = forced ?? (PAID.has(p.status) ? 'PAID' : p.status === 'REFUNDED' || p.status === 'REFUND_REQUESTED' ? 'REFUNDED' : 'PENDING');
    const data = {
      amountCents: Math.round(Number(p.value ?? 0) * 100),
      status,
      paidAt: status === 'PAID' ? new Date(p.clientPaymentDate ?? p.paymentDate ?? p.confirmedDate ?? Date.now()) : null,
      description: `${p.billingType ?? ''} venc. ${p.dueDate ?? ''}${p.invoiceUrl ? ` · ${p.invoiceUrl}` : ''}`.trim(),
      raw: p as Prisma.InputJsonValue,
    };
    await this.prisma.payment.upsert({
      where: { provider_providerPaymentId: { provider: 'ASAAS', providerPaymentId: p.id } },
      create: { ...data, provider: 'ASAAS', providerPaymentId: p.id, subscriptionId: sub.id, userId: sub.userId, tenantId: sub.tenantId, currency: 'BRL' },
      update: data,
    });
    return status;
  }

  // ---------------------------------------------------------------- http
  private assertEnabled() {
    if (!this.enabled) throw new ServiceUnavailableException('Pagamento pelo Asaas ainda não configurado (ASAAS_API_KEY)');
  }

  private async request(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        access_token: this.config.get<string>('ASAAS_API_KEY')!,
        'Content-Type': 'application/json',
        'User-Agent': 'universo-folks-api',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = json?.errors?.map((e: any) => e.description).join('; ') || `HTTP ${res.status}`;
      this.log.error(`Asaas ${method} ${path}: ${msg}`);
      throw new BadRequestException(`Asaas: ${msg}`);
    }
    return json;
  }
}
