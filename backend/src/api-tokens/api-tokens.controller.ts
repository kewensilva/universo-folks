import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { ApiTokenService } from './api-token.service';

class CreateApiTokenDto {
  @IsString() @MinLength(3) name: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number;
}

@ApiTags('master / tokens de API (MCP)')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('master/api-tokens')
export class ApiTokensController {
  constructor(private readonly service: ApiTokenService) {}

  @Get() list(@CurrentUser() u: AuthUser) {
    return this.service.list(u.id);
  }

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateApiTokenDto) {
    return this.service.create(u, dto.name, dto.expiresInDays);
  }

  @Delete(':id') revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.revoke(u.id, id);
  }
}
