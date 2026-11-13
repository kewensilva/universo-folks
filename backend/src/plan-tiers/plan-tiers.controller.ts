import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { PlanTiersService, tierCreate, tierUpdate } from './plan-tiers.service';

/** Menu Planos do MASTER: Básico, Premium, Premium Plus e as galáxias de cada um. */
@ApiTags('master / planos')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('master/plan-tiers')
export class PlanTiersController {
  constructor(private readonly s: PlanTiersService) {}

  @Get() list() {
    return this.s.list();
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(tierCreate)) dto: z.infer<typeof tierCreate>) {
    return this.s.create(u, dto);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(tierUpdate)) dto: z.infer<typeof tierUpdate>) {
    return this.s.update(u, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.remove(u, id);
  }
}
