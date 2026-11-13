# ADR 0006 — Pagamentos: RevenueCat nas lojas, Asaas na web e para empresas

> tags: adr, pagamentos, asaas, revenuecat, premium, assinatura, boleto, pix, lojas | status: aceita | data: 2026-11-09

## Decisão
- **App (iOS/Android):** as lojas exigem compra *in-app* para conteúdo digital. O Premium vai pela RevenueCat (`app_user_id` = id do usuário), com webhook idempotente.
- **Web (B2C):** Asaas. O checkout cria o cliente (com CPF) e a assinatura, e devolve a fatura (Pix/boleto/cartão). O Premium só libera com `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`.
- **Empresas (B2B/B2G):** contrato recorrente no Asaas (boleto/Pix, com CNPJ obrigatório) ou lançamento manual pelo MASTER. O valor do contrato vai em `Subscription.amountCents` (o MRR usa esse valor).
- Assinatura `PENDING` não libera nada. Boleto vencido deixa a assinatura em `PAST_DUE` e gera alerta.

## Em aberto
Suspensão automática de empresa inadimplente após N dias (perguntar ao cliente).
