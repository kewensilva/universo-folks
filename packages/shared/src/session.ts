/**
 * Sessão e perfis (ADR 0002 e ADR 0012).
 * A API devolve o CONTEXTO ATIVO no login; daqui sai qual área cada perfil vê.
 */
export type ContextMode = 'PLATFORM' | 'TENANT' | 'B2C';
export type TenantRole = 'ADMIN_CLIENTE' | 'COLABORADOR_CLIENTE';
export type PlatformRole = 'MASTER_FOLKS' | 'USER';

/** Contexto ativo (vem no login, no refresh e na troca de contexto). */
export interface ActiveContext {
  mode: ContextMode;
  tenantId?: string | null;
  tenantRole?: TenantRole | null;
  membershipId?: string | null;
}

/** Um contexto disponível para a pessoa (GET /auth/contexts). */
export interface AvailableContext {
  mode: ContextMode;
  tenantId?: string;
  label: string;
  role?: string;
  tenantType?: string;
  logoUrl?: string | null;
}

export interface SessionUser {
  id: string;
  name: string;
  displayName?: string | null;
  email: string;
  platformRole: PlatformRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  context: ActiveContext;
  user: SessionUser;
}

/** Os quatro perfis do produto. */
export type Profile = 'MASTER' | 'ADMIN_EMPRESA' | 'COLABORADOR' | 'ALUNO';
/** Áreas do front: painel do MASTER, painel da empresa e área de estudo. */
export type Area = 'master' | 'empresa' | 'estudar';

export function profileOf(ctx: Pick<ActiveContext, 'mode' | 'tenantRole'> & { role?: string }): Profile {
  if (ctx.mode === 'PLATFORM') return 'MASTER';
  if (ctx.mode === 'TENANT') return (ctx.tenantRole ?? ctx.role) === 'ADMIN_CLIENTE' ? 'ADMIN_EMPRESA' : 'COLABORADOR';
  return 'ALUNO';
}

/** ÚNICA regra de "qual área este perfil vê". Novos perfis (B2G) entram aqui. */
export function areaFor(ctx: Pick<ActiveContext, 'mode' | 'tenantRole'> & { role?: string }): Area {
  const p = profileOf(ctx);
  return p === 'MASTER' ? 'master' : p === 'ADMIN_EMPRESA' ? 'empresa' : 'estudar';
}

/** O app (mobile) é a área de estudo: MASTER e ADMIN usam o painel na web. */
export const isStudyContext = (ctx: Pick<ActiveContext, 'mode' | 'tenantRole'> & { role?: string }) => areaFor(ctx) === 'estudar';

export const PROFILE_LABEL: Record<Profile, string> = {
  MASTER: 'Master Folks',
  ADMIN_EMPRESA: 'Administrador da empresa',
  COLABORADOR: 'Colaborador',
  ALUNO: 'Aluno individual',
};

/** Rótulo curto de um contexto disponível (tela "Entrar como"). */
export function contextTitle(c: AvailableContext): { title: string; subtitle: string } {
  const p = profileOf({ mode: c.mode, tenantRole: (c.role as TenantRole) ?? null });
  if (p === 'MASTER') return { title: 'Folks (Master)', subtitle: 'Painel completo da plataforma' };
  if (p === 'ADMIN_EMPRESA') return { title: c.label, subtitle: 'Administrar a empresa' };
  if (p === 'COLABORADOR') return { title: c.label, subtitle: 'Estudar pela empresa' };
  return { title: 'Individual', subtitle: 'Estudar por conta própria (grátis ou Premium)' };
}

/** Mesmo contexto? (para marcar o atual na troca) */
export const sameContext = (a: Pick<ActiveContext, 'mode' | 'tenantId'>, b: Pick<ActiveContext, 'mode' | 'tenantId'>) =>
  a.mode === b.mode && (a.mode !== 'TENANT' || a.tenantId === b.tenantId);
