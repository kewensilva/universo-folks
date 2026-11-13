import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { TenantStatus, TenantType } from '@prisma/client';
import { PASSWORD_MSG, PASSWORD_RULE } from '../auth/dto/auth.dto';

export class TenantSettingsDto {
  /** licenças de colaboradores (0 = sem limite) */
  @IsOptional() @IsInt() @Min(0) maxCollaborators?: number;
  /** licenças de administradores (0 = sem limite) */
  @IsOptional() @IsInt() @Min(0) maxAdmins?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) passingScore?: number;
  @IsOptional() @IsInt() @Min(0) maxExamAttempts?: number;
  @IsOptional() @IsInt() @Min(0) examRetryCooldownHrs?: number;
  @IsOptional() @IsBoolean() enforceSequentialFlow?: boolean;
  @IsOptional() @IsBoolean() grantsPremiumAccess?: boolean;
  /** null apaga a data */
  @IsOptional() @IsDateString() contractStart?: string | null;
  @IsOptional() @IsDateString() contractEnd?: string | null;
}

/** Subconjunto que o ADMIN-CLIENTE pode alterar (limites contratuais ficam com o MASTER). */
export class AdminTenantSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(100) passingScore?: number;
  @IsOptional() @IsInt() @Min(0) maxExamAttempts?: number;
  @IsOptional() @IsInt() @Min(0) examRetryCooldownHrs?: number;
  @IsOptional() @IsBoolean() enforceSequentialFlow?: boolean;
}

export class FirstAdminDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password?: string;
}

export class CreateTenantDto {
  @IsOptional() @IsString() initials?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Cor: use o formato #RRGGBB' }) color?: string;
  /** "Anual", "Semestral"... (rótulo do contrato) */
  @IsOptional() @IsString() planLabel?: string;
  @IsOptional() @IsEnum(TenantType) type?: TenantType;
  @IsString() @MinLength(2) legalName: string;
  @IsString() @MinLength(2) tradeName: string;
  @IsOptional() @IsString() document?: string;
  /** se omitido é gerado (ex.: ORBITA-2026) */
  @IsOptional() @IsString() @Matches(/^[A-Z0-9-]{4,32}$/, { message: 'Código para entrar: de 4 a 32 caracteres, só letras maiúsculas, números e hífen' }) joinCode?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsObject() govDetails?: Record<string, unknown>;
  @IsOptional() @ValidateNested() @Type(() => TenantSettingsDto) settings?: TenantSettingsDto;
  /** cria (ou vincula) o primeiro ADMIN-CLIENTE */
  @IsOptional() @ValidateNested() @Type(() => FirstAdminDto) admin?: FirstAdminDto;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() initials?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Cor: use o formato #RRGGBB' }) color?: string;
  /** "Anual", "Semestral"... (rótulo do contrato) */
  @IsOptional() @IsString() planLabel?: string;
  @IsOptional() @IsEnum(TenantType) type?: TenantType;
  @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() tradeName?: string;
  @IsOptional() @IsString() document?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z0-9-]{4,32}$/, { message: 'Código para entrar: de 4 a 32 caracteres, só letras maiúsculas, números e hífen' }) joinCode?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsObject() govDetails?: Record<string, unknown>;
}
