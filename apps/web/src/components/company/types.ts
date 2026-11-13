/** Formatos das rotas /companies/:tenant/* (respostas reais da API v0). */
export interface Department { id: string; name: string; description?: string | null; parentId?: string | null; memberCount?: number }
export interface Member {
  membershipId: string;
  role: 'ADMIN_CLIENTE' | 'COLABORADOR_CLIENTE';
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  jobTitle?: string | null;
  user: { id: string; name: string; email: string; lastLoginAt?: string | null; gamification?: { totalXp: number; level: number; currentStreak: number } | null };
  departments: Array<{ id: string; name: string }>;
  coursesStarted: number;
  coursesCompleted: number;
  completionPct: number;
  certificates: number;
}
export interface CompanyPlanet {
  planet: { id: string; slug: string; name: string; description?: string | null; themeColor?: string | null; status: string; accessTier: string; category: { name: string; slug: string }; courseCount: number };
  enabled: boolean;
  allDepartments: boolean;
  departments: Array<{ id: string; name: string }>;
}
export interface Assignment {
  id: string;
  targetType: 'PLANET' | 'COURSE';
  planetId?: string | null;
  courseId?: string | null;
  departmentId?: string | null;
  membershipId?: string | null;
  mandatory: boolean;
  priority: number;
  startsAt?: string | null;
  dueDate?: string | null;
  planet?: { id: string; name: string } | null;
  course?: { id: string; title: string } | null;
  department?: { id: string; name: string } | null;
  membership?: { id: string; user?: { name: string } } | null;
}
export interface CompanyOverview {
  id: string;
  tradeName: string;
  legalName: string;
  joinCode: string;
  status: string;
  settings: { maxCollaborators: number; maxAdmins: number; passingScore: number; maxExamAttempts: number; examRetryCooldownHrs: number; enforceSequentialFlow: boolean; grantsPremiumAccess: boolean; contractStart?: string | null; contractEnd?: string | null };
  seats: { collaborators: { used: number; max: number; available: number }; admins: { used: number; max: number; available: number } };
}
export interface EngagementPoint { label: string; start: string; ratePct: number; daily: number; unique: number; users: number }
export interface MemberDashboard {
  membershipId: string;
  user: { name: string; email: string; lastLoginAt?: string | null; gamification?: { totalXp: number; level: number; currentStreak: number; longestStreak: number } };
  courses: Array<{ courseId: string; course: string; planet: string; status: string; progressPct: number; startedAt?: string | null; completedAt?: string | null }>;
  certificates: unknown[];
}
export const ROLE_LABEL = { ADMIN_CLIENTE: 'Administrador', COLABORADOR_CLIENTE: 'Colaborador' } as const;
