import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ActivityKind, AvatarSlot, Prisma, XpSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { AccessService } from '../access/access.service';
import { AuthUser } from '../common/types';
import { dayInTz, pct } from '../common/utils';

const DAY = 86400_000;

/** Teto de XP por evento (protótipo): evita valores absurdos vindos do aparelho. */
export function maxXp(kind: ActivityKind, total = 0): number {
  if (kind === 'LESSON') return 10;
  return Math.max(10, total) * 40 + 100; // 10 XP × combo ×4 por questão + bônus de prova
}

export interface ActivityInput {
  kind: ActivityKind;
  source: XpSource;
  xp: number;
  courseId?: string | null;
  lessonId?: string | null;
  correct?: number | null;
  total?: number | null;
  refId?: string;
}

/** XP, níveis (200 XP por nível), jornada (streak), meta diária e Hangar. */
@Injectable()
export class GamificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly access: AccessService,
  ) {}

  /**
   * Registra uma atividade concluída: evento de ENGAJAMENTO (com a empresa do
   * contexto atual) + XP (com teto) + jornada/meta do dia.
   */
  async recordActivity(user: AuthUser, e: ActivityInput) {
    const xp = Math.max(0, Math.min(Math.round(e.xp), maxXp(e.kind, e.total ?? 0)));
    const prefs = await this.prisma.userPreferences.findUnique({ where: { userId: user.id }, select: { timezone: true } });
    await this.prisma.activityEvent.create({
      data: {
        userId: user.id,
        tenantId: user.mode === 'TENANT' && !user.impersonating ? user.tenantId : null,
        kind: e.kind,
        courseId: e.courseId ?? null,
        lessonId: e.lessonId ?? null,
        correct: e.correct ?? null,
        total: e.total ?? null,
        xp,
        day: dayInTz(new Date(), prefs?.timezone ?? 'America/Sao_Paulo'),
      },
    });
    return this.award(user.id, xp, e.source, e.refId ?? e.lessonId ?? e.courseId ?? undefined);
  }

  async award(userId: string, amount: number, source: XpSource, refId?: string, tx: Prisma.TransactionClient = this.prisma) {
    amount = Math.max(0, amount);
    const prefs = await tx.userPreferences.findUnique({ where: { userId } });
    const today = dayInTz(new Date(), prefs?.timezone);
    const xpPerLevel = await this.settings.get('xp_per_level');

    if (amount > 0) await tx.xpEvent.create({ data: { userId, amount, source, refId } });
    const daily = await tx.dailyActivity.upsert({
      where: { userId_date: { userId, date: today } },
      create: { userId, date: today, xp: amount },
      update: { xp: { increment: amount } },
    });

    const g = await tx.userGamification.upsert({ where: { userId }, create: { userId }, update: {} });
    let streak = g.currentStreak;
    const last = g.lastActivityDate?.getTime();
    if (last !== today.getTime()) streak = last === today.getTime() - DAY ? streak + 1 : 1;
    const totalXp = g.totalXp + amount;
    const level = Math.floor(totalXp / xpPerLevel) + 1;

    const updated = await tx.userGamification.update({
      where: { userId },
      data: { totalXp, level, currentStreak: streak, longestStreak: Math.max(g.longestStreak, streak), lastActivityDate: today },
    });
    const goal = prefs?.dailyGoalXp ?? 100;
    return {
      xpEarned: amount,
      totalXp,
      level,
      leveledUp: level > g.level,
      streak: updated.currentStreak,
      todayXp: daily.xp,
      dailyGoalXp: goal,
      dailyGoalReached: amount > 0 && daily.xp >= goal && daily.xp - amount < goal,
    };
  }

  async profile(userId: string) {
    const [g, prefs, xpPerLevel] = await Promise.all([
      this.prisma.userGamification.upsert({ where: { userId }, create: { userId }, update: {} }),
      this.prisma.userPreferences.findUnique({ where: { userId } }),
      this.settings.get('xp_per_level'),
    ]);
    const today = dayInTz(new Date(), prefs?.timezone);
    const week = await this.prisma.dailyActivity.findMany({
      where: { userId, date: { gte: new Date(today.getTime() - 6 * DAY) } },
      orderBy: { date: 'asc' },
    });
    const todayXp = week.find((d) => d.date.getTime() === today.getTime())?.xp ?? 0;
    // streak "quebrado" se o último dia ativo foi antes de ontem
    const last = g.lastActivityDate?.getTime() ?? 0;
    const streak = last >= today.getTime() - DAY ? g.currentStreak : 0;
    const goal = prefs?.dailyGoalXp ?? 100;
    const xpInLevel = g.totalXp % xpPerLevel;
    return {
      totalXp: g.totalXp,
      level: g.level,
      xpInLevel,
      xpForNextLevel: xpPerLevel,
      levelProgressPct: pct(xpInLevel, xpPerLevel),
      streakDays: streak,
      longestStreak: g.longestStreak,
      todayXp,
      dailyGoalXp: goal,
      dailyGoalPct: Math.min(100, pct(todayXp, goal)),
      last7Days: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today.getTime() - (6 - i) * DAY);
        return { date: d.toISOString().slice(0, 10), xp: week.find((w) => w.date.getTime() === d.getTime())?.xp ?? 0 };
      }),
    };
  }

  // ---------------------------------------------------------------- Hangar
  async hangar(user: AuthUser) {
    const [g, items, equipped, premium] = await Promise.all([
      this.prisma.userGamification.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} }),
      this.prisma.avatarItem.findMany({ orderBy: [{ slot: 'asc' }, { sortOrder: 'asc' }] }),
      this.prisma.userAvatarItem.findMany({ where: { userId: user.id } }),
      this.access.isPremium(user),
    ]);
    const equippedBySlot = new Map(equipped.map((e) => [e.slot, e.itemId]));
    const slots = Object.values(AvatarSlot);
    return {
      level: g.level,
      slots: slots.map((slot) => {
        const slotItems = items.filter((i) => i.slot === slot);
        const current = equippedBySlot.get(slot) ?? slotItems.find((i) => i.isDefault)?.id;
        return {
          slot,
          items: slotItems.map((i) => ({
            ...i,
            unlocked: i.requiredLevel <= g.level && (!i.premiumOnly || premium),
            equipped: i.id === current,
          })),
        };
      }),
    };
  }

  async equip(user: AuthUser, itemId: string) {
    const item = await this.prisma.avatarItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BadRequestException('Item inexistente');
    const g = await this.prisma.userGamification.findUnique({ where: { userId: user.id } });
    if ((g?.level ?? 1) < item.requiredLevel) throw new ForbiddenException(`Disponível a partir do nível ${item.requiredLevel}`);
    if (item.premiumOnly && !(await this.access.isPremium(user))) throw new ForbiddenException('Item exclusivo Premium');
    await this.prisma.userAvatarItem.upsert({
      where: { userId_slot: { userId: user.id, slot: item.slot } },
      create: { userId: user.id, slot: item.slot, itemId },
      update: { itemId },
    });
    return this.hangar(user);
  }
}
