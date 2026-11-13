import { Global, Module } from '@nestjs/common';
import { ApiTokenService } from './api-token.service';
import { ApiTokensController } from './api-tokens.controller';

@Global()
@Module({ providers: [ApiTokenService], controllers: [ApiTokensController], exports: [ApiTokenService] })
export class ApiTokensModule {}
