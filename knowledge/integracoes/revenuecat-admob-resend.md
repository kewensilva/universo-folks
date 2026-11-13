# RevenueCat, AdMob e Resend

> tags: revenuecat, admob, anúncio, ssv, resend, e-mail, lojas, premium app

## RevenueCat (Premium nas lojas)
- No app: `Purchases.logIn(<id do usuário>)` → `app_user_id`.
- O webhook `POST /api/billing/webhooks/revenuecat` exige o header `Authorization` igual a `REVENUECAT_WEBHOOK_AUTH`. A comparação é em tempo constante.
- `INITIAL_PURCHASE`/`RENEWAL`/... → ACTIVE (TRIALING no período de teste); `CANCELLATION` → `cancelAtPeriodEnd` (reembolso pelo suporte → CANCELED); `EXPIRATION` → EXPIRED; `BILLING_ISSUE` → PAST_DUE.
- Produto sem plano vinculado cria um plano B2C inativo `rc-<product>`, para não perder o Premium.
- Eventos SANDBOX são ignorados em produção, a menos que `REVENUECAT_ACCEPT_SANDBOX=true`.

## AdMob SSV (anúncio com recompensa)
- O Google chama `GET /api/billing/webhooks/admob/ssv?...&signature=&key_id=`.
- A assinatura é ECDSA/SHA-256 sobre a query string até antes de `&signature=`. As chaves públicas vêm de `gstatic.com/admob/reward/verifier-keys.json` (cache de 24h).
- `user_id` = id do usuário; `custom_data` = `infinite` ou `jam`. Menores de idade não recebem a recompensa. Idempotência por `transaction_id`.

## Resend (e-mail transacional)
- `RESEND_API_KEY`. Sem a chave, o e-mail aparece só no log (útil nos testes para capturar os tokens).
- Templates: convite (`/convite?token=`, 14 dias), nova senha (`/nova-senha?token=`, 1 hora) e lembrete de trilhas.
