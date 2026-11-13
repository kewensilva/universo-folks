import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CONVERSION_PROMPT, jsonSchema } from '@folks/content-ingest';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { ContentImportService, ImportsQuery } from './content-import.service';

const strategy = z.enum(['upsert', 'create_only']);
const createSchema = z.object({
  /** JSON (objeto), texto com blocos ```json``` ou Markdown do chat */
  content: z.union([z.string().min(1), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
  format: z.enum(['auto', 'json', 'markdown']).default('auto'),
  filename: z.string().optional(),
  label: z.string().max(200).optional(),
  strategy: strategy.default('upsert'),
});
const applySchema = z.object({
  strategy: strategy.optional(),
  planets: z.array(z.string()).optional(),
  publish: z.boolean().default(false),
  onlyValid: z.boolean().default(false),
});

/**
 * Importação de conteúdo criado no Claude (planetas, cursos, trilhas).
 * Fluxo: POST (recebe e mostra a prévia) -> [PUT normalized para corrigir] -> POST apply.
 */
@ApiTags('master / importação de conteúdo (Claude)')
@ApiBearerAuth()
@Roles('MASTER_FOLKS')
@Controller('master/content/imports')
export class ContentImportController {
  constructor(private readonly s: ContentImportService) {}

  /** Formato canônico (JSON Schema) + prompt para o Claude converter o que já criou. */
  @Get('schema')
  schema() {
    return { schemaVersion: 'folks.content/v1', jsonSchema: jsonSchema(), conversionPrompt: CONVERSION_PROMPT };
  }

  @Get()
  list(@Query() q: ImportsQuery) {
    return this.s.list(q);
  }

  /** Recebe o conteúdo e devolve normalização + validação + plano (nada é gravado ainda). */
  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createSchema)) dto: z.infer<typeof createSchema>) {
    return this.s.create(u, dto);
  }

  /** Upload de arquivos .json / .md / .txt (um registro de importação por arquivo). */
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 30, { limits: { fileSize: 20 * 1024 * 1024 } }))
  async upload(@CurrentUser() u: AuthUser, @UploadedFiles() files: Express.Multer.File[], @Query('strategy') st?: 'upsert' | 'create_only') {
    if (!files?.length) throw new BadRequestException('Envie ao menos um arquivo no campo "files"');
    const out = [];
    for (const f of files) {
      if (!/\.(json|md|markdown|txt)$/i.test(f.originalname)) {
        out.push({ filename: f.originalname, error: 'Formato não suportado (use .json, .md ou .txt)' });
        continue;
      }
      out.push(await this.s.create(u, { content: f.buffer.toString('utf8'), filename: f.originalname, strategy: st ?? 'upsert' }));
    }
    return out;
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.s.get(id);
  }

  /** JSON normalizado (folks.content/v1) para revisar/editar. */
  @Get(':id/normalized')
  normalized(@Param('id', ParseUUIDPipe) id: string) {
    return this.s.normalized(id);
  }

  /** Reenvia o JSON normalizado corrigido: revalida e replaneja. */
  @Put(':id/normalized')
  updateNormalized(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.s.updateNormalized(u, id, body);
  }

  /** Recalcula o plano contra o banco atual (opcionalmente com outra estratégia). */
  @Post(':id/plan') @HttpCode(200)
  replan(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ strategy: strategy.optional() }))) dto: { strategy?: 'upsert' | 'create_only' }) {
    return this.s.replan(id, dto.strategy);
  }

  /** Grava no banco (transação por planeta). */
  @Post(':id/apply') @HttpCode(200)
  apply(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(applySchema)) dto: z.infer<typeof applySchema>) {
    return this.s.apply(u, id, dto);
  }

  @Delete(':id')
  discard(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.s.discard(u, id);
  }
}
