import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AppRole, AuthUser } from '../types';

export const IS_PUBLIC_KEY = 'isPublic';
/** Rota sem autenticação */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/**
 * Restringe a rota a papéis lógicos do contexto ativo.
 *  MASTER_FOLKS        -> platformRole MASTER_FOLKS e modo PLATFORM
 *  ADMIN_CLIENTE       -> modo TENANT com papel ADMIN_CLIENTE
 *  COLABORADOR_CLIENTE -> modo TENANT (admin também é colaborador)
 *  ALUNO_CLIENTE       -> modo B2C
 */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as AuthUser;
});
