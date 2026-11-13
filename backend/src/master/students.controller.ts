import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { PaginationQuery, pageResult, paginate } from '../common/dto/pagination.dto';

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

class UsersQuery extends PaginationQuery {
  /** b2c = sem vínculo com empresa | premium = assinatura B2C ativa | all */
  @IsOptional() @IsString() segment?: 'b2c' | 'premium' | 'all';
}

/**
 * Gestão de todos os usuários pelo MASTER - foco em ALUNO-CLIENTE (B2C),
 * que é self-service; o MASTER atua em casos de suporte.
 */
@ApiTags('master / usuários e alunos B2C')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('master/users')
export class StudentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() q: UsersQuery) {
    const { skip, take, page, pageSize } = paginate(q);
    const now = new Date();
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(q.segment === 'b2c' ? { memberships: { none: { status: 'ACTIVE' } } } : {}),
      ...(q.segment === 'premium'
        ? { subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now }, plan: { audience: 'B2C' } } } }
        : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, status: true, platformRole: true, createdAt: true, lastLoginAt: true,
          gamification: { select: { totalXp: true, level: true, currentStreak: true } },
          memberships: { where: { status: 'ACTIVE' }, select: { role: true, tenant: { select: { id: true, tradeName: true } } } },
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now } },
            select: { id: true, status: true, provider: true, currentPeriodEnd: true, plan: { select: { name: true, audience: true } } },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, name: true, displayName: true, email: true, status: true, platformRole: true, createdAt: true, lastLoginAt: true,
        gamification: true,
        memberships: { include: { tenant: { select: { id: true, tradeName: true } }, departments: { include: { department: true } } } },
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' }, take: 20 },
        enrollments: { include: { course: { select: { id: true, title: true, planet: { select: { name: true } } } } } },
        certificates: { select: { id: true, code: true, type: true, issuedAt: true, data: true } },
      },
    });
    if (!user) throw new NotFoundException();
    return user;
  }

  @Patch(':id')
  async update(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    const u = await this.prisma.user.update({ where: { id }, data: dto, select: { id: true, name: true, status: true } });
    if (dto.status === 'DISABLED') {
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log(me, 'user.update', 'user', id, dto);
    return u;
  }
}
