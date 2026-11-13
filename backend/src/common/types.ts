import { PlatformRole, TenantRole } from '@prisma/client';

/**
 * Contexto ativo do usuário. Um mesmo usuário pode alternar entre:
 *  - PLATFORM: atuando como MASTER-FOLKS (só quem tem platformRole MASTER_FOLKS)
 *  - B2C:      uso individual (ALUNO-CLIENTE) - grátis ou premium
 *  - TENANT:   dentro de uma empresa/órgão (ADMIN-CLIENTE ou COLABORADOR-CLIENTE)
 */
export type ContextMode = 'PLATFORM' | 'B2C' | 'TENANT';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
  mode: ContextMode;
  tenantId?: string;
  membershipId?: string;
  tenantRole?: TenantRole;
  /** true quando a requisição veio de um token pessoal (MCP) */
  viaApiToken?: boolean;
  /** MASTER usando "ver como" empresa/colaborador (somente leitura) */
  impersonating?: boolean;
}

export interface JwtAccessPayload {
  sub: string;
  email: string;
  name: string;
  pr: PlatformRole;
  mode: ContextMode;
  tid?: string;
  mid?: string;
  tr?: TenantRole;
  /** token de "ver como" (somente leitura) */
  imp?: boolean;
}

/** Papéis "lógicos" usados no @Roles() */
export type AppRole = 'MASTER_FOLKS' | 'ADMIN_CLIENTE' | 'COLABORADOR_CLIENTE' | 'ALUNO_CLIENTE';
