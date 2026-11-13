-- Asaas, assinatura pendente, miniatura do Vimeo e regra "uma pessoa = uma empresa"

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'ASAAS';

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "thumbnail_url" TEXT,
ADD COLUMN     "vimeo_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "one_company_key" UUID;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "asaas_customer_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "asaas_customer_id" TEXT;

-- Regra "uma empresa por pessoa": se alguém já estiver em mais de uma empresa,
-- mantém o vínculo mais antigo e desativa os demais.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
  FROM "memberships" WHERE status <> 'DISABLED'
)
UPDATE "memberships" m SET status = 'DISABLED'
FROM ranked r WHERE m.id = r.id AND r.rn > 1;

UPDATE "memberships" SET one_company_key = user_id WHERE status <> 'DISABLED';

-- CreateIndex
CREATE UNIQUE INDEX "memberships_one_company_key_key" ON "memberships"("one_company_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_asaas_customer_id_key" ON "tenants"("asaas_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_asaas_customer_id_key" ON "users"("asaas_customer_id");
