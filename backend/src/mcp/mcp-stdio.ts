/**
 * MCP via stdio - para rodar localmente no Claude Desktop / Claude Code
 * apontando direto para o banco (útil em desenvolvimento).
 *
 *   FOLKS_API_TOKEN=fk_pat_... node dist/mcp/mcp-stdio.js
 *
 * Em produção prefira o endpoint remoto /mcp (HTTP).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppModule } from '../app.module';
import { ApiTokenService } from '../api-tokens/api-token.service';
import { McpServerFactory } from './mcp-server.factory';

async function main() {
  const token = process.env.FOLKS_API_TOKEN;
  if (!token) {
    process.stderr.write('Defina FOLKS_API_TOKEN com um token gerado em /api/master/api-tokens\n');
    process.exit(1);
  }
  // logger desligado: stdout é o canal do protocolo MCP
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const user = await app.get(ApiTokenService).authenticate(token);
  const server = app.get(McpServerFactory).create(user);
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  process.stderr.write(`${e?.stack ?? e}\n`);
  process.exit(1);
});
