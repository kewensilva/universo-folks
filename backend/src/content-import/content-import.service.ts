import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContentImportStatus, Prisma } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { createHash } from 'crypto';
import {
  type Bundle,
  type IngestResult,
  type Plan,
  type Planet,
  type Snapshot,
  type Strategy,
  checkAgainstCatalog,
  ingest,
  planImport,
  splitValidPlanets,
} from '@folks/content-ingest';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { VimeoService } from '../vimeo/vimeo.service';
import { AuthUser } from '../common/types';
import { PaginationQuery, pageResult, paginate } from '../common/dto/pagination.dto';
import { ContentIngestWriter, PlanetWriteResult } from './content-ingest.writer';
import { PracticeCatalogService } from '../practice-catalog/practice-catalog.service';

export class ImportsQuery extends PaginationQuery {
  @IsOptional() @IsEnum(ContentImportStatus) status?: ContentImportStatus;
}

export interface CreateImportInput {
  content: string | object;
  format?: 'auto' | 'json' | 'markdown';
  filename?: string;
  label?: string;
  strategy?: Strategy;
}

export interface ApplyOptions {
  strategy?: Strategy;
  /** slugs dos planetas a gravar (padrão: todos os gravaveis) */
  planets?: string[];
  /** publicar já (padrão: tudo nasce DRAFT) */
  publish?: boolean;
  /** gravar os planetas válidos mesmo que outros tenham erro */
  onlyValid?: boolean;
}

const MAX_RAW = 20 * 1024 * 1024;

/**
 * Pipeline de importação de conteúdo gerado no Claude:
 *   receber -> normalizar (folks.content/v1) -> validar -> planejar (dry-run)
 *   -> [MASTER revisa / edita o normalizado] -> gravar (transação por planeta).
 * Idempotente: reenviar o mesmo conteúdo não duplica nada (hash por curso).
 */
@Injectable()
export class ContentImportService {
  private readonly log = new Logger(ContentImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly writer: ContentIngestWriter,
    private readonly vimeo: VimeoService,
    private readonly catalog: PracticeCatalogService,
  ) {}

  // ------------------------------------------------------------ receber
  async create(me: AuthUser, input: CreateImportInput, via: 'api' | 'mcp' = 'api') {
    const raw = typeof input.content === 'string' ? input.content : JSON.stringify(input.content);
    if (!raw.trim()) throw new BadRequestException('Conteúdo vazio');
    if (raw.length > MAX_RAW) throw new BadRequestException('Conteúdo acima de 20 MB: divida em partes (ex.: um arquivo por planeta)');
    const payloadHash = createHash('sha256').update(raw).digest('hex');

    const previous = await this.prisma.contentImport.findFirst({
      where: { payloadHash, status: { not: 'DISCARDED' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true },
    });

    const result = await this.ingestChecked({ content: input.content, format: input.format, filename: input.filename });
    const strategy = input.strategy ?? 'upsert';
    const plan = await this.buildPlan(result.bundle, result, strategy);
    const row = await this.prisma.contentImport.create({
      data: {
        label: input.label ?? input.filename ?? this.defaultLabel(result.bundle),
        filename: input.filename,
        format: result.format,
        status: result.errors ? 'INVALID' : 'VALIDATED',
        payloadHash,
        rawPayload: raw,
        normalized: result.bundle as unknown as Prisma.InputJsonValue,
        issues: result.issues as unknown as Prisma.InputJsonValue,
        stats: result.stats as unknown as Prisma.InputJsonValue,
        plan: plan as unknown as Prisma.InputJsonValue,
        strategy,
        errorCount: result.errors,
        warningCount: result.warnings,
        via,
        createdById: me.id,
      },
    });
    await this.audit.log(me, 'content_import.create', 'content_import', row.id, { format: result.format, stats: result.stats, errors: result.errors });
    return { ...this.view(row), duplicateOf: previous ? { id: previous.id, status: previous.status, createdAt: previous.createdAt } : null };
  }

  /** Normaliza e valida, e confere contra o catálogo do MASTER (metodologias e modelos de trilha: só avisos, ADR 0013). */
  private async ingestChecked(input: Parameters<typeof ingest>[0]): Promise<IngestResult> {
    const result = ingest(input);
    const extra = checkAgainstCatalog(result.bundle, await this.catalog.catalog());
    if (!extra.length) return result;
    return { ...result, issues: [...result.issues, ...extra], warnings: result.warnings + extra.length };
  }

  // ------------------------------------------------------------ consultar
  async list(q: ImportsQuery) {
    const { skip, take, page, pageSize } = paginate(q);
    const where: Prisma.ContentImportWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { label: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentImport.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, label: true, filename: true, format: true, status: true, stats: true, errorCount: true, warningCount: true, via: true, createdAt: true, appliedAt: true },
      }),
      this.prisma.contentImport.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  async get(id: string) {
    return this.view(await this.find(id));
  }

  async normalized(id: string) {
    return (await this.find(id)).normalized;
  }

  // ------------------------------------------------------------ corrigir
  /** O MASTER (ou o Claude) corrige o JSON normalizado e reenvia: revalida e replaneja. */
  async updateNormalized(me: AuthUser, id: string, bundle: unknown) {
    const row = await this.find(id);
    if (row.status === 'APPLIED' || row.status === 'APPLYING') throw new ConflictException('Importação já gravada: crie uma nova importação com o conteúdo corrigido');
    const result = await this.ingestChecked({ content: bundle as object });
    const plan = await this.buildPlan(result.bundle, result, row.strategy as Strategy);
    const updated = await this.prisma.contentImport.update({
      where: { id },
      data: {
        normalized: result.bundle as unknown as Prisma.InputJsonValue,
        issues: result.issues as unknown as Prisma.InputJsonValue,
        stats: result.stats as unknown as Prisma.InputJsonValue,
        plan: plan as unknown as Prisma.InputJsonValue,
        errorCount: result.errors,
        warningCount: result.warnings,
        status: result.errors ? 'INVALID' : 'VALIDATED',
      },
    });
    await this.audit.log(me, 'content_import.edit', 'content_import', id, { errors: result.errors });
    return this.view(updated);
  }

  /** Recalcula o plano contra o estado ATUAL do banco (ex.: após outra importação). */
  async replan(id: string, strategy?: Strategy) {
    const row = await this.find(id);
    const result = ingest({ content: row.normalized as object });
    const plan = await this.buildPlan(result.bundle, result, strategy ?? (row.strategy as Strategy));
    const updated = await this.prisma.contentImport.update({ where: { id }, data: { plan: plan as unknown as Prisma.InputJsonValue, strategy: plan.strategy } });
    return this.view(updated);
  }

  async discard(me: AuthUser, id: string) {
    const row = await this.find(id);
    if (row.status === 'APPLIED' || row.status === 'APPLYING') throw new ConflictException('Importação já gravada não pode ser descartada');
    await this.prisma.contentImport.update({ where: { id }, data: { status: 'DISCARDED' } });
    await this.audit.log(me, 'content_import.discard', 'content_import', id);
    return { discarded: true };
  }

  // ------------------------------------------------------------ gravar
  async apply(me: AuthUser, id: string, opts: ApplyOptions = {}) {
    const row = await this.find(id);
    if (row.status === 'APPLIED') throw new ConflictException('Esta importação já foi gravada. Reenvie o conteúdo para atualizar (cursos iguais não mudam).');
    if (row.status === 'DISCARDED') throw new ConflictException('Importação descartada');

    const result = ingest({ content: row.normalized as object });
    const { valid, invalid } = splitValidPlanets(result.bundle, result.issues);
    if (invalid.length && !opts.onlyValid) {
      throw new BadRequestException({
        message: `${invalid.length} planeta(s) com erro. Corrija o conteúdo ou grave só os válidos com "onlyValid": true.`,
        invalid,
      });
    }
    const chosen = opts.planets?.length ? valid.filter((p) => opts.planets!.includes(p.slug)) : valid;
    if (!chosen.length) throw new BadRequestException('Nenhum planeta válido selecionado para gravar');

    // trava contra gravação dupla (dois cliques / duas abas / MCP + painel)
    const lock = await this.prisma.contentImport.updateMany({ where: { id, status: { in: ['VALIDATED', 'INVALID', 'PARTIAL', 'FAILED'] } }, data: { status: 'APPLYING' } });
    if (!lock.count) throw new ConflictException('Esta importação já está sendo gravada');

    const strategy = opts.strategy ?? (row.strategy as Strategy);
    const bundle: Bundle = { ...result.bundle, planets: chosen };
    let plan: Plan;
    const results: PlanetWriteResult[] = [];
    try {
      plan = planImport(bundle, await this.snapshot(bundle), strategy); // plano fresco, contra o banco de agora
      const durations = await this.prefetchDurations(bundle);
      for (const planet of chosen) {
        const planRow = plan.planets.find((p) => p.slug === planet.slug)!;
        try {
          results.push(await this.writer.writePlanet(planet, planRow, { importId: id, publish: !!opts.publish, durations }));
        } catch (e: any) {
          this.log.error(`Falha ao gravar planeta ${planet.slug}: ${e?.message}`);
          results.push({ slug: planet.slug, name: planet.name, action: 'FAILED', courses: [], videosPending: 0, error: String(e?.message ?? e).slice(0, 500) });
        }
      }
    } catch (e) {
      await this.prisma.contentImport.update({ where: { id }, data: { status: 'FAILED', result: { error: String((e as Error)?.message ?? e) } } });
      throw e;
    }

    const failed = results.filter((r) => r.action === 'FAILED').length;
    const written = results.filter((r) => r.action === 'CREATE' || r.action === 'UPDATE').length;
    const status: ContentImportStatus = failed === results.length ? 'FAILED' : failed || invalid.length || chosen.length < valid.length ? 'PARTIAL' : 'APPLIED';
    const summary = {
      strategy,
      published: !!opts.publish,
      planetsWritten: written,
      planetsUnchanged: results.filter((r) => r.action === 'UNCHANGED').length,
      planetsFailed: failed,
      planetsSkipped: results.filter((r) => ['SKIP', 'BLOCKED'].includes(r.action)).length + invalid.length,
      coursesCreated: results.flatMap((r) => r.courses).filter((c) => c.action === 'CREATE').length,
      coursesReplaced: results.flatMap((r) => r.courses).filter((c) => c.action === 'REPLACE').length,
      coursesInConflict: results.flatMap((r) => r.courses).filter((c) => c.action === 'CONFLICT').length,
      videosPending: results.reduce((a, r) => a + r.videosPending, 0),
    };
    const updated = await this.prisma.contentImport.update({
      where: { id },
      data: {
        status,
        plan: plan as unknown as Prisma.InputJsonValue,
        result: { summary, planets: results, invalid } as unknown as Prisma.InputJsonValue,
        appliedById: me.id,
        appliedAt: new Date(),
      },
    });
    await this.audit.log(me, 'content_import.apply', 'content_import', id, summary);
    return this.view(updated);
  }

  // ------------------------------------------------------------ apoio
  /** Estado atual do banco para o planejador (o pacote não acessa banco). */
  private async snapshot(bundle: Bundle): Promise<Snapshot> {
    const slugs = bundle.planets.map((p) => p.slug);
    const keys = bundle.planets.flatMap((p) => p.courses.map((c) => c.key));
    const [categories, planets, elsewhere] = await Promise.all([
      this.prisma.studyCategory.findMany({ select: { slug: true } }),
      this.prisma.planet.findMany({
        where: { slug: { in: slugs } },
        select: {
          id: true, slug: true, status: true, contentHash: true,
          courses: { select: { id: true, code: true, slug: true, title: true, contentHash: true, status: true, _count: { select: { enrollments: true } } } },
        },
      }),
      this.prisma.course.findMany({ where: { code: { in: keys } }, select: { code: true, planet: { select: { slug: true, name: true } } } }),
    ]);
    const courseCodesElsewhere: Record<string, string> = {};
    for (const p of bundle.planets) for (const c of p.courses) {
      const hit = elsewhere.find((e) => e.code === c.key && e.planet.slug !== p.slug);
      if (hit) courseCodesElsewhere[c.key] = hit.planet.name;
    }
    return {
      categories: categories.map((c) => c.slug),
      planets: planets.map((p) => ({
        id: p.id,
        slug: p.slug,
        status: p.status,
        contentHash: p.contentHash,
        courses: p.courses.map((c) => ({ id: c.id, code: c.code, slug: c.slug, title: c.title, contentHash: c.contentHash, status: c.status, hasProgress: c._count.enrollments > 0 })),
      })),
      courseCodesElsewhere,
    };
  }

  private async buildPlan(bundle: Bundle, result: IngestResult, strategy: Strategy): Promise<Plan & { invalidPlanets: unknown[] }> {
    const { valid, invalid } = splitValidPlanets(bundle, result.issues);
    const sub: Bundle = { ...bundle, planets: valid };
    const plan = valid.length ? planImport(sub, await this.snapshot(sub), strategy) : { strategy, planets: [], summary: {}, hasChanges: false };
    return { ...plan, invalidPlanets: invalid };
  }

  /** Duração dos vídeos no Vimeo, buscada ANTES da transação (I/O externo fora do banco). */
  private async prefetchDurations(bundle: Bundle) {
    const map = new Map<string, number>();
    if (!this.vimeo.enabled) return map;
    const urls = [...new Set(bundle.planets.flatMap((p) => p.courses.flatMap((c) => c.units.flatMap((u) => u.lessons.flatMap((l) => (l.type === 'VIDEO' && l.vimeoUrl && !l.durationSeconds ? [l.vimeoUrl] : []))))))];
    for (const url of urls) {
      const info = await this.vimeo.getVideo(url);
      if (info?.durationSeconds) map.set(url, info.durationSeconds);
    }
    return map;
  }

  private defaultLabel(b: Bundle) {
    const names = b.planets.map((p: Planet) => p.name).filter(Boolean);
    return names.length ? `Importação: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` e mais ${names.length - 3}` : ''}` : 'Importação de conteúdo';
  }

  private async find(id: string) {
    const row = await this.prisma.contentImport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Importação não encontrada');
    return row;
  }

  private view(row: Awaited<ReturnType<ContentImportService['find']>>) {
    const issues = row.issues as unknown as Array<{ severity: string }>;
    return {
      id: row.id,
      label: row.label,
      filename: row.filename,
      format: row.format,
      status: row.status,
      strategy: row.strategy,
      via: row.via,
      stats: row.stats,
      errors: row.errorCount,
      warnings: row.warningCount,
      issues: issues.filter((i) => i.severity !== 'info'),
      notes: issues.filter((i) => i.severity === 'info'),
      plan: row.plan,
      result: row.result,
      createdAt: row.createdAt,
      appliedAt: row.appliedAt,
    };
  }
}
