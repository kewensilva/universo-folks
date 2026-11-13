import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { EntitlementsService } from '../access/entitlements.service';
import { AuditService } from '../audit/audit.service';
import { DevicePlatform, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AccessService } from '../access/access.service';

class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(1) displayName?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  /** só pode ser informada uma vez (define menor de idade) */
  @IsOptional() @IsDateString({ strict: true }) birthDate?: string;
  /** boas-vindas, dicas e tour já vistos: { welcomed: true, tips: {...} } */
  @IsOptional() @IsObject() tipsSeen?: Record<string, unknown>;
}

class DeleteAccountDto {
  @IsString() password: string;
}

class UpdatePreferencesDto {
  @IsOptional() @IsBoolean() soundEffects?: boolean;
  @IsOptional() @IsBoolean() questionTimer?: boolean;
  @IsOptional() @IsBoolean() reduceAnimations?: boolean;
  @IsOptional() @IsIn([20, 50, 100, 150]) dailyGoalXp?: number;
  @IsOptional() @IsBoolean() dailyReminder?: boolean;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) reminderTime?: string;
  @IsOptional() @IsString() timezone?: string;
}

class DeviceDto {
  @IsEnum(DevicePlatform) platform: DevicePlatform;
  @IsString() token: string;
}

@ApiTags('meu perfil')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async profile(@CurrentUser() u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: {
        id: true, name: true, displayName: true, email: true, avatarUrl: true, platformRole: true, createdAt: true, birthDate: true, tipsSeen: true,
        preferences: true,
        gamification: true,
      },
    });
    return {
      ...user,
      context: { mode: u.mode, tenantId: u.tenantId, tenantRole: u.tenantRole, membershipId: u.membershipId },
      premium: await this.access.isPremium(u),
      b2cPremium: await this.access.hasB2CPremium(u.id),
      entitlements: await this.entitlements.get(u),
    };
  }

  /** Plano e limites do dia (premium, empresa, menor de idade, anúncios, rodadas restantes). */
  @Get('entitlements')
  getEntitlements(@CurrentUser() u: AuthUser) {
    return this.entitlements.get(u);
  }

  @Patch()
  async update(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) {
    const { birthDate, tipsSeen, ...rest } = dto;
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { birthDate: true, tipsSeen: true } });
    if (birthDate && current.birthDate) throw new BadRequestException('A data de nascimento já foi informada. Fale com o suporte para corrigir.');
    return this.prisma.user.update({
      where: { id: u.id },
      data: {
        ...rest,
        ...(birthDate ? { birthDate: new Date(`${birthDate}T00:00:00.000Z`) } : {}),
        ...(tipsSeen ? { tipsSeen: { ...(current.tipsSeen as object), ...tipsSeen } as Prisma.InputJsonValue } : {}),
      },
      select: { id: true, name: true, displayName: true, avatarUrl: true, birthDate: true, tipsSeen: true },
    });
  }

  /**
   * Apagar minha conta (LGPD): anonimiza os dados pessoais, encerra sessões e
   * vínculos. Registros agregados (engajamento, pagamentos) ficam sem identificação.
   */
  @Post('delete-account') @HttpCode(200)
  async deleteAccount(@CurrentUser() u: AuthUser, @Body() dto: DeleteAccountDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!user.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new BadRequestException('Senha incorreta');
    if (user.platformRole === 'MASTER_FOLKS') throw new BadRequestException('Remova seu acesso MASTER antes de apagar a conta');
    const admins = await this.prisma.membership.findMany({ where: { userId: u.id, role: 'ADMIN_CLIENTE', status: 'ACTIVE' }, select: { tenantId: true } });
    for (const a of admins) {
      const others = await this.prisma.membership.count({ where: { tenantId: a.tenantId, role: 'ADMIN_CLIENTE', status: 'ACTIVE', userId: { not: u.id } } });
      if (!others) throw new BadRequestException('Você é o único administrador de uma empresa. Nomeie outro ADMIN antes de apagar a conta.');
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: u.id },
        data: {
          email: `excluido-${u.id}@excluido.invalid`, name: 'Conta excluída', displayName: null, avatarUrl: null, birthDate: null,
          passwordHash: null, status: 'DISABLED', deletedAt: now, tipsSeen: {},
        },
      }),
      this.prisma.membership.deleteMany({ where: { userId: u.id } }),
      this.prisma.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.deviceToken.deleteMany({ where: { userId: u.id } }),
      this.prisma.oneTimeToken.deleteMany({ where: { userId: u.id } }),
      this.prisma.courseState.deleteMany({ where: { userId: u.id } }),
      this.prisma.gameState.deleteMany({ where: { userId: u.id } }),
    ]);
    await this.audit.log(u, 'user.delete_account', 'user', u.id);
    return { deleted: true };
  }

  @Get('preferences')
  preferences(@CurrentUser() u: AuthUser) {
    return this.prisma.userPreferences.upsert({ where: { userId: u.id }, create: { userId: u.id }, update: {} });
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() u: AuthUser, @Body() dto: UpdatePreferencesDto) {
    return this.prisma.userPreferences.upsert({ where: { userId: u.id }, create: { userId: u.id, ...dto }, update: dto });
  }

  /** Registra o token de push (lembrete diário no app). */
  @Post('devices')
  registerDevice(@CurrentUser() u: AuthUser, @Body() dto: DeviceDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId: u.id, platform: dto.platform, token: dto.token },
      update: { userId: u.id, platform: dto.platform },
    });
  }

  @Delete('devices/:token')
  async removeDevice(@CurrentUser() u: AuthUser, @Param('token') token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId: u.id } });
    return { removed: true };
  }
}
