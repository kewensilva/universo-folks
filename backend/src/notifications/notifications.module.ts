import { Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { dayInTz } from '../common/utils';

/**
 * Lembrete diário ("Lembrete diário" + "Horário do lembrete" em Ajustes) e
 * avisos de prazo de trilhas obrigatórias.
 * O envio real (FCM / APNs / e-mail) entra em PushSender.
 */
@Injectable()
export class PushSender {
  private readonly log = new Logger('PushSender');
  async send(tokens: string[], title: string, body: string) {
    // TODO: integrar Firebase Cloud Messaging (Android/iOS/Web) ou Expo Push
    if (tokens.length) this.log.debug(`push x${tokens.length}: ${title} - ${body}`);
  }
}

@Injectable()
export class RemindersJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
  ) {}

  /** Roda a cada minuto e dispara para quem tem o lembrete no horário atual (no seu fuso). */
  @Cron(CronExpression.EVERY_MINUTE)
  async dailyReminder() {
    const prefs = await this.prisma.userPreferences.findMany({
      where: { dailyReminder: true, user: { status: 'ACTIVE', devices: { some: {} } } },
      select: { userId: true, reminderTime: true, timezone: true, dailyGoalXp: true, user: { select: { displayName: true, name: true, devices: { select: { token: true } } } } },
    });
    const now = new Date();
    for (const p of prefs) {
      const hhmm = new Intl.DateTimeFormat('pt-BR', { timeZone: p.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
      if (hhmm !== p.reminderTime) continue;
      const today = await this.prisma.dailyActivity.findUnique({ where: { userId_date: { userId: p.userId, date: dayInTz(now, p.timezone) } } });
      if ((today?.xp ?? 0) >= p.dailyGoalXp) continue; // meta já batida
      const name = p.user.displayName ?? p.user.name.split(' ')[0];
      await this.push.send(p.user.devices.map((d) => d.token), 'Bora continuar?', `E aí, ${name}! Sua meta de hoje ainda está te esperando 🚀`);
    }
  }
}

@Module({ providers: [PushSender, RemindersJob], exports: [PushSender] })
export class NotificationsModule {}
