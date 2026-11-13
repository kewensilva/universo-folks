import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(actor: AuthUser | null, action: string, entity: string, entityId?: string, data?: unknown, tenantId?: string) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor?.id,
        tenantId: tenantId ?? actor?.tenantId,
        action,
        entity,
        entityId,
        data: (data ?? undefined) as Prisma.InputJsonValue | undefined,
        via: actor?.viaApiToken ? 'mcp' : actor ? 'api' : 'system',
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
