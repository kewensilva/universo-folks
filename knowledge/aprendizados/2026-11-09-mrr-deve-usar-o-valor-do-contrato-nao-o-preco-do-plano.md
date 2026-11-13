# MRR deve usar o valor do contrato, não o preço do plano

> tags: aprendizado, financeiro, mrr, contrato, assinatura, b2b | origem: teste | data: 2026-11-09

## Regra
Valor cobrado pertence à assinatura; o plano é só referência

## Contexto
Contratos B2B negociados (Asaas ou manual) com valor diferente do preço do plano

## O que estava errado
Calcular MRR com plan.priceCents (que pode ser 0 enquanto os preços não foram definidos)

## O que é correto
Gravar Subscription.amountCents com o valor cobrado e calcular MRR com amountCents ?? plan.priceCents
