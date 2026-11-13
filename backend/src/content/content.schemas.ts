import { z } from 'zod';
import { questionSchema as fullQuestionSchema } from '@folks/content-ingest';

/**
 * Schemas do conteúdo. São a FONTE ÚNICA de validação usada tanto pela API REST
 * do MASTER quanto pelas tools do servidor MCP (Claude).
 */

export const contentStatus = z.enum(['DRAFT', 'COMING_SOON', 'PUBLISHED', 'ARCHIVED']);
export const accessTier = z.enum(['FREE', 'PREMIUM']);
export const questionType = z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']);
export const questionSource = z.enum(['BANK', 'GENERATED']);

/** Visual do planeta no protótipo: cores, anel, ícone, ícones em órbita e figurino do astronauta. */
export const planetVisual = z
  .object({
    colors: z.array(z.string()).optional(),
    ring: z.string().nullable().optional(),
    icon: z.string().optional(),
    orbitIcons: z.array(z.string()).optional(),
    look: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

/** Insígnia ao concluir o curso. */
export const badgeSchema = z.object({ icon: z.string(), name: z.string().min(2), text: z.string() });

/** Tela de uma aula. */
export const slideSchema = z
  .object({
    heading: z.string(),
    text: z.string(),
    visualHtml: z.string().nullable().optional(),
    audioDemos: z.array(z.unknown()).nullable().optional(),
  })
  .passthrough();
export const lessonContent = z.object({ slides: z.array(slideSchema).min(1), generators: z.array(z.string()).optional() }).passthrough();

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug: minúsculas, números e hífen');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor no formato #RRGGBB');

// ----------------------------------------------------------------- questões
export const optionSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean().default(false),
  feedback: z.string().optional(),
});

/**
 * Questão criada pelo painel ou pelo Claude (MCP): o formato completo do folks.content/v1 (escolha, número,
 * ordenar, ligar pares, classificar, SIMULATOR — inclusive microfone "mic_pitch" — e som em "audio"),
 * mais mediaUrl e points. Sem "type" vale escolha única (formato antigo).
 */
export const questionSchema = z
  .preprocess(
    (v) => (v && typeof v === 'object' && !Array.isArray(v) && (v as Record<string, unknown>).type === undefined ? { ...(v as object), type: 'SINGLE_CHOICE' } : v),
    fullQuestionSchema,
  )
  .and(z.object({ mediaUrl: z.string().optional(), points: z.number().int().min(1).default(1) }))
  .superRefine((q, ctx) => {
    if (q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE') {
      const correct = q.options.filter((o) => o.isCorrect).length;
      if (correct === 0) ctx.addIssue({ code: 'custom', message: 'A questão precisa de ao menos uma alternativa correta', path: ['options'] });
      if (q.type !== 'MULTIPLE_CHOICE' && correct > 1) ctx.addIssue({ code: 'custom', message: 'Questão de escolha única com mais de uma correta', path: ['options'] });
      if (q.type === 'TRUE_FALSE' && q.options.length !== 2) ctx.addIssue({ code: 'custom', message: 'Verdadeiro/Falso deve ter 2 alternativas', path: ['options'] });
    }
    if (q.type === 'SIMULATOR' && q.simulator.id === 'mic_pitch') {
      const raw = q.simulator.targets ?? q.simulator.target;
      const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
      const ok = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 28 && n <= 96) || (typeof n === 'string' && /^[A-Ga-g][#b♯♭]?-?\d$/.test(n.trim()));
      if (!list.length || list.length > 12 || !list.every(ok)) ctx.addIssue({ code: 'custom', message: 'Microfone (mic_pitch): informe "target" ou "targets" com notas válidas (ex.: "A2" ou 45)', path: ['simulator'] });
    }
  });

// ------------------------------------------------------------------ CRUD
export const categoryCreate = z.object({
  name: z.string().min(2),
  slug: slug.optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export const categoryUpdate = categoryCreate.partial();

export const planetCreate = z.object({
  categoryId: z.string().uuid().optional(),
  /** alternativa a categoryId - ex.: "para-o-trabalho" */
  categorySlug: z.string().optional(),
  name: z.string().min(2),
  slug: slug.optional(),
  description: z.string().optional(),
  themeColor: color.optional(),
  imageUrl: z.string().optional(),
  mascotUrl: z.string().optional(),
  status: contentStatus.optional(),
  accessTier: accessTier.optional(),
  availableB2C: z.boolean().optional(),
  availableB2B: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  vimeoFolderUri: z.string().optional(),
  certTemplateId: z.string().uuid().nullable().optional(),
  shortName: z.string().nullable().optional(),
  visual: planetVisual.nullable().optional(),
});
export const planetUpdate = planetCreate.partial();

export const courseCreate = z.object({
  planetId: z.string().uuid(),
  title: z.string().min(2),
  slug: slug.optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  status: contentStatus.optional(),
  accessTier: accessTier.nullable().optional(),
  sortOrder: z.number().int().optional(),
  estimatedMinutes: z.number().int().min(1).optional(),
  hasCertificate: z.boolean().optional(),
  certTemplateId: z.string().uuid().nullable().optional(),
  code: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  meta: z.string().nullable().optional(),
  drillLabel: z.string().nullable().optional(),
  badge: badgeSchema.nullable().optional(),
  gameId: z.string().nullable().optional(),
  gameUrl: z.string().nullable().optional(),
  gameConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  /** modelo de trilha que o curso segue (ADR 0013) */
  trailTemplateId: z.string().uuid().nullable().optional(),
});
export const courseUpdate = courseCreate.omit({ planetId: true }).partial();

export const unitCreate = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(2),
  description: z.string().optional(),
  themeColor: color.optional(),
  sortOrder: z.number().int().optional(),
  /** null = herda do curso; FREE/PREMIUM libera ou tranca a unidade no plano grátis */
  accessTier: accessTier.nullable().optional(),
});
export const unitUpdate = unitCreate.omit({ courseId: true }).partial();

export const lessonCreate = z.object({
  unitId: z.string().uuid(),
  type: z.enum(['LESSON', 'VIDEO', 'PRACTICE', 'INTERACTIVE']),
  title: z.string().min(2),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  xpReward: z.number().int().min(0).optional(),
  code: z.string().optional(),
  content: lessonContent.optional(),
  questionSource: questionSource.optional(),
  generators: z.array(z.string()).optional(),
  questionCount: z.number().int().min(1).max(100).optional(),
  isReview: z.boolean().optional(),
  videoTitle: z.string().optional(),
  vimeoUrl: z.string().optional(),
  durationSeconds: z.number().int().min(1).optional(),
  minWatchPct: z.number().int().min(0).max(100).optional(),
  relatedLessonId: z.string().uuid().nullable().optional(),
  passingPct: z.number().int().min(0).max(100).optional(),
  interactivePackageId: z.string().uuid().nullable().optional(),
  questions: z.array(questionSchema).optional(),
});
export const lessonUpdate = lessonCreate.omit({ unitId: true, type: true, questions: true }).partial();

export const questionCreate = z.object({
  lessonId: z.string().uuid().optional(),
  examId: z.string().uuid().optional(),
  question: questionSchema,
});

export const examUpsert = z.object({
  title: z.string().min(2),
  instructions: z.string().optional(),
  timeLimitMinutes: z.number().int().min(1).nullable().optional(),
  questionCount: z.number().int().min(1).nullable().optional(),
  shuffle: z.boolean().optional(),
  passingScore: z.number().int().min(0).max(100).nullable().optional(),
  /** GENERATED = exercícios gerados no app a partir de "generators" */
  questionSource: questionSource.optional(),
  generators: z.array(z.string()).optional(),
  /** se enviado, SUBSTITUI o banco de questões da prova */
  questions: z.array(questionSchema).optional(),
});

export const reorderSchema = z.object({
  entity: z.enum(['category', 'planet', 'course', 'unit', 'lesson', 'question']),
  orderedIds: z.array(z.string().uuid()).min(1),
});

// --------------------------------------------- árvore completa (Claude/MCP)
const practiceSpec = z.object({
  title: z.string().optional(),
  passingPct: z.number().int().min(0).max(100).optional(),
  xpReward: z.number().int().min(0).optional(),
  questions: z.array(questionSchema).min(1),
});

export const lessonSpec = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('LESSON'),
    title: z.string().min(2),
    code: z.string().optional(),
    content: lessonContent,
    xpReward: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('GENERATED_PRACTICE'),
    title: z.string().min(2),
    code: z.string().optional(),
    generators: z.array(z.string()).min(1),
    questionCount: z.number().int().min(1).max(100).default(8),
    isReview: z.boolean().optional(),
    passingPct: z.number().int().min(0).max(100).optional(),
    xpReward: z.number().int().min(0).optional(),
  }),
  z.object({
    type: z.literal('VIDEO'),
    title: z.string().min(2),
    code: z.string().optional(),
    description: z.string().optional(),
    videoTitle: z.string().optional(),
    vimeoUrl: z.string().min(5),
    durationSeconds: z.number().int().optional(),
    xpReward: z.number().int().min(0).optional(),
    /** prática ligada a este vídeo (gera a lição PRACTICE logo em seguida) */
    practice: practiceSpec.optional(),
  }),
  z.object({
    type: z.literal('PRACTICE'),
    title: z.string().min(2),
    code: z.string().optional(),
    passingPct: z.number().int().min(0).max(100).optional(),
    xpReward: z.number().int().min(0).optional(),
    questions: z.array(questionSchema).min(1),
  }),
  z.object({
    type: z.literal('INTERACTIVE'),
    title: z.string().min(2),
    interactivePackageId: z.string().uuid(),
    xpReward: z.number().int().min(0).optional(),
  }),
]);

export const unitSpec = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  themeColor: color.optional(),
  accessTier: accessTier.nullable().optional(),
  lessons: z.array(lessonSpec).min(1),
});

export const examSpec = examUpsert.superRefine((e, ctx) => {
  if ((e.questionSource ?? 'BANK') === 'BANK' && !e.questions?.length) ctx.addIssue({ code: 'custom', message: 'Prova com questões do banco precisa de "questions"', path: ['questions'] });
  if (e.questionSource === 'GENERATED' && !e.generators?.length) ctx.addIssue({ code: 'custom', message: 'Prova gerada precisa de "generators"', path: ['generators'] });
});

export const courseSpec = z.object({
  title: z.string().min(2),
  slug: slug.optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  status: contentStatus.optional(),
  accessTier: accessTier.nullable().optional(),
  estimatedMinutes: z.number().int().optional(),
  hasCertificate: z.boolean().optional(),
  code: z.string().optional(),
  icon: z.string().optional(),
  meta: z.string().optional(),
  drillLabel: z.string().optional(),
  badge: badgeSchema.optional(),
  /** código do modelo de trilha (list_trail_templates) que o curso segue */
  trailTemplate: z.string().optional(),
  units: z.array(unitSpec).min(1),
  exam: examSpec.optional(),
});

export const planetTreeSpec = planetCreate.omit({ certTemplateId: true }).extend({
  courses: z.array(courseSpec).default([]),
});

export type QuestionInput = z.infer<typeof questionSchema>;
export type PlanetTree = z.infer<typeof planetTreeSpec>;
export type CourseTree = z.infer<typeof courseSpec>;
