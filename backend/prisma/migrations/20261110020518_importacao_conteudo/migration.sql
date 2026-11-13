-- importacao_conteudo
-- CreateEnum
CREATE TYPE "ContentImportStatus" AS ENUM ('VALIDATED', 'INVALID', 'APPLYING', 'APPLIED', 'PARTIAL', 'FAILED', 'DISCARDED');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "source_import_id" UUID;

-- AlterTable
ALTER TABLE "planets" ADD COLUMN     "content_hash" TEXT,
ADD COLUMN     "source_import_id" UUID;

-- CreateTable
CREATE TABLE "content_imports" (
    "id" UUID NOT NULL,
    "label" TEXT,
    "filename" TEXT,
    "format" TEXT NOT NULL,
    "status" "ContentImportStatus" NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "raw_payload" TEXT NOT NULL,
    "normalized" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "plan" JSONB,
    "result" JSONB,
    "strategy" TEXT NOT NULL DEFAULT 'upsert',
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "warning_count" INTEGER NOT NULL DEFAULT 0,
    "via" TEXT NOT NULL DEFAULT 'api',
    "created_by_id" UUID NOT NULL,
    "applied_by_id" UUID,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_imports_payload_hash_idx" ON "content_imports"("payload_hash");

-- CreateIndex
CREATE INDEX "content_imports_status_created_at_idx" ON "content_imports"("status", "created_at");
