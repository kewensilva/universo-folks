import { ConflictException } from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';

/** Valor da coluna única one_company_key para o status informado. */
export const oneCompanyKey = (userId: string, status: MembershipStatus) => (status === 'DISABLED' ? null : userId);

/**
 * Regra de negócio: uma pessoa só pode estar em UMA empresa (convidada ou ativa).
 * Lança 409 "other_company" se ela já pertence a outra empresa.
 */
export async function assertNoOtherCompany(tx: Prisma.TransactionClient, userId: string, tenantId: string, email?: string) {
  const other = await tx.membership.findFirst({
    where: { userId, tenantId: { not: tenantId }, status: { in: ['INVITED', 'ACTIVE'] } },
    include: { tenant: { select: { tradeName: true } } },
  });
  if (other) {
    throw new ConflictException({
      error: 'other_company',
      message: `${email ?? 'Esta pessoa'} já faz parte de outra empresa${other.tenant ? ` (${other.tenant.tradeName})` : ''}. É preciso sair dela antes.`,
    });
  }
}
