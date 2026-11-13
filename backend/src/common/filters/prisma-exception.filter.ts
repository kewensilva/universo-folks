import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'Registro duplicado'],
      P2003: [HttpStatus.BAD_REQUEST, 'Referência inválida'],
      P2025: [HttpStatus.NOT_FOUND, 'Registro não encontrado'],
    };
    const [status, message] = map[exception.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Erro de banco de dados'];
    res.status(status).json({
      statusCode: status,
      message,
      code: exception.code,
      target: (exception.meta as any)?.target,
    });
  }
}
