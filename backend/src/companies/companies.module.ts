import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyInsightsService } from './insights.service';
import { MyCompanyController } from './my-company.controller';

@Module({ controllers: [CompaniesController, MyCompanyController], providers: [CompaniesService, CompanyInsightsService], exports: [CompaniesService, CompanyInsightsService] })
export class CompaniesModule {}
