import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { Create__Name__Dto, Update__Name__Dto } from './__name__.dto';

/**
 * __Name__ — descreva aqui a regra de negócio e cite a fonte (knowledge/...).
 */
@Injectable()
export class __Name__Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Ponto único de isolamento: ADMIN só no próprio tenant, MASTER em qualquer um. */
  private tenantId(user: AuthUser, param?: string) {
    return this.access.resolveTenant(user, !param || param === 'me' ? undefined : param);
  }

  async list(user: AuthUser__tenantSig__) {
    __tenantResolve__
    // TODO: consulta filtrada pelo tenant resolvido
    return [];
  }

  async create(user: AuthUser__tenantSig__, dto: Create__Name__Dto) {
    __tenantResolve__
    // TODO: criar registro
    const created = { id: 'TODO', ...dto };
    await this.audit.log(user, '__name__.create', '__name__', created.id, dto__auditTenant__);
    return created;
  }

  async update(user: AuthUser__tenantSig__, id: string, dto: Update__Name__Dto) {
    __tenantResolve__
    // TODO: garantir que o registro pertence ao tenant antes de alterar
    if (!id) throw new NotFoundException();
    await this.audit.log(user, '__name__.update', '__name__', id, dto__auditTenant__);
    return { id, ...dto };
  }

  async remove(user: AuthUser__tenantSig__, id: string) {
    __tenantResolve__
    await this.audit.log(user, '__name__.delete', '__name__', id, undefined__auditTenant__);
    return { deleted: true };
  }
}
