import { IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';
import { ContextMode } from '../../common/types';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
export const PASSWORD_MSG = 'A senha precisa ter pelo menos 8 caracteres, com letras e números';

export class RegisterDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
  /** AAAA-MM-DD - define se é menor de idade (menores não veem anúncios) */
  @IsDateString({ strict: true }, { message: 'Data de nascimento inválida (use AAAA-MM-DD)' }) birthDate: string;
  /** opcional: já entra numa empresa com o código (ex.: ORBITA-2026) */
  @IsOptional() @IsString() companyCode?: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

export class RefreshDto {
  @IsString() refreshToken: string;
}

export class SwitchContextDto {
  @IsIn(['PLATFORM', 'B2C', 'TENANT']) mode: ContextMode;
  @IsOptional() @IsUUID() tenantId?: string;
}

export class JoinTenantDto {
  @IsString() @MinLength(3) code: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) newPassword: string;
}

export class ForgotPasswordDto {
  @IsEmail() email: string;
}

/** Nova senha pelo link do e-mail - serve também para ACEITAR CONVITE de empresa. */
export class ResetPasswordDto {
  @IsString() @MinLength(10) token: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
  /** no aceite de convite a pessoa pode informar como quer ser chamada e a data de nascimento */
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsDateString({ strict: true }) birthDate?: string;
}

export class ImpersonateDto {
  @IsUUID() tenantId: string;
  @IsIn(['ADMIN_CLIENTE', 'COLABORADOR_CLIENTE']) as: 'ADMIN_CLIENTE' | 'COLABORADOR_CLIENTE';
}
