import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators';
import { AppRole, AuthUser } from '../types';

export function hasRole(user: AuthUser, role: AppRole): boolean {
  switch (role) {
    case 'MASTER_FOLKS':
      return user.platformRole === 'MASTER_FOLKS' && user.mode === 'PLATFORM';
    case 'ADMIN_CLIENTE':
      return user.mode === 'TENANT' && user.tenantRole === 'ADMIN_CLIENTE';
    case 'COLABORADOR_CLIENTE':
      return user.mode === 'TENANT' && !!user.tenantId;
    case 'ALUNO_CLIENTE':
      return user.mode === 'B2C';
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AppRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException();
    if (roles.some((r) => hasRole(user, r))) return true;
    throw new ForbiddenException('Seu perfil/contexto atual não tem permissão para esta ação');
  }
}
