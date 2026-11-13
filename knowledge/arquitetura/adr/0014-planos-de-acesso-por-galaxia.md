# ADR 0014 — Planos do aluno por galáxia: Básico, Premium e Premium Plus

> tags: adr, planos, menu planos, plano básico, premium, premium plus, galáxia, categoria, para a vida, para o trabalho, para a escola, assinatura, preço, acesso, bloqueio, requiredPlan | status: aceita | data: 2026-11-13

## Contexto
Até aqui o aluno (B2C) tinha só **grátis × Premium**: qualquer assinatura ativa liberava todo o conteúdo Premium. O cliente pediu um menu **Planos** no painel do MASTER com três planos, cada um liberando galáxias:
- **Básico:** somente os cursos gratuitos;
- **Premium:** os gratuitos + "Para o trabalho" + "Para a vida";
- **Premium Plus:** todas as galáxias ("Para a vida", "Para o trabalho", "Para a escola").

E o MASTER precisa poder **acrescentar galáxias** a cada plano.

## Decisão
- **Plano de acesso ≠ preço.**
  - `Plan` continua sendo o **preço** (mensal, anual, produtos das lojas, Asaas).
  - O novo `PlanTier` é o **plano de acesso**, e cada preço aponta para um (`plans.tier_id`).
  - Assim, "Premium Mensal" e "Premium Anual" liberam o mesmo Premium sem repetir as galáxias.
- **Tabelas:**
  - `plan_tiers`: `code`, nome, descrição, `is_default`, `includes_all_categories`, `is_active`, `sort_order`.
  - `plan_tier_categories`: as galáxias de cada plano.
- **Regra (ponto único em `AccessService.planCoverage`):**
  - O conteúdo **FREE** vale para todos.
  - O conteúdo **PREMIUM** de um planeta é liberado se a galáxia dele estiver nos planos do aluno. Esses planos são o plano padrão (de quem não assina) mais os planos de todas as assinaturas B2C ativas.
  - `includes_all_categories` libera todas as galáxias, inclusive as criadas depois. É o caso do Premium Plus.
  - Um preço B2C **sem plano** (`tier_id` nulo) libera tudo, como antes. Isso cobre o plano automático que a RevenueCat cria para um produto desconhecido. A tela Planos avisa quando isso acontece.
  - O plano exibido ao aluno é o mais alto (pela ordem). As galáxias são a **união** de todos os planos dele.
- **O que não muda:**
  - Benefícios de assinante (certificado, prática infinita, jam e ausência de anúncio) continuam valendo para qualquer assinatura paga (`isPremium`).
  - Empresa (B2B): acesso pelos planetas do contrato e `grantsPremiumAccess`. MASTER: vê tudo.
- **API:**
  - `GET/POST/PATCH/DELETE /master/plan-tiers`, só para o MASTER. Fica fora de `/master/content`, então o token do Claude não acessa.
  - O schema de preço ganhou `tierId`.
  - `/billing/plans` devolve o plano de acesso de cada preço, com as galáxias.
  - `/me/entitlements` ganhou `plan`, com as galáxias ou `"ALL"`.
  - Catálogo e trilha ganharam `requiredPlan`, o plano mais barato que libera o conteúdo.
- **Invariantes:**
  - Sempre há exatamente um plano padrão: marcar outro desmarca o atual, e não dá para desmarcar o único.
  - O plano padrão não pode ser excluído nem desativado.
  - Um plano com preços ligados não é excluído (409).
- **Dados iniciais:**
  - Uma migração só de dados cria os 3 planos e liga o Premium Mensal e o Anual ao Premium.
  - Num banco novo as galáxias ainda não existem quando as migrações rodam. Por isso o **seed** liga o Premium a Para a vida e Para o trabalho, mas só se o plano nunca foi editado.

## Consequências
- O preço do Premium Plus ainda precisa ser criado no Financeiro, com o produto da loja na RevenueCat, quando o cliente definir o valor.
- A tela de assinatura do app ainda não existe. Quando existir, ela usa `/billing/plans`, que já devolve os planos e as galáxias.
- Testes: `backend/test/e2e/planos-de-acesso.mjs` (35 verificações, em banco descartável).
