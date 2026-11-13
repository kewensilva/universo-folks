import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators';
import { AuthUser, JwtAccessPayload } from '../types';
import { ApiTokenService } from '../../api-tokens/api-token.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly apiTokens: ApiTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest();
    const token = this.extractToken(req);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Token ausente');
    }

    try {
      req.user = await this.resolve(token);
    } catch (e) {
      if (isPublic) return true;
      throw e instanceof UnauthorizedException ? e : new UnauthorizedException('Token inválido ou expirado');
    }
    // Token do Claude (PAT, ADR 0007): só conteúdo. Nada de relatórios, pessoas, financeiro ou gestão.
    if (req.user?.viaApiToken && !JwtAuthGuard.allowedForApiToken(String(req.originalUrl ?? req.url ?? ''))) {
      throw new ForbiddenException('O token do Claude só pode criar e editar conteúdo (planetas, cursos e trilhas).');
    }
    if (req.user?.impersonating && req.method !== 'GET') {
      throw new ForbiddenException('Modo "ver como" é somente leitura.');
    }
    return true;
  }

  /** Rotas liberadas para token pessoal (MCP): o servidor MCP e o CRUD/importação de conteúdo. */
  static allowedForApiToken(url: string): boolean {
    const path = url.split('?')[0];
    return path === '/mcp' || path.startsWith('/mcp/') || path === '/api/master/content' || path.startsWith('/api/master/content/');
  }

  private async resolve(token: string): Promise<AuthUser> {
    if (token.startsWith(ApiTokenService.PREFIX)) {
      return this.apiTokens.authenticate(token);
    }
    const p = await this.jwt.verifyAsync<JwtAccessPayload>(token, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
    });
    // Revalida a cada requisição: usuário desativado / vínculo removido perde acesso
    // imediatamente, sem esperar o access token expirar.
    const user = await this.prisma.user.findUnique({
      where: { id: p.sub },
      select: { status: true, deletedAt: true, platformRole: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) throw new UnauthorizedException('Usuário desativado');
    if (p.mode === 'PLATFORM' && user.platformRole !== 'MASTER_FOLKS') throw new UnauthorizedException('Permissão revogada');
    if (p.imp) {
      if (user.platformRole !== 'MASTER_FOLKS') throw new UnauthorizedException('Permissão revogada');
      return { id: p.sub, email: p.email, name: p.name, platformRole: p.pr, mode: 'TENANT', tenantId: p.tid, tenantRole: p.tr, impersonating: true };
    }
    if (p.mode === 'TENANT') {
      const m = await this.prisma.membership.findUnique({
        where: { id: p.mid ?? '' },
        select: { status: true, role: true, tenant: { select: { status: true, deletedAt: true } } },
      });
      if (!m || m.status !== 'ACTIVE' || m.tenant.status !== 'ACTIVE' || m.tenant.deletedAt) {
        throw new UnauthorizedException('Vínculo com a empresa inativo');
      }
      p.tr = m.role; // papel sempre atualizado
    }
    return {
      id: p.sub,
      email: p.email,
      name: p.name,
      platformRole: p.pr,
      mode: p.mode,
      tenantId: p.tid,
      membershipId: p.mid,
      tenantRole: p.tr,
    };
  }

  private extractToken(req: any): string | undefined {
    const header: string | undefined = req.headers?.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7).trim();
    return undefined;
  }
}
