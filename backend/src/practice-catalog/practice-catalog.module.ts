import { Global, Module } from '@nestjs/common';
import { PracticeCatalogController } from './practice-catalog.controller';
import { PracticeCatalogService } from './practice-catalog.service';

/** Catálogo do MASTER (metodologias e modelos de trilha). Global: a importação e o MCP usam o serviço. */
@Global()
@Module({ controllers: [PracticeCatalogController], providers: [PracticeCatalogService], exports: [PracticeCatalogService] })
export class PracticeCatalogModule {}
