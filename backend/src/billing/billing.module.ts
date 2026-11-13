import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RevenueCatService } from './revenuecat.service';
import { AdmobSsvService } from './admob-ssv.service';
import { AsaasService } from './asaas.service';

/**
 * Pagamentos:
 *  - App (iOS/Android): Premium pelas lojas via RevenueCat
 *  - Web: Premium pelo Asaas (Pix/boleto/cartão)
 *  - Empresas B2B/B2G: contrato recorrente no Asaas (boleto/Pix) ou lançamento manual
 */
@Module({
  controllers: [BillingController],
  providers: [BillingService, RevenueCatService, AdmobSsvService, AsaasService],
  exports: [BillingService, AsaasService],
})
export class BillingModule {}
