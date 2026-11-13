import { Module } from '@nestjs/common';
import { MastersController } from './masters.controller';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { StudentsController } from './students.controller';
import { PlatformSettingsController } from './platform-settings.controller';

@Module({
  controllers: [MastersController, TenantsController, StudentsController, PlatformSettingsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class MasterModule {}
