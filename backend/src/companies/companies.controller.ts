import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AdminTenantSettingsDto } from '../master/tenants.dto';
import { CompaniesService } from './companies.service';
import { CompanyInsightsService, Mode } from './insights.service';
import {
  AssignmentDto, BulkMembersDto, CreateMemberDto, DepartmentDto, MembersQuery, PlanetAccessDto, PeopleQuery, RemindersDto, ReorderAssignmentsDto, UpdateAssignmentDto, UpdateDepartmentDto, UpdateMemberDto,
} from './companies.dto';

/**
 * Rotas de gestão da empresa.
 *  - ADMIN-CLIENTE usa  /companies/me/...
 *  - MASTER-FOLKS  usa  /companies/{tenantId}/...
 */
@ApiTags('empresa (ADMIN-CLIENTE / MASTER)')
@ApiBearerAuth()
@ApiParam({ name: 'tenant', description: '"me" para o ADMIN-CLIENTE ou o UUID do tenant para o MASTER' })
@Roles('ADMIN_CLIENTE', 'MASTER_FOLKS')
@Controller('companies/:tenant')
export class CompaniesController {
  constructor(
    private readonly s: CompaniesService,
    private readonly insights: CompanyInsightsService,
  ) {}

  @Get() overview(@CurrentUser() u: AuthUser, @Param('tenant') t: string) {
    return this.s.overview(u, t);
  }

  @Patch('settings') settings(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: AdminTenantSettingsDto) {
    return this.s.updateSettings(u, t, dto);
  }

  // departamentos
  @Get('departments') listDepartments(@CurrentUser() u: AuthUser, @Param('tenant') t: string) {
    return this.s.listDepartments(u, t);
  }
  @Post('departments') createDepartment(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: DepartmentDto) {
    return this.s.createDepartment(u, t, dto);
  }
  @Patch('departments/:id') updateDepartment(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto) {
    return this.s.updateDepartment(u, t, id, dto);
  }
  @Delete('departments/:id') deleteDepartment(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteDepartment(u, t, id);
  }

  // colaboradores
  @Get('members') listMembers(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Query() q: MembersQuery) {
    return this.s.listMembers(u, t, q);
  }
  @Post('members') createMember(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: CreateMemberDto) {
    return this.s.createMember(u, t, dto);
  }
  @Post('members/bulk') bulk(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: BulkMembersDto) {
    return this.s.bulkCreateMembers(u, t, dto.members);
  }
  @Patch('members/:id') updateMember(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMemberDto) {
    return this.s.updateMember(u, t, id, dto);
  }
  @Post('members/:id/resend-invite') @HttpCode(200) resend(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.resendInvite(u, t, id);
  }

  /** Pessoas com situação nas trilhas: INVITED | ON_TRACK | LATE | NOT_STARTED | DONE. */
  @Get('people') people(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Query() q: PeopleQuery) {
    return this.s.people(u, t, q);
  }

  /** Lembrete por e-mail (padrão: atrasados e quem não começou). */
  @Post('reminders') @HttpCode(200) reminders(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: RemindersDto) {
    return this.s.sendReminders(u, t, dto.membershipIds);
  }

  /** Engajamento: 8 semanas ou 8 meses. */
  @Get('engagement') engagement(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Query('mode') mode: Mode = 'week') {
    return this.insights.engagement(this.s.tenantId(u, t), mode === 'month' ? 'month' : 'week');
  }

  /** Relatório completo em CSV (abre no Excel). */
  @Get('report.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="relatorio-folks.csv"')
  report(@CurrentUser() u: AuthUser, @Param('tenant') t: string) {
    return this.insights.companyReportCsv(this.s.tenantId(u, t));
  }

  @Delete('members/:id') removeMember(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.removeMember(u, t, id);
  }

  // planetas liberados para a empresa / setores
  @Get('planets') planets(@CurrentUser() u: AuthUser, @Param('tenant') t: string) {
    return this.s.listPlanetAccess(u, t);
  }
  @Put('planets/:planetId') setPlanet(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('planetId', ParseUUIDPipe) p: string, @Body() dto: PlanetAccessDto) {
    return this.s.setPlanetAccess(u, t, p, dto);
  }

  // trilhas obrigatórias, prioridades e prazos
  @Get('assignments') assignments(@CurrentUser() u: AuthUser, @Param('tenant') t: string) {
    return this.s.listAssignments(u, t);
  }
  @Post('assignments') createAssignment(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: AssignmentDto) {
    return this.s.createAssignment(u, t, dto);
  }
  @Put('assignments/order') reorder(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: ReorderAssignmentsDto) {
    return this.s.reorderAssignments(u, t, dto.orderedIds);
  }
  @Patch('assignments/:id') updateAssignment(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssignmentDto) {
    return this.s.updateAssignment(u, t, id, dto);
  }
  @Delete('assignments/:id') deleteAssignment(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteAssignment(u, t, id);
  }
}
