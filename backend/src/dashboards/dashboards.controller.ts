import { BadRequestException, Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AccessService } from '../access/access.service';
import { CatalogService } from '../catalog/catalog.service';
import { GamificationService } from '../gamification/gamification.service';
import { DashboardsService, Period } from './dashboards.service';
import { CompanyInsightsService } from '../companies/insights.service';

function period(from?: string, to?: string): Period {
  const t = to ? new Date(to) : new Date();
  const f = from ? new Date(from) : new Date(t.getTime() - 29 * 86400_000);
  if (isNaN(t.getTime()) || isNaN(f.getTime()) || f > t) throw new BadRequestException('Período inválido');
  return { from: f, to: t };
}

@ApiTags('dashboards')
@ApiBearerAuth()
@ApiQuery({ name: 'from', required: false, description: 'ISO date (padrão: 30 dias atrás)' })
@ApiQuery({ name: 'to', required: false, description: 'ISO date (padrão: agora)' })
@Controller('dashboards')
export class DashboardsController {
  constructor(
    private readonly s: DashboardsService,
    private readonly access: AccessService,
    private readonly catalog: CatalogService,
    private readonly gamification: GamificationService,
    private readonly insights: CompanyInsightsService,
  ) {}

  /** Ecossistema completo: clientes, usuários, aprendizagem, conteúdo e financeiro. */
  @Roles('MASTER_FOLKS') @Get('master')
  master(@Query('from') from?: string, @Query('to') to?: string) {
    return this.s.master(period(from, to));
  }

  /** Visão geral do protótipo: engajamento geral e por empresa, alertas de limite. */
  @Roles('MASTER_FOLKS') @Get('master/overview')
  overview() {
    return this.insights.masterOverview();
  }

  @Roles('MASTER_FOLKS') @Get('master/report.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="relatorio-geral-folks.csv"')
  masterCsv() {
    return this.insights.masterReportCsv();
  }

  @Roles('MASTER_FOLKS') @Get('master/financial-by-client')
  financial() {
    return this.s.masterFinancialByClient();
  }

  /** Dashboard da empresa. ADMIN usa "me"; MASTER usa o UUID do tenant. */
  @Roles('ADMIN_CLIENTE', 'MASTER_FOLKS') @Get('companies/:tenant')
  @ApiQuery({ name: 'departmentId', required: false })
  async company(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Query('from') from?: string, @Query('to') to?: string, @Query('departmentId') departmentId?: string) {
    const tenantId = this.access.resolveTenant(u, t === 'me' ? undefined : t);
    const [full, summary] = await Promise.all([this.s.tenant(tenantId, period(from, to), departmentId), this.insights.summary(tenantId)]);
    return { ...full, people: summary };
  }

  @Roles('ADMIN_CLIENTE', 'MASTER_FOLKS') @Get('companies/:tenant/members/:membershipId')
  member(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('membershipId', ParseUUIDPipe) membershipId: string) {
    const tenantId = this.access.resolveTenant(u, t === 'me' ? undefined : t);
    return this.s.member(tenantId, membershipId);
  }

  /** Dashboard pessoal do aluno/colaborador. */
  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const [stats, progress, assignments] = await Promise.all([this.catalog.myStats(u), this.gamification.profile(u.id), this.catalog.myAssignments(u)]);
    return { stats, progress, assignments };
  }
}
