-- metodologias_de_som_e_microfone
-- Cursos de som (violão, canto): metodologia do microfone, orientação de som no "Ouvir e escolher"
-- e o modelo de trilha "Som e prática em cada unidade". Só dados, idempotente; não sobrescreve edições do MASTER.
INSERT INTO "methodologies" ("id", "code", "name", "description", "answer_formats", "guidance", "status", "is_system", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'play_or_sing_note', 'Tocar ou cantar a nota (microfone)',
   'O aluno toca no violão ou canta a nota pedida; o app escuta pelo microfone e mostra se está grave, agudo ou afinado.',
   ARRAY['SIMULATOR'],
   'Use type SIMULATOR com simulator {id: "mic_pitch", target: "E2" (ou targets: ["E2","A2"] para tocar/cantar em sequência), instrument: "violao" ou "voz"}. Nota em MIDI (60 = Dó central) ou nome ("A2", "C#4"). Violão confere a oitava exata; voz aceita qualquer oitava. Opcional: toleranceCents (padrão 35 violão / 50 voz), holdMs (tempo segurando afinado, padrão 700), reference ("pluck", "tone" ou "none"), timeLimitSec (padrão 30).',
   'ACTIVE', true, 140, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- "Ouvir e escolher" passa a aceitar notas sintetizadas e arquivo de áudio (só se a orientação ainda for a original)
UPDATE "methodologies"
SET "guidance" = 'Coloque o som em "audio": voz do aparelho {kind: "TTS", lang: "en-US", text}; notas/acordes sintetizados {kind: "NOTES", sequence: [["n",48],["n",55]]} (["n", nota] corda de violão, ["c", tônica, "m"] acorde, ["p", tônica, [0,4,5,3]] progressão, ["t", nota, segundos] tom puro, ["r", segundos] pausa); ou arquivo {kind: "URL", url: "https://..."}. O aluno pode ouvir de novo quantas vezes quiser.',
    "description" = 'Ouve o som (voz, notas, acordes ou um áudio) e escolhe a resposta certa.',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'listen_choose' AND "guidance" = 'Use audio {kind: "TTS", lang, text}.';

INSERT INTO "trail_templates" ("id", "code", "name", "description", "structure", "is_active", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'som-e-pratica', 'Som e prática em cada unidade', 'Sem vídeo: cada unidade com uma aula de som (notas, acordes ou áudio) e prática (de ouvido ou no microfone).',
   '{"unitSteps":[{"kind":"LESSON","min":1,"max":null},{"kind":"PRACTICE","min":1,"max":null}],"closingSteps":null,"closingTitle":null,"minUnits":null,"maxUnits":null,"exam":false,"methodologies":[]}', true, 40, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
