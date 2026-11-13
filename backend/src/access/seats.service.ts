import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';
import { Prisma, TenantRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SeatPool {
  used: number;
  max: number;
  available: number;
  usagePct: number;
}
export interface SeatUsage {
  collaborators: SeatPool;
  admins: SeatPool;
  /** todas as pessoas que ocupam licença (convidadas + ativas) */
  totalUsed: number;
}

const ROLE_LABEL: Record<TenantRole, string> = { COLABORADOR_CLIENTE: 'colaboradores', ADMIN_CLIENTE: 'administradores' };

/**
 * Licenças por empresa, definidas pelo MASTER-FOLKS em duas cotas separadas:
 *  - maxCollaborators: COLABORADOR-CLIENTE
 *  - maxAdmins:        ADMIN-CLIENTE
 * Convidados e ativos ocupam licença. 0 = sem limite.
 */
@Injectable()
export class SeatsService {
  constructor(private readonly prisma: PrismaService) {}

  async usage(tenantId: string, tx: Prisma.TransactionClient = this.prisma): Promise<SeatUsage> {
    const [settings, counts] = await Promise.all([
      tx.tenantSettings.findUnique({ where: { tenantId }, select: { maxCollaborators: true, maxAdmins: true } }),
      tx.membership.groupBy({ by: ['role'], where: { tenantId, status: { in: ['ACTIVE', 'INVITED'] } }, _count: true }),
    ]);
    const used = (r: TenantRole) => counts.find((c) => c.role === r)?._count ?? 0;
    const pool = (u: number, max: number): SeatPool => ({
      used: u,
      max,
      available: max > 0 ? Math.max(0, max - u) : Number.MAX_SAFE_INTEGER,
      usagePct: max > 0 ? Math.round((u / max) * 100) : 0,
    });
    const c = used('COLABORADOR_CLIENTE');
    const a = used('ADMIN_CLIENTE');
    return { collaborators: pool(c, settings?.maxCollaborators ?? 0), admins: pool(a, settings?.maxAdmins ?? 0), totalUsed: c + a };
  }

  /** 403 se a cota do papel estiver cheia. */
  async assertAvailable(tenantId: string, role: TenantRole, tx: Prisma.TransactionClient = this.prisma) {
    const u = await this.usage(tenantId, tx);
    const p = role === 'ADMIN_CLIENTE' ? u.admins : u.collaborators;
    if (p.max > 0 && p.used >= p.max) {
      throw new ForbiddenException({
        error: 'license_limit',
        role,
        message: `Limite de ${ROLE_LABEL[role]} da empresa atingido (${p.max}). Fale com a Folks para ampliar o plano.`,
      });
    }
  }
}

@Global()
@Module({ providers: [SeatsService], exports: [SeatsService] })
export class SeatsModule {}
