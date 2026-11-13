import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { pageResult, paginate } from '../common/dto/pagination.dto';
import { pct } from '../common/utils';
import { EmailService, templates } from '../email/email.service';
import { CompanyInsightsService, PersonStatus } from './insights.service';
import { assertNoOtherCompany, oneCompanyKey } from '../access/membership-rules';
import { SeatsService } from '../access/seats.service';
import {
  AdminTenantSettingsDto,
} from '../master/tenants.dto';
import {
  AssignmentDto, CreateMemberDto, DepartmentDto, MembersQuery, PlanetAccessDto, UpdateDepartmentDto, UpdateMemberDto,
} from './companies.dto';

/**
 * Gestão da empresa - usado pelo ADMIN-CLIENTE (somente o próprio tenant)
 * e pelo MASTER-FOLKS (qualquer tenant). O isolamento é garantido por
 * AccessService.resolveTenant em TODOS os métodos.
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly email: EmailService,
    private readonly insights: CompanyInsightsService,
    private readonly seats: SeatsService,
  ) {}

  tenantId(user: AuthUser, param: string) {
    return this.access.resolveTenant(user, param === 'me' ? undefined : param);
  }

  // ---------------------------------------------------------------- empresa
  async overview(user: AuthUser, param: string) {
    const tenantId = this.tenantId(user, param);
    const t = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { settings: true, _count: { select: { departments: true } } },
    });
    return { ...t, seats: await this.seats.usage(tenantId) };
  }

  async updateSettings(user: AuthUser, param: string, dto: AdminTenantSettingsDto) {
    const tenantId = this.tenantId(user, param);
    const s = await this.prisma.tenantSettings.update({ where: { tenantId }, data: dto });
    await this.audit.log(user, 'company.settings', 'tenant', tenantId, dto, tenantId);
    return s;
  }

  // ---------------------------------------------------------- departamentos
  async listDepartments(user: AuthUser, param: string) {
    const tenantId = this.tenantId(user, param);
    const deps = await this.prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: { where: { membership: { status: 'ACTIVE' } } } } } },
    });
    return deps.map(({ _count, ...d }) => ({ ...d, memberCount: _count.members }));
  }

  async createDepartment(user: AuthUser, param: string, dto: DepartmentDto) {
    const tenantId = this.tenantId(user, param);
    if (dto.parentId) await this.assertDepartment(tenantId, dto.parentId);
    const d = await this.prisma.department.create({ data: { ...dto, tenantId } });
    await this.audit.log(user, 'department.create', 'department', d.id, dto, tenantId);
    return d;
  }

  async updateDepartment(user: AuthUser, param: string, id: string, dto: UpdateDepartmentDto) {
    const tenantId = this.tenantId(user, param);
    await this.assertDepartment(tenantId, id);
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('Departamento não pode ser pai de si mesmo');
      await this.assertDepartment(tenantId, dto.parentId);
    }
    const d = await this.prisma.department.update({ where: { id }, data: dto });
    await this.audit.log(user, 'department.update', 'department', id, dto, tenantId);
    return d;
  }

  async deleteDepartment(user: AuthUser, param: string, id: string) {
    const tenantId = this.tenantId(user, param);
    await this.assertDepartment(tenantId, id);
    await this.prisma.department.delete({ where: { id } });
    await this.audit.log(user, 'department.delete', 'department', id, undefined, tenantId);
    return { deleted: true };
  }

  private async assertDepartment(tenantId: string, id: string) {
    const d = await this.prisma.department.findFirst({ where: { id, tenantId } });
    if (!d) throw new NotFoundException('Departamento não encontrado nesta empresa');
    return d;
  }

  private async assertDepartments(tenantId: string, ids?: string[]) {
    if (!ids?.length) return;
    const n = await this.prisma.department.count({ where: { tenantId, id: { in: ids } } });
    if (n !== new Set(ids).size) throw new BadRequestException('Um ou mais departamentos não pertencem a esta empresa');
  }

  // ----------------------------------------------------------- colaboradores
  async listMembers(user: AuthUser, param: string, q: MembersQuery) {
    const tenantId = this.tenantId(user, param);
    const { skip, take, page, pageSize } = paginate(q);
    const where: Prisma.MembershipWhereInput = {
      tenantId,
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.departmentId ? { departments: { some: { departmentId: q.departmentId } } } : {}),
      ...(q.search
        ? { user: { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        skip,
        take,
        orderBy: { user: { name: 'asc' } },
        include: {
          user: { select: { id: true, name: true, email: true, lastLoginAt: true, gamification: { select: { totalXp: true, level: true, currentStreak: true } } } },
          departments: { include: { department: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.membership.count({ where }),
    ]);

    // progresso de cada colaborador nos cursos liberados pela empresa
    const userIds = items.map((m) => m.userId);
    const courseIds = await this.tenantCourseIds(tenantId);
    const enrollments = await this.prisma.enrollment.groupBy({
      by: ['userId', 'status'],
      where: { userId: { in: userIds }, courseId: { in: courseIds } },
      _count: true,
    });
    const certs = await this.prisma.certificate.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, tenantId, revokedAt: null },
      _count: true,
    });

    return pageResult(
      items.map((m) => {
        const mine = enrollments.filter((e) => e.userId === m.userId);
        const completed = mine.find((e) => e.status === 'COMPLETED')?._count ?? 0;
        const started = mine.reduce((a, e) => a + e._count, 0);
        return {
          membershipId: m.id,
          role: m.role,
          status: m.status,
          jobTitle: m.jobTitle,
          user: m.user,
          departments: m.departments.map((d) => d.department),
          coursesStarted: started,
          coursesCompleted: completed,
          completionPct: pct(completed, courseIds.length),
          certificates: certs.find((c) => c.userId === m.userId)?._count ?? 0,
        };
      }),
      total,
      page,
      pageSize,
    );
  }

  async createMember(user: AuthUser, param: string, dto: CreateMemberDto) {
    const tenantId = this.tenantId(user, param);
    const result = await this.createMemberInternal(user, tenantId, dto);
    await this.audit.log(user, 'member.create', 'membership', result.membershipId, { email: dto.email, role: dto.role }, tenantId);
    return result;
  }

  async bulkCreateMembers(user: AuthUser, param: string, members: CreateMemberDto[]) {
    const tenantId = this.tenantId(user, param);
    const created: unknown[] = [];
    const errors: Array<{ email: string; error: string }> = [];
    for (const m of members) {
      try {
        created.push(await this.createMemberInternal(user, tenantId, m));
      } catch (e: any) {
        errors.push({ email: m.email, error: e?.message ?? 'erro' });
      }
    }
    await this.audit.log(user, 'member.bulk_create', 'membership', undefined, { created: created.length, errors: errors.length }, tenantId);
    return { created, errors };
  }

  /**
   * Cria (ou reaproveita) a conta e o vínculo. Conta nova recebe CONVITE por
   * e-mail (status INVITED, ocupa licença) e cria a senha pelo link.
   */
  private async createMemberInternal(actor: AuthUser, tenantId: string, dto: CreateMemberDto) {
    await this.assertDepartments(tenantId, dto.departmentIds);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    await this.seats.assertAvailable(tenantId, dto.role ?? 'COLABORADOR_CLIENTE');

    const email = dto.email.trim().toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });
    if (user?.deletedAt) throw new ConflictException(`${email} não está disponível`);
    if (user) {
      const exists = await this.prisma.membership.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId } } });
      if (exists?.status === 'DISABLED') throw new ConflictException(`${email} já foi da equipe e está desativado. Reative o acesso em vez de cadastrar de novo.`);
      if (exists) throw new ConflictException(`${email} já está na equipe`);
      await assertNoOtherCompany(this.prisma, user.id, tenantId, email);
    } else {
      user = await this.prisma.user.create({
        data: {
          name: dto.name,
          displayName: dto.name.split(' ')[0],
          email,
          passwordHash: dto.password ? await AuthService.hashPassword(dto.password) : null,
          createdById: actor.id,
          preferences: { create: {} },
          gamification: { create: {} },
        },
      });
    }
    const invited = !user.passwordHash;
    const m = await this.prisma.membership.create({
      data: {
        userId: user.id,
        oneCompanyKey: user.id,
        tenantId,
        role: dto.role ?? 'COLABORADOR_CLIENTE',
        jobTitle: dto.jobTitle,
        status: invited ? 'INVITED' : 'ACTIVE',
        invitedAt: new Date(),
        joinedAt: invited ? null : new Date(),
        departments: dto.departmentIds?.length ? { create: dto.departmentIds.map((departmentId) => ({ departmentId })) } : undefined,
      },
    });
    if (invited) await this.sendInvite(user.id, email, tenantId, tenant.tradeName, m.role === 'ADMIN_CLIENTE');
    return { membershipId: m.id, userId: user.id, email, role: m.role, status: m.status, invited };
  }

  private async sendInvite(userId: string, email: string, tenantId: string, company: string, admin: boolean) {
    const token = await this.auth.createOneTimeToken(userId, 'INVITE', 14 * 86400_000, tenantId);
    await this.email.send({ to: email, ...templates.invite(this.email.appUrl, token, company, admin) });
  }

  async resendInvite(user: AuthUser, param: string, membershipId: string) {
    const tenantId = this.tenantId(user, param);
    const m = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId, status: 'INVITED' },
      include: { user: { select: { id: true, email: true } }, tenant: { select: { tradeName: true } } },
    });
    if (!m) throw new NotFoundException('Não há convite pendente para essa pessoa');
    await this.prisma.oneTimeToken.updateMany({ where: { userId: m.userId, purpose: 'INVITE', usedAt: null }, data: { usedAt: new Date() } });
    await this.sendInvite(m.userId, m.user.email, tenantId, m.tenant.tradeName, m.role === 'ADMIN_CLIENTE');
    await this.prisma.membership.update({ where: { id: m.id }, data: { invitedAt: new Date() } });
    return { sent: true };
  }

  /** Lembrete por e-mail para quem está atrasado/não começou (ou para os escolhidos). */
  async sendReminders(user: AuthUser, param: string, membershipIds?: string[]) {
    const tenantId = this.tenantId(user, param);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const people = (await this.insights.people(tenantId)).filter((p) =>
      membershipIds?.length ? membershipIds.includes(p.membershipId) : p.status === 'LATE' || p.status === 'NOT_STARTED',
    );
    let sent = 0;
    for (const p of people) {
      const pending = p.tracks.filter((t) => t.progress < 1);
      if (!pending.length || p.status === 'INVITED') continue;
      await this.email.send({
        to: p.email,
        ...templates.reminder(this.email.appUrl, tenant.tradeName, pending.map((t) => ({ title: t.title, due: t.due ? t.due.split('-').reverse().join('/') : null }))),
      });
      sent++;
    }
    await this.audit.log(user, 'company.reminders', 'tenant', tenantId, { sent }, tenantId);
    return { sent };
  }

  /** Pessoas com situação nas trilhas (em dia, atrasado, não começou, concluiu, convite). */
  async people(user: AuthUser, param: string, f: { status?: PersonStatus; departmentId?: string; search?: string }) {
    const tenantId = this.tenantId(user, param);
    let list = await this.insights.people(tenantId);
    if (f.status) list = list.filter((p) => p.status === f.status);
    if (f.departmentId) list = list.filter((p) => p.departments.some((d) => d.id === f.departmentId));
    if (f.search) {
      const q = f.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.email.includes(q));
    }
    return list;
  }

  async updateMember(user: AuthUser, param: string, membershipId: string, dto: UpdateMemberDto) {
    const tenantId = this.tenantId(user, param);
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, tenantId } });
    if (!m) throw new NotFoundException('Colaborador não encontrado nesta empresa');
    await this.assertDepartments(tenantId, dto.departmentIds);

    const demoting = m.role === 'ADMIN_CLIENTE' && ((dto.role && dto.role !== 'ADMIN_CLIENTE') || dto.status === 'DISABLED');
    if (demoting) await this.assertAnotherAdmin(tenantId, m.id);
    if (dto.status === 'INVITED') throw new BadRequestException('Use "reenviar convite" para convidar de novo');
    const targetRole = dto.role ?? m.role;
    const reactivating = dto.status === 'ACTIVE' && m.status === 'DISABLED';
    const occupiesSeat = m.status !== 'DISABLED' && dto.status !== 'DISABLED';
    if (reactivating) {
      await this.seats.assertAvailable(tenantId, targetRole); // volta a ocupar a cota do papel
      await assertNoOtherCompany(this.prisma, m.userId, tenantId);
    } else if (occupiesSeat && targetRole !== m.role) {
      await this.seats.assertAvailable(tenantId, targetRole); // troca de papel muda de cota
    }

    const { departmentIds, ...rest } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (departmentIds) {
        await tx.membershipDepartment.deleteMany({ where: { membershipId } });
        if (departmentIds.length) {
          await tx.membershipDepartment.createMany({ data: departmentIds.map((departmentId) => ({ membershipId, departmentId })) });
        }
      }
      return tx.membership.update({
        where: { id: membershipId },
        data: { ...rest, ...(rest.status ? { oneCompanyKey: oneCompanyKey(m.userId, rest.status) } : {}) },
        include: { departments: { include: { department: true } } },
      });
    });
    await this.audit.log(user, 'member.update', 'membership', membershipId, dto, tenantId);
    return updated;
  }

  /** Remove o vínculo com a empresa. A conta do usuário continua existindo (B2C). */
  async removeMember(user: AuthUser, param: string, membershipId: string) {
    const tenantId = this.tenantId(user, param);
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, tenantId } });
    if (!m) throw new NotFoundException();
    if (m.role === 'ADMIN_CLIENTE') await this.assertAnotherAdmin(tenantId, m.id);
    await this.prisma.membership.delete({ where: { id: membershipId } });
    await this.audit.log(user, 'member.remove', 'membership', membershipId, { userId: m.userId }, tenantId);
    return { removed: true };
  }

  private async assertAnotherAdmin(tenantId: string, exceptMembershipId: string) {
    const others = await this.prisma.membership.count({
      where: { tenantId, role: 'ADMIN_CLIENTE', status: 'ACTIVE', id: { not: exceptMembershipId } },
    });
    if (others === 0) throw new ForbiddenException('A empresa precisa ter pelo menos um ADMIN ativo');
  }

  // --------------------------------------------- catálogo liberado (toggles)
  /** Lista planetas B2B com o estado de liberação da empresa (print dos chips por setor). */
  async listPlanetAccess(user: AuthUser, param: string) {
    const tenantId = this.tenantId(user, param);
    const planets = await this.prisma.planet.findMany({
      where: { availableB2B: true, status: { in: ['PUBLISHED', 'COMING_SOON'] } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { courses: { where: { status: 'PUBLISHED' } } } },
        tenantAccess: { where: { tenantId }, include: { departments: { include: { department: { select: { id: true, name: true } } } } } },
      },
    });
    return planets.map(({ tenantAccess, _count, ...p }) => {
      const a = tenantAccess[0];
      return {
        planet: { ...p, courseCount: _count.courses },
        enabled: a?.enabled ?? false,
        allDepartments: a?.allDepartments ?? true,
        departments: a?.departments.map((d) => d.department) ?? [],
      };
    });
  }

  async setPlanetAccess(user: AuthUser, param: string, planetId: string, dto: PlanetAccessDto) {
    const tenantId = this.tenantId(user, param);
    const planet = await this.prisma.planet.findFirst({ where: { id: planetId, availableB2B: true } });
    if (!planet) throw new NotFoundException('Planeta não disponível para empresas');
    const deptIds = dto.allDepartments ? [] : dto.departmentIds ?? [];
    await this.assertDepartments(tenantId, deptIds);

    const result = await this.prisma.$transaction(async (tx) => {
      const a = await tx.tenantPlanetAccess.upsert({
        where: { tenantId_planetId: { tenantId, planetId } },
        create: { tenantId, planetId, enabled: dto.enabled, allDepartments: dto.allDepartments },
        update: { enabled: dto.enabled, allDepartments: dto.allDepartments },
      });
      await tx.tenantPlanetDepartment.deleteMany({ where: { accessId: a.id } });
      if (deptIds.length) await tx.tenantPlanetDepartment.createMany({ data: deptIds.map((departmentId) => ({ accessId: a.id, departmentId })) });
      return a;
    });
    await this.audit.log(user, 'company.planet_access', 'planet', planetId, dto, tenantId);
    return result;
  }

  async tenantCourseIds(tenantId: string): Promise<string[]> {
    const rows = await this.prisma.course.findMany({
      where: { status: 'PUBLISHED', planet: { tenantAccess: { some: { tenantId, enabled: true } } } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // --------------------------------------- trilhas obrigatórias / prioridade
  async listAssignments(user: AuthUser, param: string) {
    const tenantId = this.tenantId(user, param);
    return this.prisma.assignment.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: {
        planet: { select: { id: true, name: true } },
        course: { select: { id: true, title: true } },
        department: { select: { id: true, name: true } },
        membership: { select: { id: true, user: { select: { id: true, name: true } } } },
      },
    });
  }

  async createAssignment(user: AuthUser, param: string, dto: AssignmentDto) {
    const tenantId = this.tenantId(user, param);
    await this.validateAssignment(tenantId, dto);
    const a = await this.prisma.assignment.create({
      data: {
        tenantId,
        targetType: dto.targetType,
        planetId: dto.targetType === 'PLANET' ? dto.planetId : null,
        courseId: dto.targetType === 'COURSE' ? dto.courseId : null,
        departmentId: dto.departmentId,
        membershipId: dto.membershipId,
        mandatory: dto.mandatory ?? false,
        priority: dto.priority ?? 100,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        createdById: user.id,
      },
    });
    await this.audit.log(user, 'assignment.create', 'assignment', a.id, dto, tenantId);
    return a;
  }

  async updateAssignment(user: AuthUser, param: string, id: string, dto: Partial<AssignmentDto>) {
    const tenantId = this.tenantId(user, param);
    const current = await this.prisma.assignment.findFirst({ where: { id, tenantId } });
    if (!current) throw new NotFoundException();
    const merged = { ...current, ...dto } as AssignmentDto;
    await this.validateAssignment(tenantId, merged);
    const a = await this.prisma.assignment.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt !== undefined ? (dto.startsAt ? new Date(dto.startsAt) : null) : undefined,
        dueDate: dto.dueDate !== undefined ? (dto.dueDate ? new Date(dto.dueDate) : null) : undefined,
      },
    });
    await this.audit.log(user, 'assignment.update', 'assignment', id, dto, tenantId);
    return a;
  }

  async reorderAssignments(user: AuthUser, param: string, orderedIds: string[]) {
    const tenantId = this.tenantId(user, param);
    const n = await this.prisma.assignment.count({ where: { tenantId, id: { in: orderedIds } } });
    if (n !== orderedIds.length) throw new BadRequestException('IDs inválidos');
    await this.prisma.$transaction(orderedIds.map((id, i) => this.prisma.assignment.update({ where: { id }, data: { priority: (i + 1) * 10 } })));
    return this.listAssignments(user, param);
  }

  async deleteAssignment(user: AuthUser, param: string, id: string) {
    const tenantId = this.tenantId(user, param);
    const r = await this.prisma.assignment.deleteMany({ where: { id, tenantId } });
    if (!r.count) throw new NotFoundException();
    await this.audit.log(user, 'assignment.delete', 'assignment', id, undefined, tenantId);
    return { deleted: true };
  }

  private async validateAssignment(tenantId: string, dto: AssignmentDto) {
    if (dto.targetType === 'PLANET' && !dto.planetId) throw new BadRequestException('planetId obrigatório');
    if (dto.targetType === 'COURSE' && !dto.courseId) throw new BadRequestException('courseId obrigatório');
    if (dto.departmentId && dto.membershipId) throw new BadRequestException('Informe departamento OU colaborador, não ambos');
    const planetId =
      dto.targetType === 'PLANET'
        ? dto.planetId!
        : (await this.prisma.course.findUnique({ where: { id: dto.courseId! }, select: { planetId: true } }))?.planetId;
    if (!planetId) throw new NotFoundException('Curso não encontrado');
    const enabled = await this.prisma.tenantPlanetAccess.findFirst({ where: { tenantId, planetId, enabled: true } });
    if (!enabled) throw new BadRequestException('Libere o planeta para a empresa antes de criar a trilha');
    if (dto.departmentId) await this.assertDepartment(tenantId, dto.departmentId);
    if (dto.membershipId) {
      const m = await this.prisma.membership.findFirst({ where: { id: dto.membershipId, tenantId } });
      if (!m) throw new NotFoundException('Colaborador não encontrado nesta empresa');
    }
  }
}
