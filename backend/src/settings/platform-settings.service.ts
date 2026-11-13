import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Valores padrão das configurações gerais da plataforma (MASTER > Configurações). */
export const PLATFORM_DEFAULTS = {
  /** 80% = regra do protótipo (8 de 10 na prova gerada; 4 de 5 no Feedback) */
  default_passing_score: 80,
  default_max_exam_attempts: 3,
  default_exam_cooldown_hours: 24,
  default_tenant_max_collaborators: 50,
  default_tenant_max_admins: 2,
  xp_per_level: 200,
  xp_video: 10,
  xp_practice_correct: 10,
  xp_practice_fast_bonus: 5,
  xp_exam_passed: 50,
  xp_streak_bonus: 5,
  infinite_practice_size: 12,
  xp_lesson: 5,
  /** plano grátis (protótipo): 1 rodada/dia de prática infinita com 12 exercícios + 1 jam/dia */
  free_infinite_rounds_per_day: 1,
  free_infinite_questions: 12,
  free_jam_per_day: 1,
  /** unidades liberadas no plano grátis ao importar cursos (as demais ficam Premium) */
  free_units_per_course: 2,
  adult_age: 18,
  /** vídeo só conclui no ritmo real de reprodução (até 2x) - impede pular para o fim */
  video_anti_skip: true,
  b2c_premium_trial_days: 0,
  support_email: 'suporte@folks.com.br',
};

export type PlatformSettingKey = keyof typeof PLATFORM_DEFAULTS;

@Injectable()
export class PlatformSettingsService {
  private cache: { at: number; values: typeof PLATFORM_DEFAULTS } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<typeof PLATFORM_DEFAULTS> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.values;
    const rows = await this.prisma.platformSetting.findMany();
    const values = { ...PLATFORM_DEFAULTS } as Record<string, unknown>;
    for (const r of rows) values[r.key] = r.value;
    this.cache = { at: Date.now(), values: values as typeof PLATFORM_DEFAULTS };
    return this.cache.values;
  }

  async get<K extends PlatformSettingKey>(key: K): Promise<(typeof PLATFORM_DEFAULTS)[K]> {
    return (await this.all())[key];
  }

  async update(values: Partial<Record<string, unknown>>) {
    const entries = Object.entries(values).filter(([k]) => k in PLATFORM_DEFAULTS);
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue },
          update: { value: value as Prisma.InputJsonValue },
        }),
      ),
    );
    this.cache = null;
    return this.all();
  }
}

@Global()
@Module({ providers: [PlatformSettingsService], exports: [PlatformSettingsService] })
export class PlatformSettingsModule {}
