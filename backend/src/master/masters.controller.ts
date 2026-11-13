import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AuthService } from '../auth/auth.service';
import { PASSWORD_MSG, PASSWORD_RULE } from '../auth/dto/auth.dto';
import { AuditService } from '../audit/audit.service';
import { PaginationQuery, pageResult, paginate } from '../common/dto/pagination.dto';

class CreateMasterDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  /** obrigatório se o e-mail ainda não existe na plataforma */
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password?: string;
}

const select = { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true };

@ApiTags('master / usuários MASTER-FOLKS')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('master/masters')
export class MastersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Query() q: PaginationQuery) {
    const { skip, take, page, pageSize } = paginate(q);
    const where = {
      platformRole: 'MASTER_FOLKS' as const,
      deletedAt: null,
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' as const } }, { email: { contains: q.search, mode: 'insensitive' as const } }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select, skip, take, orderBy: { name: 'asc' } }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  /** Cria um novo MASTER ou promove um usuário existente. */
  @Post()
  async create(@CurrentUser() me: AuthUser, @Body() dto: CreateMasterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    let user;
    if (existing) {
      user = await this.prisma.user.update({ where: { id: existing.id }, data: { platformRole: 'MASTER_FOLKS', deletedAt: null, status: 'ACTIVE' }, select });
    } else {
      if (!dto.password) throw new ForbiddenException('Informe uma senha inicial para o novo MASTER');
      user = await this.prisma.user.create({
        data: {
          name: dto.name,
          email,
          passwordHash: await AuthService.hashPassword(dto.password),
          platformRole: 'MASTER_FOLKS',
          createdById: me.id,
          preferences: { create: {} },
          gamification: { create: {} },
        },
        select,
      });
    }
    await this.audit.log(me, 'master.create', 'user', user.id);
    return user;
  }

  /** Remove o acesso MASTER. Regra: um MASTER não pode excluir a si próprio. */
  @Delete(':id')
  async remove(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (id === me.id) throw new ForbiddenException('Você não pode excluir o seu próprio acesso MASTER');
    const target = await this.prisma.user.findFirst({ where: { id, platformRole: 'MASTER_FOLKS' } });
    if (!target) throw new ForbiddenException('Usuário não é MASTER');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { platformRole: 'USER' } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.apiToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log(me, 'master.remove', 'user', id);
    return { removed: true };
  }
}
