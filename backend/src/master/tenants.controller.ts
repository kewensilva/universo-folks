import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { PaginationQuery } from '../common/dto/pagination.dto';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, TenantSettingsDto, UpdateTenantDto } from './tenants.dto';

/**
 * Classe (não interseção de tipos): só assim o ValidationPipe converte page/pageSize para número.
 * Com `PaginationQuery & {...}` o Prisma recebia take: "50" (texto) e a rota dava 500.
 */
class TenantsQuery extends PaginationQuery {
  @IsOptional() @IsIn(['B2B', 'B2G']) type?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED', 'CANCELED']) status?: string;
}

@ApiTags('master / clientes (empresas B2B e órgãos B2G)')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('master/tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get() list(@Query() q: TenantsQuery) {
    return this.service.list(q);
  }

  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post() create(@CurrentUser() me: AuthUser, @Body() dto: CreateTenantDto) {
    return this.service.create(me, dto);
  }

  @Patch(':id') update(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto) {
    return this.service.update(me, id, dto);
  }

  /** Parametrização por cliente: limite de usuários, média, tentativas, contrato... */
  @Patch(':id/settings') settings(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TenantSettingsDto) {
    return this.service.updateSettings(me, id, dto);
  }

  @Post(':id/join-code') regenerate(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.regenerateJoinCode(me, id);
  }

  @Delete(':id') remove(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(me, id);
  }
}
