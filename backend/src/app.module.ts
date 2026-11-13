import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EmailModule } from './email/email.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.service';
import { PlatformSettingsModule } from './settings/platform-settings.service';
import { AccessModule } from './access/access.service';
import { EntitlementsModule } from './access/entitlements.service';
import { SeatsModule } from './access/seats.service';
import { ApiTokensModule } from './api-tokens/api-tokens.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { VimeoModule } from './vimeo/vimeo.service';
import { UsersModule } from './users/users.module';
import { MasterModule } from './master/master.module';
import { CompaniesModule } from './companies/companies.module';
import { ContentModule } from './content/content.module';
import { GamificationModule } from './gamification/gamification.module';
import { CertificatesModule } from './certificates/certificates.module';
import { LearningModule } from './learning/learning.module';
import { CatalogModule } from './catalog/catalog.module';
import { StorageModule } from './storage/storage.service';
import { BillingModule } from './billing/billing.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { InteractiveModule } from './interactive/interactive.module';
import { McpModule } from './mcp/mcp.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ContentImportModule } from './content-import/content-import.module';
import { PracticeCatalogModule } from './practice-catalog/practice-catalog.module';
import { PlanTiersModule } from './plan-tiers/plan-tiers.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // limite geral generoso; rotas de login/cadastro/senha têm limite próprio (@Throttle)
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }]),
    EmailModule,
    PrismaModule,
    AuditModule,
    PlatformSettingsModule,
    AccessModule,
    EntitlementsModule,
    SeatsModule,
    ApiTokensModule,
    AuthModule,
    VimeoModule,
    UsersModule,
    MasterModule,
    CompaniesModule,
    ContentModule,
    GamificationModule,
    CertificatesModule,
    LearningModule,
    CatalogModule,
    StorageModule,
    BillingModule,
    DashboardsModule,
    InteractiveModule,
    McpModule,
    ContentImportModule,
    PracticeCatalogModule,
    PlanTiersModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
