import { ConflictException, Controller, Get, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyInsightsService } from './insights.service';

/** Aba "Empresa" do colaborador: minhas trilhas e ranking entre departamentos. */
@ApiTags('empresa (colaborador)')
@ApiBearerAuth()
@Controller('me/company')
export class MyCompanyController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: CompanyInsightsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sair da empresa (libera a licença). Necessário para entrar em outra, já que
   * cada pessoa só pode estar em UMA empresa. A conta segue no modo individual.
   */
  @Post('leave') @HttpCode(200)
  async leave(@CurrentUser() u: AuthUser) {
    const m = await this.prisma.membership.findFirst({ where: { userId: u.id, status: { in: ['ACTIVE', 'INVITED'] } } });
    if (!m) throw new NotFoundException('Você não faz parte de uma empresa');
    if (m.role === 'ADMIN_CLIENTE') {
      const others = await this.prisma.membership.count({ where: { tenantId: m.tenantId, role: 'ADMIN_CLIENTE', status: 'ACTIVE', id: { not: m.id } } });
      if (!others) throw new ConflictException('Você é o único administrador. Nomeie outro ADMIN antes de sair.');
    }
    await this.prisma.membership.delete({ where: { id: m.id } });
    await this.prisma.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log(u, 'member.leave', 'membership', m.id, undefined, m.tenantId);
    return { left: true, next: 'Faça login de novo: sua conta continua no modo individual.' };
  }

  @Get()
  async get(@CurrentUser() u: AuthUser) {
    if (u.mode !== 'TENANT' || !u.tenantId) throw new NotFoundException('Você não está no modo empresa');
    const [tenant, people] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({ where: { id: u.tenantId }, select: { id: true, tradeName: true, initials: true, color: true, logoUrl: true } }),
      this.insights.people(u.tenantId),
    ]);
    const me = people.find((p) => p.userId === u.id);
    const byDept = new Map<string, { name: string; values: number[] }>();
    for (const p of people) {
      if (!p.tracks.length || p.status === 'INVITED') continue;
      const v = p.tracks.filter((t) => t.progress >= 1).length / p.tracks.length;
      for (const d of p.departments) {
        const e = byDept.get(d.id) ?? { name: d.name, values: [] };
        e.values.push(v);
        byDept.set(d.id, e);
      }
    }
    return {
      company: tenant,
      departments: me?.departments ?? [],
      status: me?.status ?? null,
      tracks: (me?.tracks ?? []).map((t) => ({ ...t, progressPct: Math.round(t.progress * 100) })),
      ranking: [...byDept.entries()]
        .map(([id, e]) => ({ departmentId: id, name: e.name, completionPct: Math.round((e.values.reduce((a, b) => a + b, 0) / e.values.length) * 100), isMine: !!me?.departments.some((d) => d.id === id) }))
        .sort((a, b) => b.completionPct - a.completionPct),
    };
  }
}
