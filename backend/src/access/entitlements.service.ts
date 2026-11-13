import { ConflictException, Global, Injectable, Module } from '@nestjs/common';
import { AllowanceFeature } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { AccessService } from './access.service';
import { AuthUser } from '../common/types';
import { dayInTz } from '../common/utils';

export interface Allowance {
  unlimited: boolean;
  perDay: number;
  used: number;
  bonus: number;
  left: number | null;
  questionsPerRound: number | null;
}

export interface Entitlements {
  /** assinatura B2C paga ativa (Premium ou Premium Plus): certificado, prática ilimitada, sem anúncio */
  premium: boolean;
  /** plano de acesso B2C vigente e as galáxias com conteúdo Premium liberado ("ALL" = todas) */
  plan: { code: string; name: string; categories: string[] | 'ALL' } | null;
  premiumUntil: Date | null;
  /** está no contexto de uma empresa ativa */
  company: boolean;
  /** tudo liberado (Premium, empresa ou MASTER) */
  library: boolean;
  minor: boolean;
  /** pode ver anúncio com recompensa: adulto, plano grátis, fora de empresa */
  ads: boolean;
  infinite: Allowance;
  jam: Allowance;
}

const TZ = 'America/Sao_Paulo';

/**
 * Regras do plano (protótipo):
 *  - Grátis: unidades 1 e 2 de cada curso + 1 rodada/dia de prática infinita (12 exercícios) + 1 jam/dia.
 *  - Rodada extra assistindo anúncio com recompensa, SÓ para adultos.
 *  - Premium e empresa: sem limite e sem anúncio.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly settings: PlatformSettingsService,
  ) {}

  static today() {
    return dayInTz(new Date(), TZ);
  }

  async isMinor(userId: string): Promise<boolean> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { birthDate: true } });
    if (!u?.birthDate) return false;
    const adult = await this.settings.get('adult_age');
    const now = new Date();
    const b = u.birthDate;
    let age = now.getUTCFullYear() - b.getUTCFullYear();
    if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) age--;
    return age < adult;
  }

  async get(user: AuthUser): Promise<Entitlements> {
    const [sub, library, minor, cfg, rows, coverage] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: new Date() }, plan: { audience: 'B2C' } },
        orderBy: { currentPeriodEnd: 'desc' },
      }),
      this.access.isPremium(user),
      this.isMinor(user.id),
      this.settings.all(),
      this.prisma.dailyAllowance.findMany({ where: { userId: user.id, day: EntitlementsService.today() } }),
      this.access.planCoverage(user),
    ]);
    const company = user.mode === 'TENANT';
    const allowance = (f: AllowanceFeature, perDay: number, questions: number | null): Allowance => {
      const r = rows.find((x) => x.feature === f) ?? { used: 0, bonus: 0 };
      if (library) return { unlimited: true, perDay, used: r.used, bonus: r.bonus, left: null, questionsPerRound: null };
      return { unlimited: false, perDay, used: r.used, bonus: r.bonus, left: Math.max(0, perDay + r.bonus - r.used), questionsPerRound: questions };
    };
    return {
      premium: !!sub && !user.impersonating,
      premiumUntil: sub?.currentPeriodEnd ?? null,
      plan: coverage.tier ? { ...coverage.tier, categories: coverage.all ? 'ALL' : coverage.categorySlugs } : null,
      company,
      library,
      minor,
      ads: !minor && !library && !company,
      infinite: allowance('INFINITE', cfg.free_infinite_rounds_per_day, cfg.free_infinite_questions),
      jam: allowance('JAM', cfg.free_jam_per_day, null),
    };
  }

  /** Consome uma rodada do dia. 409 "daily_limit" quando acabou (o app mostra "Rodada de hoje concluída"). */
  async consume(user: AuthUser, feature: AllowanceFeature) {
    const ent = await this.get(user);
    const a = feature === 'INFINITE' ? ent.infinite : ent.jam;
    if (!a.unlimited && (a.left ?? 0) <= 0) {
      throw new ConflictException({
        error: 'daily_limit',
        message: feature === 'INFINITE' ? 'Rodada de hoje concluída. Volte amanhã ou assine o Premium.' : 'Jam de hoje feita. Volte amanhã ou assine o Premium.',
        canWatchAd: ent.ads,
      });
    }
    const day = EntitlementsService.today();
    await this.prisma.dailyAllowance.upsert({
      where: { userId_day_feature: { userId: user.id, day, feature } },
      create: { userId: user.id, day, feature, used: 1 },
      update: { used: { increment: 1 } },
    });
    return { ...a, used: a.used + 1, left: a.left === null ? null : a.left - 1 };
  }

  /** Rodada extra por anúncio com recompensa (chamado pelo webhook SSV do AdMob). */
  async grantAdBonus(userId: string, feature: AllowanceFeature, transactionId: string) {
    if (await this.isMinor(userId)) return { granted: false, reason: 'minor' };
    const day = EntitlementsService.today();
    try {
      await this.prisma.$transaction([
        this.prisma.adReward.create({ data: { transactionId, userId, feature } }),
        this.prisma.dailyAllowance.upsert({
          where: { userId_day_feature: { userId, day, feature } },
          create: { userId, day, feature, bonus: 1 },
          update: { bonus: { increment: 1 } },
        }),
      ]);
    } catch (e: any) {
      if (e?.code === 'P2002') return { granted: false, reason: 'duplicate' };
      throw e;
    }
    return { granted: true };
  }
}

@Global()
@Module({ providers: [EntitlementsService], exports: [EntitlementsService] })
export class EntitlementsModule {}
