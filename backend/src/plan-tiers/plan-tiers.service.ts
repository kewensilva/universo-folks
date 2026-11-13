import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { slugify } from '@folks/content-ingest';
import { z } from 'zod';
import { patchOf } from '../common/zod-partial';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

export const tierCreate = z.object({
  code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, 'Código: minúsculas, números e hífen (ex.: premium-plus)').optional(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).nullish(),
  /** galáxias com o conteúdo Premium liberado */
  categoryIds: z.array(z.string().uuid()).default([]),
  /** todas as galáxias, inclusive as criadas depois */
  includesAllCategories: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export const tierUpdate = patchOf(tierCreate.omit({ code: true }));

const include = {
  categories: { select: { category: { select: { id: true, slug: true, name: true } } } },
  plans: { select: { id: true, code: true, name: true, audience: true, interval: true, priceCents: true, currency: true, isActive: true }, orderBy: { priceCents: 'asc' } },
} satisfies Prisma.PlanTierInclude;

/**
 * Menu Planos do MASTER: planos de acesso do aluno (Básico, Premium, Premium Plus) e as
 * galáxias que cada um libera. A regra de acesso fica no AccessService (ponto único).
 */
@Injectable()
export class PlanTiersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list() {
    const [tiers, subs] = await Promise.all([
      this.prisma.planTier.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include }),
      this.prisma.subscription.groupBy({
        by: ['planId'],
        where: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: new Date() }, plan: { tierId: { not: null } } },
        _count: { _all: true },
      }),
    ]);
    const byPlan = new Map(subs.map((s) => [s.planId, s._count._all]));
    return tiers.map(({ categories, ...t }) => ({
      ...t,
      categories: categories.map((c) => c.category),
      activeSubscriptions: t.plans.reduce((a, p) => a + (byPlan.get(p.id) ?? 0), 0),
    }));
  }

  private async assertCategories(ids: string[]) {
    if (!ids.length) return;
    const n = await this.prisma.studyCategory.count({ where: { id: { in: ids } } });
    if (n !== new Set(ids).size) throw new BadRequestException('Galáxia não encontrada');
  }

  async create(me: AuthUser, dto: z.infer<typeof tierCreate>) {
    const code = dto.code ?? slugify(dto.name);
    if (await this.prisma.planTier.findUnique({ where: { code } })) throw new ConflictException(`Já existe um plano com o código "${code}"`);
    if (dto.isDefault && !dto.isActive) throw new BadRequestException('O plano de quem não assina precisa ficar ativo');
    await this.assertCategories(dto.categoryIds);
    const { categoryIds, ...data } = dto;
    const sortOrder = dto.sortOrder ?? ((await this.prisma.planTier.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
    const t = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.planTier.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.planTier.create({ data: { ...data, code, sortOrder, categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } } });
    });
    await this.audit.log(me, 'plan_tier.create', 'plan_tier', t.id, dto);
    return t;
  }

  async update(me: AuthUser, id: string, dto: z.infer<typeof tierUpdate>) {
    const cur = await this.prisma.planTier.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Plano não encontrado');
    // sempre existe exatamente um plano padrão (o de quem não assina)
    if (cur.isDefault && dto.isDefault === false) throw new BadRequestException('Marque outro plano como "de quem não assina" em vez de desmarcar este');
    const willBeDefault = dto.isDefault ?? cur.isDefault;
    if (willBeDefault && (dto.isActive ?? cur.isActive) === false) throw new BadRequestException('O plano de quem não assina precisa ficar ativo');
    if (dto.categoryIds) await this.assertCategories(dto.categoryIds);
    const { categoryIds, ...data } = dto;
    const t = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault && !cur.isDefault) await tx.planTier.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      if (categoryIds) {
        await tx.planTierCategory.deleteMany({ where: { tierId: id } });
        if (categoryIds.length) await tx.planTierCategory.createMany({ data: categoryIds.map((categoryId) => ({ tierId: id, categoryId })) });
      }
      return tx.planTier.update({ where: { id }, data });
    });
    await this.audit.log(me, 'plan_tier.update', 'plan_tier', id, dto);
    return t;
  }

  async remove(me: AuthUser, id: string) {
    const t = await this.prisma.planTier.findUnique({ where: { id }, include: { _count: { select: { plans: true } } } });
    if (!t) throw new NotFoundException('Plano não encontrado');
    if (t.isDefault) throw new BadRequestException('O plano de quem não assina não pode ser excluído');
    if (t._count.plans) throw new ConflictException(`${t._count.plans} preço(s) liberam este plano. Desvincule-os no Financeiro ou desative o plano.`);
    await this.prisma.planTier.delete({ where: { id } });
    await this.audit.log(me, 'plan_tier.delete', 'plan_tier', id, { code: t.code });
    return { ok: true };
  }
}
