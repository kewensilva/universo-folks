import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { BillingService } from './billing.service';
import { RevenueCatService } from './revenuecat.service';
import { AdmobSsvService } from './admob-ssv.service';
import { AsaasService } from './asaas.service';

const planSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
  audience: z.enum(['B2C', 'B2B', 'B2G']),
  interval: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_TIME']),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).default('BRL'),
  trialDays: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  appleProductId: z.string().nullable().optional(),
  googleProductId: z.string().nullable().optional(),
  webPriceId: z.string().nullable().optional(),
  /** plano de acesso (Básico, Premium, Premium Plus) que o preço libera */
  tierId: z.string().uuid().nullable().optional(),
});
const grantSchema = z.object({
  userId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  planId: z.string().uuid(),
  periodEnd: z.string().datetime().optional(),
  seats: z.number().int().min(1).optional(),
  adminSeats: z.number().int().min(1).optional(),
  /** valor do contrato por ciclo, quando difere do preço do plano */
  amountCents: z.number().int().min(0).optional(),
});
const paymentSchema = z.object({
  subscriptionId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  amountCents: z.number().int().min(0),
  description: z.string().optional(),
  paidAt: z.string().datetime().optional(),
  status: z.enum(['PAID', 'PENDING']).optional(),
});
const checkoutSchema = z.object({
  planId: z.string().uuid(),
  /** CPF/CNPJ exigido pelo Asaas para emitir a cobrança */
  cpfCnpj: z.string().min(11),
  billingType: z.enum(['UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD']).default('UNDEFINED'),
});
const contractSchema = z.object({
  planId: z.string().uuid(),
  valueCents: z.number().int().min(1).optional(),
  /** licenças de colaboradores do contrato */
  seats: z.number().int().min(1).optional(),
  /** licenças de administradores do contrato */
  adminSeats: z.number().int().min(1).optional(),
  billingType: z.enum(['UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD']).default('BOLETO'),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
});

@ApiTags('financeiro')
@Controller()
export class BillingController {
  constructor(
    private readonly s: BillingService,
    private readonly revenuecat: RevenueCatService,
    private readonly admob: AdmobSsvService,
    private readonly asaas: AsaasService,
  ) {}

  // ---- aluno (B2C)
  @Public() @Get('billing/plans')
  plans(@Query('audience') audience?: 'B2C' | 'B2B' | 'B2G') {
    return this.s.publicPlans(audience ?? 'B2C');
  }

  /** Planos de acesso (Básico, Premium, Premium Plus) com galáxias e preços: tela de assinatura. */
  @Public() @Get('billing/tiers')
  tiers() {
    return this.s.publicTiers();
  }

  @ApiBearerAuth() @Get('billing/me/subscriptions')
  mine(@CurrentUser() u: AuthUser) {
    return this.s.mySubscriptions(u.id);
  }

  /** Premium na versão web pelo Asaas: devolve a fatura (Pix, boleto ou cartão). */
  @ApiBearerAuth() @Post('billing/checkout')
  checkout(@CurrentUser() u: AuthUser, @Body(new ZodPipe(checkoutSchema)) dto: z.infer<typeof checkoutSchema>) {
    return this.s.webCheckout(u, dto.planId, dto.cpfCnpj, dto.billingType);
  }

  @ApiBearerAuth() @Post('billing/subscriptions/:id/cancel')
  cancelMine(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.cancel(u, id);
  }

  /** Premium pelas lojas: webhook da RevenueCat (header Authorization = REVENUECAT_WEBHOOK_AUTH). */
  @Public() @Post('billing/webhooks/revenuecat') @HttpCode(200)
  async revenuecatWebhook(@Headers('authorization') auth: string, @Body() body: any) {
    this.revenuecat.assertAuth(auth);
    return this.revenuecat.handle(body);
  }

  /** Anúncio com recompensa: verificação server-side (SSV) do AdMob. */
  @Public() @Get('billing/webhooks/admob/ssv')
  admobSsv(@Req() req: Request) {
    return this.admob.handle(req.originalUrl);
  }

  /** Webhook do Asaas (header asaas-access-token = ASAAS_WEBHOOK_TOKEN). */
  @Public() @Post('billing/webhooks/asaas') @HttpCode(200)
  async asaasWebhook(@Headers('asaas-access-token') token: string, @Body() body: unknown) {
    this.asaas.assertWebhookToken(token);
    return this.asaas.handleWebhook(body);
  }

  /** MASTER gera a cobrança recorrente do contrato da empresa no Asaas (boleto/Pix). */
  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Post('master/billing/tenants/:tenantId/asaas-contract')
  contract(@CurrentUser() u: AuthUser, @Param('tenantId', ParseUUIDPipe) tenantId: string, @Body(new ZodPipe(contractSchema)) dto: z.infer<typeof contractSchema>) {
    return this.asaas.createTenantContract(u, tenantId, dto);
  }

  // ---- MASTER
  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Get('master/billing/plans')
  listPlans() {
    return this.s.listPlans();
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Post('master/billing/plans')
  createPlan(@CurrentUser() u: AuthUser, @Body(new ZodPipe(planSchema)) dto: z.infer<typeof planSchema>) {
    return this.s.savePlan(u, dto);
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Put('master/billing/plans/:id')
  updatePlan(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(planSchema)) dto: z.infer<typeof planSchema>) {
    return this.s.savePlan(u, { ...dto, id });
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Post('master/billing/subscriptions')
  grant(@CurrentUser() u: AuthUser, @Body(new ZodPipe(grantSchema)) dto: z.infer<typeof grantSchema>) {
    return this.s.grantSubscription(u, dto);
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Post('master/billing/subscriptions/:id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('immediately') immediately?: string) {
    return this.s.cancel(u, id, immediately === 'true');
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Get('master/billing/payments')
  payments(@Query('tenantId') tenantId?: string, @Query('userId') userId?: string, @Query('status') status?: string) {
    return this.s.listPayments({ tenantId, userId, status });
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Post('master/billing/payments')
  recordPayment(@CurrentUser() u: AuthUser, @Body(new ZodPipe(paymentSchema)) dto: z.infer<typeof paymentSchema>) {
    return this.s.recordPayment(u, dto);
  }
}
