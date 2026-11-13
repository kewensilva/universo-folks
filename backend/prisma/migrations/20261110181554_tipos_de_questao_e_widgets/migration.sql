-- tipos_de_questao_e_widgets
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'NUMBER';
ALTER TYPE "QuestionType" ADD VALUE 'ORDER';
ALTER TYPE "QuestionType" ADD VALUE 'BUILD_SENTENCE';
ALTER TYPE "QuestionType" ADD VALUE 'MATCH_PAIRS';
ALTER TYPE "QuestionType" ADD VALUE 'CLASSIFY';
ALTER TYPE "QuestionType" ADD VALUE 'SIMULATOR';

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "generator_specs" JSONB;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "data" JSONB,
ADD COLUMN     "media" JSONB,
ADD COLUMN     "methodology" TEXT,
ADD COLUMN     "time_limit_ms" INTEGER;
