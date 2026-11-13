/**
 * Respostas da API usadas pelo front. Tiradas das respostas reais (backend v0).
 * Campos que o front não usa ficam de fora de propósito; acrescente quando precisar.
 */
export type AccessTier = 'FREE' | 'PREMIUM';
export type ContentStatus = 'DRAFT' | 'COMING_SOON' | 'PUBLISHED' | 'ARCHIVED';

/** Visual do planeta (protótipo): cores, ícone, anel, ícones em órbita e figurino do astronauta. */
export interface PlanetVisual {
  colors?: string[];
  icon?: string;
  ring?: boolean;
  orbitIcons?: string[];
  look?: { head?: string; pose?: string; prop?: string };
}

export interface Category { id: string; slug: string; name: string; description?: string | null; sortOrder: number; planetCount?: number }

export type PlanetBadge = 'GRATIS' | 'PREMIUM' | 'EM_BREVE' | 'CERTIFICADO' | string;

export interface PlanetCard {
  id: string;
  slug: string;
  name: string;
  shortName?: string | null;
  description?: string | null;
  themeColor?: string | null;
  imageUrl?: string | null;
  visual?: PlanetVisual | null;
  status: ContentStatus;
  accessTier: AccessTier;
  category: { id: string; name: string; slug: string };
  courseCount: number;
  badges: PlanetBadge[];
  comingSoon: boolean;
  locked: boolean;
  /** plano de acesso que libera o conteúdo Premium do planeta (ex.: "Premium Plus"); null = liberado */
  requiredPlan?: string | null;
  inProgress: boolean;
  completedCourses: number;
  progressPct: number;
}

export interface PlanetList {
  total: number;
  counters: { all: number; in_progress: number; free: number; premium: number; byCategory: Record<string, number> };
  items: PlanetCard[];
}

export interface Badge { icon: string; name: string; text: string }

export interface CourseCard {
  id: string;
  code: string | null;
  slug: string;
  title: string;
  description?: string | null;
  meta?: string | null;
  icon?: string | null;
  badge?: Badge | null;
  badgeEarned: boolean;
  freeUnits: number;
  units: number;
  hasCertificate: boolean;
  hasExam: boolean;
  accessTier: AccessTier;
  locked: boolean;
  lockReason?: string;
  requiredPlan?: string | null;
  progressPct: number;
  status: string;
  certificateCode?: string | null;
}

export interface PlanetDetail extends Omit<PlanetCard, 'courseCount' | 'badges' | 'comingSoon' | 'locked' | 'inProgress' | 'completedCourses'> {
  courses: CourseCard[];
  progressPct: number;
  planetCertificateCode?: string | null;
}

export interface Assignment {
  id: string;
  targetType: string;
  title: string;
  planetSlug?: string | null;
  courseId?: string | null;
  mandatory: boolean;
  priority: number;
  dueDate?: string | null;
  progressPct: number;
  completed: boolean;
  overdue: boolean;
  daysLeft?: number | null;
}

export interface HomeProgress {
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  levelProgressPct: number;
  streakDays: number;
  longestStreak: number;
  todayXp: number;
  dailyGoalXp: number;
  dailyGoalPct: number;
  last7Days: Array<{ date: string; xp: number }>;
}

export interface CatalogHome {
  greetingName: string;
  premium: boolean;
  progress: HomeProgress;
  continueStudying: Array<{ courseId: string; title: string; planetSlug?: string; planetName?: string; progressPct: number; [k: string]: unknown }>;
  inProgressCount: number;
  assignments: Assignment[];
  categories: Category[];
}

export type LessonType = 'LESSON' | 'VIDEO' | 'PRACTICE' | 'INTERACTIVE';
export type StepState = 'COMPLETED' | 'AVAILABLE' | 'LOCKED';

export interface TrailLesson {
  id: string;
  code?: string | null;
  type: LessonType;
  title: string;
  xpReward: number;
  durationSeconds?: number | null;
  videoTitle?: string | null;
  questionSource?: 'BANK' | 'GENERATED';
  questionCount?: number | null;
  isReview?: boolean;
  state: StepState;
  bestScorePct?: number | null;
  lockReason?: string;
}

export interface TrailUnit {
  id: string;
  number: number;
  title: string;
  description?: string | null;
  themeColor?: string | null;
  accessTier: AccessTier;
  locked: boolean;
  lockReason?: string;
  lessons: TrailLesson[];
}

export interface TrailExam {
  id: string;
  title: string;
  questionCount: number;
  state: StepState;
  passed: boolean;
  bestScorePct?: number | null;
  attemptsLeft: number;
  canAttempt: boolean;
  passingScore: number;
  lockReason?: string;
}

export interface Trail {
  course: { id: string; code: string | null; title: string; description?: string | null; hasCertificate: boolean; badge?: Badge | null; accessTier: AccessTier };
  planet: { id: string; name: string; slug: string; themeColor?: string | null; visual?: PlanetVisual | null };
  access: { visible: boolean; locked: boolean; reason?: string; requiredPlan?: string | null };
  /** plano de acesso que libera as unidades Premium (null = liberadas) */
  requiredPlan?: string | null;
  progressPct: number;
  completedLessons: number;
  totalLessons: number;
  currentLessonId?: string | null;
  infinitePractice: { unlocked: boolean; drillLabel?: string | null; record?: number | null };
  badgeEarned?: unknown;
  units: TrailUnit[];
  exam?: TrailExam | null;
}

/** Tela de aula: texto em partes, widget e "confere rapidinho" (ADR 0011). */
export interface Slide {
  heading: string;
  text: string;
  textParts?: string[];
  visualHtml?: string | null;
  widget?: { type: string; [k: string]: unknown };
  check?: Record<string, unknown>;
  /** sons da tela (botões "ouvir"): notas sintetizadas ou arquivo de áudio (ver soundOf) */
  audioDemos?: Array<{ label: string; caption?: string; sequence?: unknown[]; url?: string }>;
}

export interface Me {
  id: string;
  name: string;
  displayName?: string | null;
  email: string;
  avatarUrl?: string | null;
  platformRole: 'MASTER_FOLKS' | 'USER';
  gamification: { totalXp: number; level: number; currentStreak: number; longestStreak: number };
  premium: boolean;
  entitlements: { premium: boolean; company: boolean; minor: boolean; ads: boolean; plan?: { code: string; name: string; categories: string[] | 'ALL' } | null };
}

// ---------------------------------------------------------------- painéis
export interface Seats { used: number; max: number; available: number; usagePct: number }

export interface CompanyDashboard {
  period: { from: string; to: string };
  seats: { collaborators: Seats; admins: Seats; totalUsed: number };
  engagement: { members: number; active7d: number; active7dPct: number; active30d: number; active30dPct: number; neverAccessed: number; neverAccessedPct: number };
  learning: { coursesReleased: number; adoptionPct: number; completionPct: number; avgProgressPct: number; lessonsCompletedInPeriod: number; examPassRatePct: number; certificatesTotal: number };
  compliance: { mandatoryAssignments: number; mandatoryCompletionPct: number; overdue: number; dueNext7Days: number };
  byDepartment: Array<{ departmentId: string; name: string; members: number; active7dPct: number; avgProgressPct: number; completionPct: number; certificates: number }>;
  byCourse: Array<{ planet: string; courseId: string; course: string; eligible: number; started: number; completed: number; adoptionPct: number; completionPct: number }>;
  ranking: Array<{ userId: string; name: string; xp: number; level: number }>;
}

export interface CompanyPerson {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  departments: Array<{ id: string; name: string }>;
  status: string;
  statusLabel: string;
  progressPct: number;
  lastActivity?: string | null;
}

export interface MasterDashboard {
  period: { from: string; to: string };
  clients: { activeTenants: number; byType: Record<string, number> };
  users: { total: number; newInPeriod: number; collaborators: number; b2cOnly: number; b2cPremium: number; premiumConversionPct: number; active7d: number; engagement7dPct: number };
  learning: { enrollments: number; completions: number; completionRatePct: number; certificatesTotal: number; examPassRatePct: number };
  content: { planetsByStatus: Record<string, number>; publishedCourses: number; lessonsByType: Record<string, number> };
  financial: { currency: string; mrrCents: number; mrrByAudienceCents: Record<string, number>; arrCents: number; activeSubscriptions: number; revenueInPeriodCents: number; monthlyRevenue: Array<{ month: string; cents: number }> };
  series: { signups: Array<{ date: string; value: number }>; activeUsers: Array<{ date: string; value: number }> };
  rankings: { topPlanets: Array<{ planetId: string; name: string; enrollments: number; completionPct: number }>; topTenants?: Array<{ tenantId: string; name: string; [k: string]: unknown }> };
}

export interface Tenant {
  id: string;
  type: 'B2B' | 'B2G';
  legalName: string;
  tradeName: string;
  status: string;
  joinCode: string;
  contactEmail?: string | null;
  initials?: string | null;
  color?: string | null;
  planLabel?: string | null;
  createdAt: string;
  settings: { maxCollaborators: number; maxAdmins: number; passingScore: number; grantsPremiumAccess: boolean };
  seats: { collaborators: Seats; admins: Seats; totalUsed: number };
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }
