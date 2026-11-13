import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CompaniesModule } from '../companies/companies.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({ imports: [CatalogModule, CompaniesModule], controllers: [DashboardsController], providers: [DashboardsService], exports: [DashboardsService] })
export class DashboardsModule {}
