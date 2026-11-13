import { Module } from '@nestjs/common';
import { PlanTiersController } from './plan-tiers.controller';
import { PlanTiersService } from './plan-tiers.service';

@Module({ controllers: [PlanTiersController], providers: [PlanTiersService] })
export class PlanTiersModule {}
