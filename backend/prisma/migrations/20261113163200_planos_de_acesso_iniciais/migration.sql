-- planos_de_acesso_iniciais
-- Planos de acesso iniciais (decisão do cliente, 2026-11-13). Só dados, idempotente.
--  Básico: quem não assina; só o conteúdo grátis.
--  Premium: Para a vida + Para o trabalho.
--  Premium Plus: todas as galáxias (inclusive as futuras).
INSERT INTO "plan_tiers" ("id", "code", "name", "description", "is_default", "includes_all_categories", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'basico', 'Básico', 'Somente os cursos e unidades gratuitos.', true, false, 0, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'premium', 'Premium', 'Conteúdo gratuito + galáxias Para a vida e Para o trabalho completas.', false, false, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'premium-plus', 'Premium Plus', 'Todas as galáxias completas: Para a vida, Para o trabalho e Para a escola.', false, true, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "plan_tier_categories" ("tier_id", "category_id")
SELECT t."id", c."id" FROM "plan_tiers" t JOIN "study_categories" c ON c."slug" IN ('para-a-vida', 'para-o-trabalho')
WHERE t."code" = 'premium'
ON CONFLICT DO NOTHING;

-- os preços Premium que já existem passam a liberar o plano Premium
UPDATE "plans" SET "tier_id" = (SELECT "id" FROM "plan_tiers" WHERE "code" = 'premium')
WHERE "code" IN ('b2c-premium-monthly', 'b2c-premium-yearly') AND "tier_id" IS NULL;
