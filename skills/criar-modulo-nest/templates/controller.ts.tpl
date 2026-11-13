import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { __Name__Service } from './__name__.service';
import { Create__Name__Dto, Update__Name__Dto } from './__name__.dto';

@ApiTags('__route__')
@ApiBearerAuth()
@Roles(__roles__)
@Controller('__routePrefix__')
export class __Name__Controller {
  constructor(private readonly s: __Name__Service) {}

  @Get() list(@CurrentUser() u: AuthUser__tenantParam__) {
    return this.s.list(u__tenantArg__);
  }

  @Post() create(@CurrentUser() u: AuthUser__tenantParam__, @Body() dto: Create__Name__Dto) {
    return this.s.create(u__tenantArg__, dto);
  }

  @Patch(':id') update(@CurrentUser() u: AuthUser__tenantParam__, @Param('id', ParseUUIDPipe) id: string, @Body() dto: Update__Name__Dto) {
    return this.s.update(u__tenantArg__, id, dto);
  }

  @Delete(':id') remove(@CurrentUser() u: AuthUser__tenantParam__, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.remove(u__tenantArg__, id);
  }
}
