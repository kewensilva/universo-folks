-- catalogo_metodologias_e_modelos_de_trilha
-- CreateEnum
CREATE TYPE "MethodologyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'COMING_SOON');

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "trail_template_id" UUID;

-- CreateTable
CREATE TABLE "methodologies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "answer_formats" TEXT[],
    "guidance" TEXT,
    "status" "MethodologyStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "default_time_limit_ms" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "methodologies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trail_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "structure" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trail_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "methodologies_code_key" ON "methodologies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "trail_templates_code_key" ON "trail_templates"("code");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_trail_template_id_fkey" FOREIGN KEY ("trail_template_id") REFERENCES "trail_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catálogo inicial (ADR 0013): metodologias do material do cliente (folks-cursos.json "formats") + captura "em breve".
-- Idempotente: não sobrescreve o que o MASTER já editou.
INSERT INTO "methodologies" ("id", "code", "name", "description", "answer_formats", "guidance", "status", "is_system", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'true_false', 'Mito ou verdade', 'Uma afirmação; o aluno diz se é mito ou verdade, com explicação.', ARRAY['TRUE_FALSE'], 'Afirmação curta e verificável. Duas opções ("Mito" e "Verdade"); a errada traz o porquê no feedback.', 'ACTIVE', true, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'multiple_choice', 'Múltipla escolha', 'Uma pergunta com alternativas; uma ou mais certas.', ARRAY['SINGLE_CHOICE','MULTIPLE_CHOICE'], '3 ou 4 alternativas plausíveis; cada errada explica o porquê no feedback.', 'ACTIVE', true, 20, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'situation_choice', 'Situação do dia a dia', 'Uma situação real com 3 ou 4 atitudes; cada opção tem o porquê.', ARRAY['SINGLE_CHOICE'], 'Descreva a situação no enunciado; as opções são atitudes concretas.', 'ACTIVE', true, 30, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'dialog_choice', 'Resposta no diálogo', 'Mostra o contexto e uma fala; o aluno escolhe a melhor resposta entre 3.', ARRAY['SINGLE_CHOICE'], 'Use visual HTML de diálogo (dlgq com dlgctx e dlgb them) para o contexto e a fala.', 'ACTIVE', true, 40, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'choose_action', 'Escolher a atitude', 'Mostra a situação e o aluno escolhe a atitude certa, conforme a regra.', ARRAY['SINGLE_CHOICE'], NULL, 'ACTIVE', true, 50, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'classify', 'Classificar', 'Classificar uma frase ou item em um dos grupos (ex.: rótulo ou comportamento).', ARRAY['CLASSIFY','SINGLE_CHOICE'], 'Vários itens: tipo CLASSIFY. Uma frase por vez: SINGLE_CHOICE com os grupos como opções.', 'ACTIVE', true, 60, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'order_steps', 'Ordenar passos', 'O aluno toca nos passos na ordem certa; o erro aponta o primeiro fora de ordem.', ARRAY['ORDER'], NULL, 'ACTIVE', true, 70, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'build_sentence', 'Montar frase', 'Montar a frase com blocos de palavras (pode ter 1 palavra intrusa).', ARRAY['BUILD_SENTENCE'], NULL, 'ACTIVE', true, 80, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'match_pairs', 'Ligar pares', 'Toca à esquerda e depois o par à direita.', ARRAY['MATCH_PAIRS'], NULL, 'ACTIVE', true, 90, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'calc_number', 'Cálculo', 'Conta com valores; o aluno digita o resultado no teclado numérico.', ARRAY['NUMBER'], 'Informe answer e, se fizer sentido, tolerance.', 'ACTIVE', true, 100, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'fill_gap', 'Completar a lacuna', 'Completar a lacuna da frase escolhendo uma opção.', ARRAY['SINGLE_CHOICE'], 'Use visual HTML de lacuna (gapln com gapb).', 'ACTIVE', true, 110, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'contraction', 'Forma contraída', 'Escolher a forma contraída correta.', ARRAY['SINGLE_CHOICE'], NULL, 'ACTIVE', true, 120, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'listen_choose', 'Ouvir e escolher', 'Ouve o áudio e escolhe a resposta certa.', ARRAY['SINGLE_CHOICE'], 'Use audio {kind: "TTS", lang, text}.', 'ACTIVE', true, 130, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'identify_on_image', 'Identificar na imagem', 'Imagem com uma parte destacada; o aluno escolhe o nome.', ARRAY['SINGLE_CHOICE'], 'Use visual SVG.', 'ACTIVE', true, 140, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'identify_by_function', 'Identificar pela função', 'Descreve a função; o aluno escolhe qual parte é.', ARRAY['SINGLE_CHOICE'], NULL, 'ACTIVE', true, 150, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'compare_images', 'Comparar imagens', 'Duas imagens (A e B); o aluno escolhe qual atende ao pedido.', ARRAY['SINGLE_CHOICE'], 'Use visual SVG com as duas imagens.', 'ACTIVE', true, 160, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'diagnose_image', 'Diagnosticar pela imagem', 'Imagem com um problema; o aluno escolhe a causa.', ARRAY['SINGLE_CHOICE'], 'Use visual SVG.', 'ACTIVE', true, 170, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'adjust_simulator', 'Desafio no simulador', 'O aluno mexe nos sliders até atingir a meta.', ARRAY['SIMULATOR'], 'Só para simuladores que já existem no app.', 'ACTIVE', true, 180, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'voice_simulation', 'Simulação por voz (microfone)', 'O aluno responde falando ao microfone numa situação simulada.', ARRAY['VOICE'], NULL, 'COMING_SOON', true, 900, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'photo_capture', 'Foto (câmera)', 'O aluno tira uma foto como resposta da prática.', ARRAY['PHOTO'], NULL, 'COMING_SOON', true, 910, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'video_capture', 'Vídeo (câmera)', 'O aluno grava um vídeo como resposta da prática.', ARRAY['VIDEO'], NULL, 'COMING_SOON', true, 920, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Modelos de trilha de exemplo (os três casos pedidos pelo cliente). O MASTER edita, desliga ou cria outros.
INSERT INTO "trail_templates" ("id", "code", "name", "description", "structure", "is_active", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'video-e-pratica', 'Vídeo e prática em cada unidade', 'Cada unidade: vídeo(s), aula em telas opcional e prática.',
   '{"unitSteps":[{"kind":"VIDEO","min":1,"max":null},{"kind":"LESSON","min":0,"max":null},{"kind":"PRACTICE","min":1,"max":null}],"closingSteps":null,"closingTitle":null,"minUnits":null,"maxUnits":null,"exam":true,"methodologies":[]}', true, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'videos-e-pratica-no-fim', 'Vídeos nas unidades e prática no fim', 'Cada unidade só com vídeo(s); uma unidade final com a prática.',
   '{"unitSteps":[{"kind":"VIDEO","min":1,"max":null}],"closingSteps":[{"kind":"PRACTICE","min":1,"max":null}],"closingTitle":"Prática final","minUnits":null,"maxUnits":null,"exam":true,"methodologies":[]}', true, 20, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'so-pratica', 'Só prática', 'Sem vídeo: cada unidade com prática (e aula em telas opcional antes).',
   '{"unitSteps":[{"kind":"LESSON","min":0,"max":null},{"kind":"PRACTICE","min":1,"max":null}],"closingSteps":null,"closingTitle":null,"minUnits":null,"maxUnits":null,"exam":false,"methodologies":[]}', true, 30, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
