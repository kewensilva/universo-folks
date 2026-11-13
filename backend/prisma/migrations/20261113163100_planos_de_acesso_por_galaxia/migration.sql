-- planos_de_acesso_por_galaxia
-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "tier_id" UUID;

-- CreateTable
CREATE TABLE "plan_tiers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "includes_all_categories" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_tier_categories" (
    "tier_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "plan_tier_categories_pkey" PRIMARY KEY ("tier_id","category_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_tiers_code_key" ON "plan_tiers"("code");

-- CreateIndex
CREATE INDEX "plan_tier_categories_category_id_idx" ON "plan_tier_categories"("category_id");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "plan_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_tier_categories" ADD CONSTRAINT "plan_tier_categories_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "plan_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_tier_categories" ADD CONSTRAINT "plan_tier_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "study_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
