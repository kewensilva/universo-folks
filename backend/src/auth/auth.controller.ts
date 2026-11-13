import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, Public } from '../common/decorators';
import { AuthUser } from '../common/types';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../common/decorators';
import {
  ChangePasswordDto, ForgotPasswordDto, ImpersonateDto, JoinTenantDto, LoginDto, RefreshDto, RegisterDto, ResetPasswordDto, SwitchContextDto,
} from './dto/auth.dto';

const client = (req: Request) => ({ userAgent: req.headers['user-agent'], ip: req.ip });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Cadastro self-service (B2C). Com companyCode já entra como colaborador. */
  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto.name, dto.email, dto.password, dto.birthDate, dto.companyCode, client(req));
  }

  /** Envia o link de nova senha (sempre responde ok). */
  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @Post('password/forgot') @HttpCode(200)
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  /** Nova senha pelo link do e-mail - também ACEITA CONVITE de empresa (/convite?token=). */
  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('password/reset') @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto.token, dto.password, { displayName: dto.displayName, birthDate: dto.birthDate }, client(req));
  }

  /** "Ver como" empresa/colaborador - token de 30 min somente leitura. */
  @ApiBearerAuth() @Roles('MASTER_FOLKS') @Post('impersonate') @HttpCode(200)
  impersonate(@CurrentUser() user: AuthUser, @Body() dto: ImpersonateDto) {
    return this.auth.impersonate(user, dto.tenantId, dto.as);
  }

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @Post('login') @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, client(req));
  }

  @Public() @Post('refresh') @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, client(req));
  }

  @Public() @Post('logout') @HttpCode(200)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth() @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /** Modos disponíveis: PLATFORM (master), TENANT (cada empresa) e B2C. */
  @ApiBearerAuth() @Get('contexts')
  contexts(@CurrentUser() user: AuthUser) {
    return this.auth.availableContexts(user.id);
  }

  /** Alterna entre modo individual (B2C) e empresa (B2B) com o mesmo usuário. */
  @ApiBearerAuth() @Post('switch-context') @HttpCode(200)
  switch(@CurrentUser() user: AuthUser, @Body() dto: SwitchContextDto, @Req() req: Request) {
    return this.auth.switchContext(user, dto, client(req));
  }

  /** "Código da empresa" (tela Ajustes). */
  @ApiBearerAuth() @Post('join-company') @HttpCode(200)
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinTenantDto, @Req() req: Request) {
    return this.auth.joinTenant(user, dto.code, client(req));
  }

  @ApiBearerAuth() @Post('change-password') @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
