import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OneTimeTokenPurpose, Prisma, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, ContextMode, JwtAccessPayload } from '../common/types';
import { randomToken, sha256 } from '../common/utils';
import { EmailService, templates } from '../email/email.service';
import { assertNoOtherCompany } from '../access/membership-rules';
import { SeatsService } from '../access/seats.service';

interface Ctx {
  mode: ContextMode;
  tenantId?: string;
}

interface ClientInfo {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly seats: SeatsService,
  ) {}

  static hashPassword(pw: string) {
    return bcrypt.hash(pw, 11);
  }

  // ---------------------------------------------------------------- cadastro
  async register(name: string, email: string, password: string, birthDate: string, companyCode?: string, client?: ClientInfo) {
    email = email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists?.deletedAt) throw new ConflictException('E-mail indisponível');
    if (exists && !exists.passwordHash) throw new ConflictException('Você tem um convite pendente. Use o link enviado por e-mail ou "Esqueci minha senha".');
    if (exists) throw new ConflictException('E-mail já cadastrado');

    const user = await this.prisma.user.create({
      data: {
        name,
        displayName: name.split(' ')[0],
        email,
        birthDate: new Date(`${birthDate}T00:00:00.000Z`),
        passwordHash: await AuthService.hashPassword(password),
        preferences: { create: {} },
        gamification: { create: {} },
      },
    });

    if (companyCode) {
      const { tenantId } = await this.joinTenantByCode(user.id, companyCode);
      return this.issue(user, { mode: 'TENANT', tenantId }, client);
    }
    return this.issue(user, { mode: 'B2C' }, client);
  }

  // ------------------------------------------------------------------- login
  async login(email: string, password: string, client?: ClientInfo) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user && !user.deletedAt && !user.passwordHash) {
      throw new UnauthorizedException('Seu convite ainda não foi aceito. Use o link do e-mail ou "Esqueci minha senha".');
    }
    if (!user || user.deletedAt || !(await bcrypt.compare(password, user.passwordHash!))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    if (user.status !== 'ACTIVE') throw new ForbiddenException('Usuário desativado');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const contexts = await this.availableContexts(user.id);
    return this.issue(user, this.defaultContext(contexts), client);
  }

  async refresh(refreshToken: string, client?: ClientInfo) {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!row || row.revokedAt || row.expiresAt < new Date()) throw new UnauthorizedException('Refresh token inválido');
    if (row.user.status !== 'ACTIVE' || row.user.deletedAt) throw new UnauthorizedException('Usuário desativado');
    // rotação: o token usado é revogado
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });

    let ctx = (row.context as unknown as Ctx | null) ?? { mode: 'B2C' };
    const contexts = await this.availableContexts(row.userId);
    if (!contexts.some((c) => c.mode === ctx.mode && c.tenantId === ctx.tenantId)) ctx = this.defaultContext(contexts);
    return this.issue(row.user, ctx, client);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async switchContext(current: AuthUser, target: Ctx, client?: ClientInfo) {
    const contexts = await this.availableContexts(current.id);
    const ok = contexts.find((c) => c.mode === target.mode && (target.mode !== 'TENANT' || c.tenantId === target.tenantId));
    if (!ok) throw new ForbiddenException('Contexto não disponível para este usuário');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    return this.issue(user, { mode: ok.mode, tenantId: ok.tenantId }, client);
  }

  async joinTenant(current: AuthUser, code: string, client?: ClientInfo) {
    const { tenantId } = await this.joinTenantByCode(current.id, code);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    return this.issue(user, { mode: 'TENANT', tenantId }, client);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw new BadRequestException('Senha atual incorreta');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await AuthService.hashPassword(newPassword) } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    return { ok: true };
  }

  /** Lista os modos que o usuário pode assumir (para o seletor B2B/B2C no app). */
  async availableContexts(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: 'ACTIVE', tenant: { status: 'ACTIVE', deletedAt: null } },
          include: { tenant: { select: { id: true, tradeName: true, type: true, logoUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const list: Array<{ mode: ContextMode; tenantId?: string; label: string; role?: string; tenantType?: string; logoUrl?: string | null }> = [];
    if (user.platformRole === 'MASTER_FOLKS') list.push({ mode: 'PLATFORM', label: 'Folks (Master)', role: 'MASTER_FOLKS' });
    for (const m of user.memberships) {
      list.push({
        mode: 'TENANT',
        tenantId: m.tenantId,
        label: m.tenant.tradeName,
        role: m.role,
        tenantType: m.tenant.type,
        logoUrl: m.tenant.logoUrl,
      });
    }
    // Todo usuário pode usar o modo individual (B2C), grátis ou premium.
    list.push({ mode: 'B2C', label: 'Individual', role: 'ALUNO_CLIENTE' });
    return list;
  }

  // ---------------------------------------------- convite / nova senha
  async createOneTimeToken(userId: string, purpose: OneTimeTokenPurpose, ttlMs: number, tenantId?: string, tx: Prisma.TransactionClient = this.prisma) {
    const token = randomToken(32);
    await tx.oneTimeToken.create({ data: { tokenHash: sha256(token), userId, purpose, tenantId, expiresAt: new Date(Date.now() + ttlMs) } });
    return token;
  }

  /** Sempre responde ok (não revela se o e-mail existe). */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user && !user.deletedAt && user.status === 'ACTIVE') {
      const token = await this.createOneTimeToken(user.id, 'PASSWORD_RESET', 3600_000);
      await this.email.send({ to: user.email, ...templates.passwordReset(this.email.appUrl, token) });
    }
    return { ok: true };
  }

  /** Define a senha pelo link do e-mail. Com token de CONVITE, também ativa o vínculo com a empresa. */
  async resetPassword(token: string, password: string, extra: { displayName?: string; birthDate?: string }, client?: ClientInfo) {
    const row = await this.prisma.oneTimeToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt < new Date() || row.user.deletedAt) throw new BadRequestException('Link inválido ou expirado. Peça um novo.');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.oneTimeToken.update({ where: { tokenHash: row.tokenHash }, data: { usedAt: now } });
      await tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash: await AuthService.hashPassword(password),
          ...(extra.displayName ? { displayName: extra.displayName } : {}),
          ...(extra.birthDate ? { birthDate: new Date(`${extra.birthDate}T00:00:00.000Z`) } : {}),
        },
      });
      if (row.purpose === 'INVITE') {
        await tx.membership.updateMany({
          where: { userId: row.userId, status: 'INVITED', ...(row.tenantId ? { tenantId: row.tenantId } : {}) },
          data: { status: 'ACTIVE', joinedAt: now },
        });
      }
      await tx.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: now } });
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
    const contexts = await this.availableContexts(user.id);
    const preferred = row.tenantId ? contexts.find((c) => c.tenantId === row.tenantId) : undefined;
    return this.issue(user, preferred ? { mode: 'TENANT', tenantId: preferred.tenantId } : this.defaultContext(contexts), client);
  }

  /**
   * "Ver como" (MASTER): token de 30 min, SOMENTE LEITURA, simulando o ADMIN
   * ou um colaborador da empresa. Não gera refresh token.
   */
  async impersonate(master: AuthUser, tenantId: string, as: 'ADMIN_CLIENTE' | 'COLABORADOR_CLIENTE') {
    if (master.platformRole !== 'MASTER_FOLKS' || master.mode !== 'PLATFORM' || master.impersonating) throw new ForbiddenException();
    const tenant = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
    if (!tenant) throw new NotFoundException('Empresa não encontrada');
    const payload: JwtAccessPayload = { sub: master.id, email: master.email, name: master.name, pr: 'MASTER_FOLKS', mode: 'TENANT', tid: tenantId, tr: as, imp: true };
    const accessToken = await this.jwt.signAsync(payload, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '30m' });
    return { accessToken, readOnly: true, expiresInSeconds: 1800, context: { mode: 'TENANT', tenantId, tenantRole: as, tenantName: tenant.tradeName } };
  }

  // ----------------------------------------------------------------- helpers
  private defaultContext(contexts: Awaited<ReturnType<AuthService['availableContexts']>>): Ctx {
    const c = contexts.find((x) => x.mode === 'PLATFORM') ?? contexts.find((x) => x.mode === 'TENANT') ?? contexts[contexts.length - 1];
    return { mode: c.mode, tenantId: c.tenantId };
  }

  private async joinTenantByCode(userId: string, code: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { joinCode: code.trim().toUpperCase() },
      include: { settings: true },
    });
    if (!tenant || tenant.deletedAt) throw new NotFoundException('Código de empresa inválido');
    if (tenant.status !== 'ACTIVE') throw new ForbiddenException('Empresa sem contrato ativo');

    const existing = await this.prisma.membership.findUnique({ where: { userId_tenantId: { userId, tenantId: tenant.id } } });
    if (existing) {
      if (existing.status === 'DISABLED') throw new ForbiddenException('Seu acesso a esta empresa foi desativado pelo administrador');
      if (existing.status === 'INVITED') {
        await this.prisma.membership.update({ where: { id: existing.id }, data: { status: 'ACTIVE', joinedAt: new Date() } });
      }
      return { tenantId: tenant.id };
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    await assertNoOtherCompany(this.prisma, userId, tenant.id, user.email);
    await this.seats.assertAvailable(tenant.id, 'COLABORADOR_CLIENTE');
    await this.prisma.membership.create({ data: { userId, oneCompanyKey: userId, tenantId: tenant.id, role: 'COLABORADOR_CLIENTE', joinedAt: new Date() } });
    return { tenantId: tenant.id };
  }


  private async issue(user: User, ctx: Ctx, client?: ClientInfo) {
    let tenantRole: JwtAccessPayload['tr'];
    let membershipId: string | undefined;
    if (ctx.mode === 'TENANT') {
      const m = await this.prisma.membership.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId: ctx.tenantId! } },
      });
      if (!m || m.status !== 'ACTIVE') throw new ForbiddenException('Vínculo com a empresa inativo');
      tenantRole = m.role;
      membershipId = m.id;
    }
    if (ctx.mode === 'PLATFORM' && user.platformRole !== 'MASTER_FOLKS') throw new ForbiddenException();

    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      pr: user.platformRole,
      mode: ctx.mode,
      tid: ctx.tenantId,
      mid: membershipId,
      tr: tenantRole,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL', '15m'),
    });
    const refreshToken = randomToken(48);
    const days = Number(this.config.get('JWT_REFRESH_TTL_DAYS', 30));
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + days * 86400_000),
        userAgent: client?.userAgent?.slice(0, 255),
        ip: client?.ip,
        context: ctx as unknown as Prisma.InputJsonValue,
      },
    });
    return {
      accessToken,
      refreshToken,
      context: { mode: ctx.mode, tenantId: ctx.tenantId, tenantRole, membershipId },
      user: { id: user.id, name: user.name, displayName: user.displayName, email: user.email, platformRole: user.platformRole },
    };
  }
}
