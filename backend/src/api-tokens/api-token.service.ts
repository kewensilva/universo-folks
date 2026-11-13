import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { randomToken, sha256 } from '../common/utils';

/**
 * Tokens pessoais (PAT). Hoje são usados para o MASTER-FOLKS conectar o Claude
 * (MCP) à plataforma. Um PAT sempre atua no contexto PLATFORM do dono.
 */
@Injectable()
export class ApiTokenService {
  static readonly PREFIX = 'fk_pat_';

  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, name: string, expiresInDays?: number) {
    if (user.platformRole !== 'MASTER_FOLKS') throw new ForbiddenException('Somente MASTER-FOLKS pode gerar tokens');
    const raw = ApiTokenService.PREFIX + randomToken(32);
    const token = await this.prisma.apiToken.create({
      data: {
        userId: user.id,
        name,
        prefix: raw.slice(0, 12),
        tokenHash: sha256(raw),
        // ADR 0007: o Claude só cria e edita conteúdo (o guarda bloqueia o resto da API)
        scopes: ['content:write', 'content:read'],
        expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400_000) : null,
      },
      select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, createdAt: true },
    });
    // O valor bruto só é exibido uma única vez
    return { ...token, token: raw };
  }

  list(userId: string) {
    return this.prisma.apiToken.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(userId: string, id: string) {
    const t = await this.prisma.apiToken.findFirst({ where: { id, userId } });
    if (!t) throw new NotFoundException();
    await this.prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return { revoked: true };
  }

  async authenticate(raw: string): Promise<AuthUser> {
    const t = await this.prisma.apiToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
    if (!t || t.revokedAt || (t.expiresAt && t.expiresAt < new Date())) throw new UnauthorizedException('Token inválido');
    if (t.user.status !== 'ACTIVE' || t.user.deletedAt || t.user.platformRole !== 'MASTER_FOLKS') {
      throw new UnauthorizedException('Usuário sem permissão');
    }
    // não bloqueia a requisição por causa do lastUsedAt
    this.prisma.apiToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    return {
      id: t.user.id,
      email: t.user.email,
      name: t.user.name,
      platformRole: t.user.platformRole,
      mode: 'PLATFORM',
      viaApiToken: true,
    };
  }
}
