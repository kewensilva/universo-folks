import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { AuditService } from '../audit/audit.service';

@ApiTags('master / configurações gerais')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('master/settings')
export class PlatformSettingsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get() get() {
    return this.settings.all();
  }

  @Patch() async update(@CurrentUser() me: AuthUser, @Body() body: Record<string, unknown>) {
    const r = await this.settings.update(body);
    await this.audit.log(me, 'platform.settings', 'platform_settings', undefined, body);
    return r;
  }
}
