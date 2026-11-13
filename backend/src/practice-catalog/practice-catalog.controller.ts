import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { PracticeCatalogService, methodologyCreate, methodologyUpdate, templateCreate, templateUpdate } from './practice-catalog.service';

type Infer<T extends z.ZodType> = z.infer<T>;

/**
 * Menus "Metodologia" e "Personalização de trilha" do MASTER (ADR 0013).
 * Fora de /master/content de propósito: o token do Claude não edita o catálogo (ADR 0007).
 */
@ApiTags('master / catálogo de práticas')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('master')
export class PracticeCatalogController {
  constructor(private readonly s: PracticeCatalogService) {}

  @Get('methodologies') methodologies() {
    return this.s.listMethodologies();
  }
  @Post('methodologies') createMethodology(@CurrentUser() u: AuthUser, @Body(new ZodPipe(methodologyCreate)) dto: Infer<typeof methodologyCreate>) {
    return this.s.createMethodology(u, dto);
  }
  @Patch('methodologies/:id') updateMethodology(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(methodologyUpdate)) dto: Infer<typeof methodologyUpdate>) {
    return this.s.updateMethodology(u, id, dto);
  }
  @Delete('methodologies/:id') deleteMethodology(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteMethodology(u, id);
  }

  @Get('trail-templates') templates() {
    return this.s.listTemplates();
  }
  @Post('trail-templates') createTemplate(@CurrentUser() u: AuthUser, @Body(new ZodPipe(templateCreate)) dto: Infer<typeof templateCreate>) {
    return this.s.createTemplate(u, dto);
  }
  @Patch('trail-templates/:id') updateTemplate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(templateUpdate)) dto: Infer<typeof templateUpdate>) {
    return this.s.updateTemplate(u, id, dto);
  }
  @Delete('trail-templates/:id') deleteTemplate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteTemplate(u, id);
  }
  /** O curso segue o modelo de trilha dele? */
  @Get('trail-templates/check/:courseId') check(@Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.s.checkCourse(courseId);
  }
}
