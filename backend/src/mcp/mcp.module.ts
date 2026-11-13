import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { ContentImportModule } from '../content-import/content-import.module';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';

@Module({ imports: [ContentModule, ContentImportModule], controllers: [McpController], providers: [McpServerFactory], exports: [McpServerFactory] })
export class McpModule {}
