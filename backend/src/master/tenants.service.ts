import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { humanCode, slugify } from '../common/utils';
import { EmailService, templates } from '../email/email.service';
import { assertNoOtherCompany } from '../access/membership-rules';
import { SeatsService } from '../access/seats.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { PaginationQuery, pageResult, paginate } from '../common/dto/pagination.dto';
import { CreateTenantDto, TenantSettingsDto, UpdateTenantDto } from './tenants.dto';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: PlatformSettingsService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
    private readonly seats: SeatsService,
  ) {}

  async list(q: PaginationQuery & { type?: string; status?: string }) {
    const { skip, take, page, pageSize } = paginate(q);
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(q.type ? { type: q.type as any } : {}),
      ...(q.status ? { status: q.status as any } : {}),
      ...(q.search
        ? { OR: [{ tradeName: { contains: q.search, mode: 'insensitive' } }, { legalName: { contains: q.search, mode: 'insensitive' } }, { document: { contains: q.search } }] }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        skip,
        take,
        orderBy: { tradeName: 'asc' },
        include: { settings: true, _count: { select: { departments: true } } },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    const withSeats = await Promise.all(items.map(async (t) => ({ ...t, seats: await this.seats.usage(t.id) })));
    return pageResult(withSeats, total, page, pageSize);
  }

  async get(id: string) {
    const t = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: {
        settings: true,
        departments: { orderBy: { name: 'asc' } },
        subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { memberships: { where: { status: 'ACTIVE' } } } },
      },
    });
    if (!t) throw new NotFoundException('Empresa não encontrada');
    return { ...t, seats: await this.seats.usage(id) };
  }

  async create(me: AuthUser, dto: CreateTenantDto) {
    const defaults = await this.settings.all();
    const joinCode = dto.joinCode ?? (await this.generateJoinCode(dto.tradeName));
    const { admin, settings, ...data } = dto;

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          ...data,
          govDetails: data.govDetails as Prisma.InputJsonValue | undefined,
          initials: data.initials ?? dto.tradeName.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''),
          joinCode,
          settings: {
            create: {
              maxCollaborators: defaults.default_tenant_max_collaborators,
              maxAdmins: defaults.default_tenant_max_admins,
              passingScore: defaults.default_passing_score,
              maxExamAttempts: defaults.default_max_exam_attempts,
              examRetryCooldownHrs: defaults.default_exam_cooldown_hours,
              ...this.settingsData(settings),
            },
          },
        },
        include: { settings: true },
      });

      let adminInfo: { userId: string; email: string; invited: boolean } | undefined;
      if (admin) {
        const email = admin.email.trim().toLowerCase();
        let user = await tx.user.findUnique({ where: { email } });
        if (!user) {
          user = await tx.user.create({
            data: {
              name: admin.name,
              displayName: admin.name.split(' ')[0],
              email,
              passwordHash: admin.password ? await AuthService.hashPassword(admin.password) : null,
              createdById: me.id,
              preferences: { create: {} },
              gamification: { create: {} },
            },
          });
        }
        const invited = !user.passwordHash;
        await assertNoOtherCompany(tx, user.id, tenant.id, email);
        await tx.membership.create({
          data: {
            userId: user.id, oneCompanyKey: user.id, tenantId: tenant.id, role: 'ADMIN_CLIENTE',
            status: invited ? 'INVITED' : 'ACTIVE', invitedAt: new Date(), joinedAt: invited ? null : new Date(),
          },
        });
        adminInfo = { userId: user.id, email, invited };
      }
      return { tenant, admin: adminInfo };
    });
    if (result.admin?.invited) {
      // primeiro ADMIN recebe o convite por e-mail para criar a senha
      const token = await this.auth.createOneTimeToken(result.admin.userId, 'INVITE', 14 * 86400_000, result.tenant.id);
      await this.email.send({ to: result.admin.email, ...templates.invite(this.email.appUrl, token, result.tenant.tradeName, true) });
    }
    await this.audit.log(me, 'tenant.create', 'tenant', result.tenant.id, { tradeName: dto.tradeName }, result.tenant.id);
    return result;
  }

  async update(me: AuthUser, id: string, dto: UpdateTenantDto) {
    await this.get(id);
    const t = await this.prisma.tenant.update({
      where: { id },
      data: { ...dto, govDetails: dto.govDetails as Prisma.InputJsonValue | undefined },
    });
    await this.audit.log(me, 'tenant.update', 'tenant', id, dto, id);
    return t;
  }

  async updateSettings(me: AuthUser, id: string, dto: Partial<TenantSettingsDto>) {
    await this.get(id);
    const u = await this.seats.usage(id);
    if (dto.maxCollaborators !== undefined && dto.maxCollaborators > 0 && dto.maxCollaborators < u.collaborators.used) {
      throw new BadRequestException(`A empresa já tem ${u.collaborators.used} colaboradores. Remova pessoas antes de baixar o limite.`);
    }
    if (dto.maxAdmins !== undefined) {
      if (dto.maxAdmins !== 0 && dto.maxAdmins < 1) throw new BadRequestException('A empresa precisa de pelo menos 1 administrador');
      if (dto.maxAdmins > 0 && dto.maxAdmins < u.admins.used) {
        throw new BadRequestException(`A empresa já tem ${u.admins.used} administradores. Remova ou rebaixe algum antes de baixar o limite.`);
      }
    }
    const s = await this.prisma.tenantSettings.upsert({
      where: { tenantId: id },
      create: { tenantId: id, ...this.settingsData(dto) },
      update: this.settingsData(dto),
    });
    await this.audit.log(me, 'tenant.settings', 'tenant', id, dto, id);
    return s;
  }

  async regenerateJoinCode(me: AuthUser, id: string) {
    const t = await this.get(id);
    const joinCode = await this.generateJoinCode(t.tradeName);
    await this.audit.log(me, 'tenant.join_code', 'tenant', id, undefined, id);
    return this.prisma.tenant.update({ where: { id }, data: { joinCode }, select: { id: true, joinCode: true } });
  }

  /** Exclusão lógica: dados históricos (certificados/pagamentos) são preservados. */
  async remove(me: AuthUser, id: string) {
    await this.get(id);
    await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id }, data: { deletedAt: new Date(), status: 'CANCELED', joinCode: `DELETED-${id}` } }),
      this.prisma.membership.updateMany({ where: { tenantId: id }, data: { status: 'DISABLED', oneCompanyKey: null } }),
    ]);
    await this.audit.log(me, 'tenant.delete', 'tenant', id, undefined, id);
    return { deleted: true };
  }

  private settingsData(s?: Partial<TenantSettingsDto>) {
    if (!s) return {};
    return {
      ...s,
      // null limpa a data; ausente mantém a atual
      contractStart: s.contractStart === null ? null : s.contractStart ? new Date(s.contractStart) : undefined,
      contractEnd: s.contractEnd === null ? null : s.contractEnd ? new Date(s.contractEnd) : undefined,
    };
  }

  private async generateJoinCode(name: string) {
    const base = slugify(name).split('-')[0].toUpperCase().slice(0, 10) || 'FOLKS';
    const year = new Date().getFullYear();
    let code = `${base}-${year}`;
    while (await this.prisma.tenant.findUnique({ where: { joinCode: code } })) {
      code = humanCode(base, 1);
    }
    return code;
  }
}
