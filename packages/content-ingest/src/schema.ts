import { z } from 'zod';

/**
 * folks.content/v1 — formato CANÔNICO de conteúdo do Universo Folks.
 * Todo formato de entrada (JSON do Claude em português/inglês, formato do MCP,
 * Markdown do chat) é convertido para isto antes de validar e gravar.
 */
export const SCHEMA_VERSION = 'folks.content/v1';

export const KNOWN_CATEGORIES = ['para-a-vida', 'para-o-trabalho', 'para-a-escola'] as const;
/** Geradores de exercício existentes no app (protótipo). Ids fora desta lista exigem trabalho no app. */
export const KNOWN_GENERATORS = ['t1', 't1m', 't2', 't2p', 't3', 't3m', 'tdv', 'tvf', 'p1', 'p1b', 'p2', 'p2b', 'p3', 'p3b', 'p4', 'p4b', 'pitch', 'pitch2', 'qual', 'qual2', 'deg', 'deg2', 'prog', 'prog2', 'mix', 'rev2', 'rev3', 'rev4',
  // som e microfone (treino de ouvido, afinação e canto; ver @folks/shared ear-training)
  'pitch_tone', 'tune', 'sing', 'sing_steps', 'ear', 'voice', 'guitar'];
/** Simuladores que o app sabe rodar (questão SIMULATOR). mic_pitch = tocar/cantar a nota no microfone. */
export const KNOWN_SIMULATORS = ['mic_pitch'];

const tier = z.enum(['FREE', 'PREMIUM']);
const status = z.enum(['DRAFT', 'COMING_SOON', 'PUBLISHED', 'ARCHIVED']);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido (use minúsculas, números e hífen)');

export const optionSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean(),
  feedback: z.string().optional(),
});

/** Tipos de questão. Os de escolha usam `options`; os demais têm campos próprios (ver questions.ts). */
export const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'NUMBER', 'ORDER', 'BUILD_SENTENCE', 'MATCH_PAIRS', 'CLASSIFY', 'SIMULATOR'] as const;
export const CHOICE_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'] as const;

/** Metodologias (formatos de questão/gerador) que o app já sabe exibir — catálogo "formats" do cliente. */
export const KNOWN_METHODOLOGIES = [
  'adjust_simulator', 'build_sentence', 'calc_number', 'choose_action', 'classify', 'compare_images', 'contraction', 'diagnose_image',
  'dialog_choice', 'fill_gap', 'identify_by_function', 'identify_on_image', 'listen_choose', 'match_pairs', 'multiple_choice',
  'order_steps', 'situation_choice', 'true_false', 'play_or_sing_note',
];
/** Widgets interativos das telas de aula que o app já sabe exibir. */
export const KNOWN_WIDGETS = ['EXPLORE', 'STEPS', 'FLIP', 'CHAT', 'REFLECT', 'SORTG', 'SIM', 'MODES', 'PRON', 'PHRASE'];

const looseRecord = z.record(z.string(), z.unknown());
/** imagem da questão: { kind: "SVG", svg } (ou outro kind com url) */
const visualSchema = z.looseObject({ kind: z.string() });
/** nota: MIDI (60 = Dó central) ou nome ("E2", "C#4", "Bb3") */
const noteRef = z.union([z.number().int().min(24).max(96), z.string().regex(/^[A-Ga-g][#b♯♭]?-?\d$/, 'nota: use MIDI (ex.: 40) ou nome (ex.: "E2", "C#4")')]);
/**
 * Som sintetizado no aparelho (sem arquivo), formato do protótipo:
 * ["n", nota] corda de violão · ["c", tônica, ""|"m"|"dim"] acorde · ["p", tônica, [graus 0..6]] progressão ·
 * ["t", nota, segundos?] tom puro · ["r", segundos] pausa
 */
export const soundEventSchema = z.union([
  z.tuple([z.literal('n'), noteRef]),
  z.tuple([z.literal('c'), noteRef, z.enum(['', 'm', 'dim']).optional()]),
  z.tuple([z.literal('p'), noteRef, z.array(z.number().int().min(0).max(6)).min(1).max(8)]),
  z.tuple([z.literal('t'), noteRef, z.number().positive().max(10).optional()]),
  z.tuple([z.literal('r'), z.number().min(0).max(10)]),
]);
export const soundSequenceSchema = z.array(soundEventSchema).min(1).max(64);
const httpUrl = z.string().url().regex(/^https?:\/\//, 'use um link http(s)');
/** som da questão: voz do aparelho (TTS), notas sintetizadas ou arquivo de áudio */
const audioSchema = z.union([
  z.object({ kind: z.literal('TTS'), lang: z.string().min(2), text: z.string().min(1) }),
  z.object({ kind: z.literal('NOTES'), sequence: soundSequenceSchema, label: z.string().optional() }),
  z.object({ kind: z.literal('URL'), url: httpUrl, label: z.string().optional() }),
]);
/** botão "ouvir" numa tela de aula: notas sintetizadas (sequence) OU arquivo (url) */
export const audioDemoSchema = z
  .object({ label: z.string().min(1), caption: z.string().optional(), sequence: soundSequenceSchema.optional(), url: httpUrl.optional() })
  .refine((d) => !!d.sequence !== !!d.url, 'cada som da tela precisa de "sequence" (notas) OU "url" (arquivo)');
const speakSchema = z.object({ lang: z.string().min(2), text: z.string().min(1) });

const questionBase = {
  prompt: z.string().min(3),
  explanation: z.string().optional(),
  /** formato/gerador de onde a questão saiu (ex.: "calc_number") */
  methodology: z.string().optional(),
  timeLimitMs: z.number().int().positive().optional(),
  visual: visualSchema.optional(),
  visualAfterAnswer: visualSchema.optional(),
  audio: audioSchema.optional(),
  speakAfterAnswer: speakSchema.optional(),
};

export const choiceQuestionSchema = z.object({ ...questionBase, type: z.enum(CHOICE_TYPES), options: z.array(optionSchema).min(2).max(8) });
export const numberQuestionSchema = z.object({ ...questionBase, type: z.literal('NUMBER'), answer: z.number().finite(), tolerance: z.number().min(0).optional() });
export const orderQuestionSchema = z.object({ ...questionBase, type: z.literal('ORDER'), pieces: z.array(z.string().min(1)).min(2).max(12), answer: z.array(z.string().min(1)).min(2).max(12) });
export const buildSentenceQuestionSchema = z.object({ ...questionBase, type: z.literal('BUILD_SENTENCE'), pieces: z.array(z.string().min(1)).min(2).max(16), answer: z.array(z.string().min(1)).min(1).max(16) });
export const matchPairsQuestionSchema = z.object({ ...questionBase, type: z.literal('MATCH_PAIRS'), pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2).max(8) });
export const classifyQuestionSchema = z.object({
  ...questionBase,
  type: z.literal('CLASSIFY'),
  groups: z.array(z.string().min(1)).min(2).max(6),
  items: z.array(z.object({ text: z.string().min(1), group: z.number().int().min(0), feedback: z.string().optional() })).min(2).max(12),
});
export const simulatorQuestionSchema = z.object({ ...questionBase, type: z.literal('SIMULATOR'), simulator: z.looseObject({ id: z.string().min(1) }), note: z.string().optional() });

export const questionSchema = z.discriminatedUnion('type', [
  choiceQuestionSchema,
  numberQuestionSchema,
  orderQuestionSchema,
  buildSentenceQuestionSchema,
  matchPairsQuestionSchema,
  classifyQuestionSchema,
  simulatorQuestionSchema,
]);

/** Widget interativo da tela: { type, ...dados do widget } (formato livre por tipo; ver catálogo de formatos). */
export const widgetSchema = z.looseObject({ type: z.string().min(2) });

export const slideSchema = z.object({
  heading: z.string(),
  text: z.string(),
  /** texto já dividido: a tela mostra uma parte por vez */
  textParts: z.array(z.string()).optional(),
  visualHtml: z.string().nullable().optional(),
  widget: widgetSchema.optional(),
  /** "confere rapidinho" depois da tela */
  check: questionSchema.optional(),
  /** sons da tela (aula de som: em vez de vídeo, o aluno ouve notas, acordes ou um áudio) */
  audioDemos: z.array(audioDemoSchema).max(12).optional(),
});

/** Gerador de questões com os dados que ele usa (prática infinita). */
export const generatorSpecSchema = z.object({ methodology: z.string().min(2), data: looseRecord.optional() });

export const lessonSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LESSON'), title: z.string().min(2), slides: z.array(slideSchema).min(1) }),
  z.object({
    type: z.literal('VIDEO'),
    title: z.string().min(2),
    videoTitle: z.string().optional(),
    description: z.string().optional(),
    /** null = vídeo ainda não definido (será ligado depois, ex.: pela pasta do Vimeo) */
    vimeoUrl: z.string().nullable(),
    durationSeconds: z.number().int().positive().optional(),
    transcript: z.string().optional(),
  }),
  z.object({
    type: z.literal('PRACTICE'),
    title: z.string().min(2),
    passingPct: z.number().int().min(0).max(100).optional(),
    isReview: z.boolean().optional(),
    /** quantas questões por rodada (sorteadas do banco) */
    questionsPerRound: z.number().int().min(1).max(100).optional(),
    questions: z.array(questionSchema).min(1),
    /** geradores para a prática infinita; `questions` é o banco já gerado */
    generators: z.array(generatorSpecSchema).optional(),
  }),
  z.object({ type: z.literal('GENERATED_PRACTICE'), title: z.string().min(2), generators: z.array(z.string()).min(1), questionCount: z.number().int().min(1).max(100), isReview: z.boolean().optional() }),
  z.object({ type: z.literal('INTERACTIVE'), title: z.string().min(2), interactivePackageId: z.string().uuid() }),
]);

export const unitSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  accessTier: tier.nullable().optional(),
  /** cor da unidade na trilha */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  lessons: z.array(lessonSchema).min(1),
});

export const examSchema = z.object({
  title: z.string().min(2),
  questionSource: z.enum(['BANK', 'GENERATED']),
  questions: z.array(questionSchema).optional(),
  generators: z.array(z.string()).optional(),
  questionCount: z.number().int().min(1).optional(),
  passingScore: z.number().int().min(0).max(100).optional(),
  timeLimitMinutes: z.number().int().min(1).optional(),
});

export const badgeSchema = z.object({ icon: z.string(), name: z.string(), text: z.string() });

export const courseSchema = z.object({
  /** id estável do curso (vira Course.code). Reimportar com a mesma key atualiza em vez de duplicar. */
  key: z.string().min(2),
  slug,
  title: z.string().min(2),
  description: z.string().optional(),
  status: status.optional(),
  accessTier: tier.nullable().optional(),
  hasCertificate: z.boolean(),
  estimatedMinutes: z.number().int().positive().optional(),
  icon: z.string().optional(),
  /** linha curta do card do curso (ex.: "4 unidades · simuladores · do zero") */
  meta: z.string().optional(),
  badge: badgeSchema.optional(),
  drillLabel: z.string().optional(),
  /** código do modelo de trilha (menu Personalização de trilha) que o curso segue; a importação confere a estrutura */
  trailTemplate: z.string().optional(),
  /** vazio só para curso "Em breve" (COMING_SOON) — regra checada na validação */
  units: z.array(unitSchema),
  exam: examSchema.nullable().optional(),
});

export const planetSchema = z.object({
  /** id estável do planeta (= slug por padrão) */
  key: z.string().min(2),
  slug,
  name: z.string().min(2),
  shortName: z.string().optional(),
  category: slug,
  description: z.string().optional(),
  status: status.optional(),
  accessTier: tier,
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  visual: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  /** pasta do Vimeo do planeta (id, link .../folder/<id> ou /projects/<id>): base do quadro "Organizar vídeos" */
  vimeoFolder: z.string().optional(),
  courses: z.array(courseSchema),
});

export const bundleSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  source: z.object({ tool: z.string().optional(), notes: z.string().optional(), generatedAt: z.string().optional() }).optional(),
  planets: z.array(planetSchema).min(1),
});

export type Option = z.infer<typeof optionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type ChoiceQuestion = z.infer<typeof choiceQuestionSchema>;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type Slide = z.infer<typeof slideSchema>;
export type GeneratorSpec = z.infer<typeof generatorSpecSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Unit = z.infer<typeof unitSchema>;
export type Exam = z.infer<typeof examSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Planet = z.infer<typeof planetSchema>;
export type Bundle = z.infer<typeof bundleSchema>;

/** JSON Schema do formato canônico (para documentação e para o prompt de conversão). */
export function jsonSchema(): unknown {
  return z.toJSONSchema(bundleSchema, { target: 'draft-2020-12' } as any);
}
