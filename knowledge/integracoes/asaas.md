# Integração Asaas

> tags: asaas, pagamento, pix, boleto, cartão, assinatura, webhook, b2b, contrato

- **Configuração:**
  - `ASAAS_API_KEY`, enviada no header `access_token`. Também é obrigatório enviar um `User-Agent`.
  - `ASAAS_API_URL`: sandbox `https://api-sandbox.asaas.com/v3`, produção `https://api.asaas.com/v3`.
  - `ASAAS_WEBHOOK_TOKEN`: chega no header `asaas-access-token`.
- **Cliente:** `POST /customers` com `cpfCnpj` obrigatório para cobrar. O id fica em `User.asaasCustomerId` ou `Tenant.asaasCustomerId`.
- **Assinatura:**
  - `POST /subscriptions {customer, billingType: UNDEFINED|PIX|BOLETO|CREDIT_CARD, value (reais), nextDueDate, cycle: MONTHLY|QUARTERLY|YEARLY, externalReference: "sub:<id local>"}`.
  - A primeira fatura vem de `GET /subscriptions/{id}/payments` → `invoiceUrl`.
  - Plano `ONE_TIME` usa `POST /payments`.
- **Webhook** (`POST /api/billing/webhooks/asaas`):
  - `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` → ACTIVE, e o fim do período passa a `dueDate + intervalo`;
  - `PAYMENT_OVERDUE` → PAST_DUE;
  - `PAYMENT_REFUNDED` (B2C) → CANCELED;
  - `SUBSCRIPTION_DELETED`/`INACTIVATED` → cancelamento.
  - Idempotência pelo `id` do evento.
- **Cancelar:** `DELETE /subscriptions/{id}`.
- **Status:** conta em análise pelo Asaas. O código foi validado só contra uma API simulada; falta testar no sandbox.
