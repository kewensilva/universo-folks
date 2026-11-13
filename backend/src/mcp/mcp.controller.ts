import { All, Controller, Logger, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { McpServerFactory } from './mcp-server.factory';

/**
 * Endpoint MCP (Streamable HTTP, stateless) em /mcp.
 * Autenticação: "Authorization: Bearer fk_pat_..." (token gerado em /api/master/api-tokens).
 */
@ApiTags('mcp (Claude)')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('mcp')
export class McpController {
  private readonly log = new Logger(McpController.name);

  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  async handle(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    const server = this.factory.create(user);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      this.log.error(e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno' }, id: null });
    }
  }

  /** Modo stateless: não há stream GET nem encerramento de sessão. */
  @All()
  notAllowed(@Res() res: Response) {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método não permitido' }, id: null });
  }
}
