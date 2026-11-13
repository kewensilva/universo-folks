import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class Create__Name__Dto {
  @IsString() @MinLength(2, { message: 'O nome precisa ter pelo menos 2 caracteres' }) name: string;
  @IsOptional() @IsString() description?: string;
}

export class Update__Name__Dto extends PartialType(Create__Name__Dto) {}
