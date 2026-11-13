import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Min, MinLength, ValidateNested,
} from 'class-validator';
import { AssignmentTarget, MembershipStatus, TenantRole } from '@prisma/client';
import { PASSWORD_MSG, PASSWORD_RULE } from '../auth/dto/auth.dto';
import { PaginationQuery } from '../common/dto/pagination.dto';

export class DepartmentDto {
  @IsString() @MinLength(2) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() parentId?: string;
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() parentId?: string | null;
}

export class CreateMemberDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @IsOptional() @IsEnum(TenantRole) role?: TenantRole;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) departmentIds?: string[];
  /** senha inicial; se omitida é gerada e devolvida uma única vez */
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password?: string;
}

export class BulkMembersDto {
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => CreateMemberDto)
  members: CreateMemberDto[];
}

export class UpdateMemberDto {
  @IsOptional() @IsEnum(TenantRole) role?: TenantRole;
  @IsOptional() @IsEnum(MembershipStatus) status?: MembershipStatus;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) departmentIds?: string[];
}

export class MembersQuery extends PaginationQuery {
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsEnum(TenantRole) role?: TenantRole;
  @IsOptional() @IsEnum(MembershipStatus) status?: MembershipStatus;
}

export class PlanetAccessDto {
  @IsBoolean() enabled: boolean;
  /** true = "Todas"; false = somente os departamentos informados */
  @IsBoolean() allDepartments: boolean;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) departmentIds?: string[];
}

export class AssignmentDto {
  @IsEnum(AssignmentTarget) targetType: AssignmentTarget;
  @IsOptional() @IsUUID() planetId?: string;
  @IsOptional() @IsUUID() courseId?: string;
  /** vazio + membershipId vazio = empresa inteira */
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() membershipId?: string;
  @IsOptional() @IsBoolean() mandatory?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priority?: number;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class ReorderAssignmentsDto {
  @IsArray() @IsUUID('all', { each: true }) orderedIds: string[];
}
export class UpdateAssignmentDto extends PartialType(AssignmentDto) {}

export class RemindersDto {
  /** vazio = todos atrasados ou que não começaram */
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) membershipIds?: string[];
}

export class PeopleQuery {
  @IsOptional() @IsIn(['INVITED', 'ON_TRACK', 'LATE', 'NOT_STARTED', 'DONE']) status?: 'INVITED' | 'ON_TRACK' | 'LATE' | 'NOT_STARTED' | 'DONE';
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() search?: string;
}
