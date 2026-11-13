/** Formatos das rotas /master/content/* (respostas reais). */
export interface Category { id: string; slug: string; name: string; description?: string | null; sortOrder: number; isActive: boolean; _count?: { planets: number } }
export interface PlanetRow {
  id: string; slug: string; name: string; shortName?: string | null; description?: string | null; themeColor?: string | null; status: string; accessTier: 'FREE' | 'PREMIUM';
  availableB2C: boolean; availableB2B: boolean; sortOrder: number; categoryId: string; category: { id: string; name: string; slug: string }; visual?: { colors?: string[] } | null;
  sourceImportId?: string | null; updatedAt: string; _count?: { courses: number };
}
/** `data` varia por tipo de questão (ADR 0011). */
export interface QuestionRow { id: string; type: string; prompt: string; explanation?: string | null; options?: Array<{ id: string; text: string; isCorrect: boolean }>; data?: unknown }
export interface LessonRow {
  id: string; type: 'LESSON' | 'VIDEO' | 'PRACTICE' | 'INTERACTIVE'; title: string; sortOrder: number; xpReward: number; questionSource: string; questionCount?: number | null;
  vimeoUrl?: string | null; videoTitle?: string | null; durationSeconds?: number | null; passingPct: number; content?: { slides?: unknown[] } | null; questions: QuestionRow[]; generators: string[];
}
export interface UnitRow { id: string; title: string; description?: string | null; themeColor?: string | null; accessTier?: 'FREE' | 'PREMIUM' | null; sortOrder: number; lessons: LessonRow[] }
export interface ExamRow { id: string; title: string; questionSource: string; questionCount?: number | null; passingScore?: number | null; timeLimitMinutes?: number | null; questions: QuestionRow[] }
export interface CourseRow {
  id: string; slug: string; code?: string | null; title: string; description?: string | null; status: string; accessTier?: 'FREE' | 'PREMIUM' | null; sortOrder: number; hasCertificate: boolean;
  estimatedMinutes?: number | null; meta?: string | null; badge?: { icon: string; name: string; text: string } | null; units: UnitRow[]; exam?: ExamRow | null;
  /** modelo de trilha que o curso segue (ADR 0013) */
  trailTemplateId?: string | null;
}
export interface PlanetTree extends PlanetRow { courses: CourseRow[] }
export const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Rascunho' }, { value: 'COMING_SOON', label: 'Em breve' }, { value: 'PUBLISHED', label: 'Publicado' }, { value: 'ARCHIVED', label: 'Arquivado' },
] as const;
export const TYPE_LABEL: Record<string, string> = { LESSON: 'Aula', VIDEO: 'Vídeo', PRACTICE: 'Prática', INTERACTIVE: 'Interativo' };
