import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { CertificatesService } from './certificates.service';

const templateSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['COURSE', 'PLANET']),
  html: z.string().min(20),
  layout: z.unknown().optional(),
  tenantId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().optional(),
});

@ApiTags('certificados')
@Controller()
export class CertificatesController {
  constructor(private readonly s: CertificatesService) {}

  @ApiBearerAuth() @Get('me/certificates')
  mine(@CurrentUser() u: AuthUser) {
    return this.s.listMine(u.id);
  }

  @ApiBearerAuth() @Post('me/certificates/claim/:courseId')
  claim(@CurrentUser() u: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.s.claim(u, courseId);
  }

  @ApiBearerAuth() @Get('certificates/:code/html') @Header('Content-Type', 'text/html; charset=utf-8')
  html(@CurrentUser() u: AuthUser, @Param('code') code: string) {
    return this.s.renderHtml(code, u);
  }

  @Public() @Get('certificates/verify/:code')
  verify(@Param('code') code: string) {
    return this.s.verify(code);
  }

  // ---- templates (MASTER)
  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Get('master/certificate-templates')
  templates(@Query('tenantId') tenantId?: string) {
    return this.s.listTemplates(tenantId);
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Post('master/certificate-templates')
  create(@Body(new ZodPipe(templateSchema)) dto: z.infer<typeof templateSchema>) {
    return this.s.saveTemplate(dto);
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Put('master/certificate-templates/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(templateSchema)) dto: z.infer<typeof templateSchema>) {
    return this.s.saveTemplate({ ...dto, id });
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Get('master/certificate-templates/:id/preview') @Header('Content-Type', 'text/html; charset=utf-8')
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.s.previewTemplate(id);
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Delete('master/certificate-templates/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.s.deleteTemplate(id);
  }

  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Post('master/certificates/:code/revoke')
  revoke(@Param('code') code: string) {
    return this.s.revoke(code);
  }
}
