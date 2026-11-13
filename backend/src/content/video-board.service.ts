import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { VimeoFolderNode, VimeoService, VimeoVideoInfo } from '../vimeo/vimeo.service';

/** Correções do MASTER no quadro de vídeos (tudo numa transação). */
export const videoBoardSave = z.object({
  /** vídeo de cada lição de VÍDEO (id do Vimeo; null tira o vídeo) */
  assignments: z.array(z.object({ lessonId: z.string().uuid(), videoId: z.string().regex(/^\d+$/).nullable() })).max(500).optional(),
  /** título da lição (ex.: o vídeo mudou de lugar e o título precisa acompanhar) */
  titles: z.array(z.object({ lessonId: z.string().uuid(), title: z.string().trim().min(2).max(200) })).max(500).optional(),
  /** nova ordem das unidades de um curso (todas as unidades do curso) */
  unitOrder: z.array(z.object({ courseId: z.string().uuid(), unitIds: z.array(z.string().uuid()).min(1) })).max(100).optional(),
  /** nova ordem das etapas de uma unidade (todas as etapas da unidade) */
  lessonOrder: z.array(z.object({ unitId: z.string().uuid(), lessonIds: z.array(z.string().uuid()).min(1) })).max(500).optional(),
});
export type VideoBoardSave = z.infer<typeof videoBoardSave>;

export type BoardIssueCode = 'MISSING' | 'DUPLICATE' | 'UNUSED' | 'WRONG_MODULE' | 'ORDER' | 'NOT_IN_FOLDER';
export interface BoardIssue { code: BoardIssueCode; level: 'error' | 'warning' | 'info'; message: string; lessonIds?: string[]; videoId?: string; courseId?: string }

interface FolderVideo { id: string; hash?: string; name?: string; durationSeconds?: number; thumbnail?: string; link?: string; folderId: string; folderName: string; number: number | null }

/** número do vídeo no nome ("Módulo 3 - Vídeo 4" → 4); sem padrão, o último número do nome */
export function videoNumber(name?: string | null): number | null {
  if (!name) return null;
  const m = name.match(/v[íi]deo\s*(\d+)/i) ?? name.match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
}
const lastNumber = (name?: string | null) => { const m = name?.match(/(\d+)(?!.*\d)/); return m ? Number(m[1]) : null; };
const folderIdOf = (uri?: string | null) => (uri ? String(uri).split('/').filter(Boolean).pop() ?? null : null);

/**
 * Quadro de vídeos do planeta: onde cada vídeo do Vimeo está na trilha, comparado com a pasta
 * (e as subpastas = módulos/cursos). Aponta equívocos de quem montou o conteúdo (ex.: o Claude)
 * e aplica as correções do MASTER: trocar/permutar vídeos, reordenar unidades e etapas, títulos.
 */
@Injectable()
export class VideoBoardService {
  constructor(private readonly prisma: PrismaService, private readonly vimeo: VimeoService, private readonly audit: AuditService) {}

  private async loadPlanet(idOrSlug: string) {
    const uuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    const planet = await this.prisma.planet.findFirst({
      where: uuid ? { id: idOrSlug } : { slug: idOrSlug },
      select: {
        id: true, slug: true, name: true, vimeoFolderUri: true,
        courses: {
          where: { status: { not: 'ARCHIVED' } },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, title: true, status: true,
            units: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true, title: true,
                lessons: { orderBy: { sortOrder: 'asc' }, select: { id: true, type: true, title: true, videoTitle: true, vimeoVideoId: true, vimeoHash: true, durationSeconds: true, thumbnailUrl: true } },
              },
            },
          },
        },
      },
    });
    if (!planet) throw new NotFoundException('Planeta não encontrado');
    return planet;
  }

  /** Vídeos da pasta do planeta (com subpastas), indexados pelo id. */
  private async folderIndex(folderUri?: string | null): Promise<{ tree: VimeoFolderNode | null; index: Map<string, FolderVideo>; error?: string }> {
    const id = folderIdOf(folderUri);
    if (!id) return { tree: null, index: new Map() };
    if (!this.vimeo.enabled) return { tree: null, index: new Map(), error: 'Integração com o Vimeo não configurada' };
    try {
      const tree = await this.vimeo.folderTree(id);
      const index = new Map<string, FolderVideo>();
      const add = (videos: VimeoVideoInfo[], folderId: string, folderName: string) => {
        for (const v of videos) index.set(v.id, { id: v.id, hash: v.hash, name: v.name, durationSeconds: v.durationSeconds, thumbnail: v.thumbnail, link: v.link, folderId, folderName, number: videoNumber(v.name) });
      };
      add(tree.videos, tree.id, 'Pasta do planeta');
      for (const f of tree.folders) {
        add(f.videos, f.id, f.name);
        for (const g of f.folders) add(g.videos, g.id, `${f.name} / ${g.name}`);
      }
      return { tree, index };
    } catch (e: any) {
      return { tree: null, index: new Map(), error: e?.response?.message ?? e?.message ?? 'Falha ao ler a pasta do Vimeo' };
    }
  }

  async board(idOrSlug: string) {
    const planet = await this.loadPlanet(idOrSlug);
    const { tree, index, error } = await this.folderIndex(planet.vimeoFolderUri);
    const lessonIds = planet.courses.flatMap((c) => c.units.flatMap((u) => u.lessons.map((l) => l.id)));
    const progress = await this.prisma.lessonProgress.groupBy({ by: ['lessonId'], where: { lessonId: { in: lessonIds } }, _count: { _all: true } });
    const learners = new Map(progress.map((p) => [p.lessonId, p._count._all]));

    const issues: BoardIssue[] = [];
    const usedBy = new Map<string, string[]>(); // videoId -> lessonIds
    const courses = planet.courses.map((c) => {
      const videoLessons = c.units.flatMap((u) => u.lessons.filter((l) => l.type === 'VIDEO'));
      // módulo (subpasta) do curso = a subpasta da maioria dos vídeos dele
      const votes = new Map<string, number>();
      for (const l of videoLessons) {
        const f = l.vimeoVideoId ? index.get(l.vimeoVideoId) : undefined;
        if (f && f.folderId !== tree?.id) votes.set(f.folderId, (votes.get(f.folderId) ?? 0) + 1);
      }
      const moduleId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const moduleName = moduleId ? [...index.values()].find((v) => v.folderId === moduleId)?.folderName ?? null : null;

      let lastNumber = -Infinity;
      const units = c.units.map((u) => ({
        id: u.id,
        title: u.title,
        lessons: u.lessons.map((l) => {
          const f = l.vimeoVideoId ? index.get(l.vimeoVideoId) : undefined;
          if (l.type === 'VIDEO') {
            if (!l.vimeoVideoId) issues.push({ code: 'MISSING', level: 'error', message: `"${l.title}" (${c.title}) está sem vídeo.`, lessonIds: [l.id], courseId: c.id });
            else {
              usedBy.set(l.vimeoVideoId, [...(usedBy.get(l.vimeoVideoId) ?? []), l.id]);
              if (tree && !f) issues.push({ code: 'NOT_IN_FOLDER', level: 'info', message: `O vídeo de "${l.title}" não está na pasta do planeta no Vimeo.`, lessonIds: [l.id], videoId: l.vimeoVideoId, courseId: c.id });
              if (f && moduleId && f.folderId !== moduleId) issues.push({ code: 'WRONG_MODULE', level: 'warning', message: `"${l.title}" usa um vídeo de "${f.folderName}", mas o curso "${c.title}" é de "${moduleName}".`, lessonIds: [l.id], videoId: l.vimeoVideoId, courseId: c.id });
              if (f && f.folderId === moduleId && f.number != null) {
                if (f.number < lastNumber) issues.push({ code: 'ORDER', level: 'warning', message: `Em "${c.title}", "${f.name}" vem depois de um vídeo de número maior.`, lessonIds: [l.id], videoId: l.vimeoVideoId, courseId: c.id });
                lastNumber = Math.max(lastNumber, f.number);
              }
            }
          }
          return {
            id: l.id, type: l.type, title: l.title, learners: learners.get(l.id) ?? 0,
            video: l.vimeoVideoId
              ? { id: l.vimeoVideoId, name: f?.name ?? null, folderName: f?.folderName ?? null, number: f?.number ?? null, durationSeconds: l.durationSeconds ?? f?.durationSeconds ?? null, thumbnail: l.thumbnailUrl ?? f?.thumbnail ?? null }
              : null,
          };
        }),
      }));
      return { id: c.id, title: c.title, status: c.status, moduleId, moduleName, units };
    });

    for (const [videoId, ids] of usedBy) {
      if (ids.length > 1) issues.push({ code: 'DUPLICATE', level: 'warning', message: `O vídeo "${index.get(videoId)?.name ?? videoId}" está em ${ids.length} etapas.`, lessonIds: ids, videoId });
    }
    for (const v of index.values()) {
      if (!usedBy.has(v.id)) issues.push({ code: 'UNUSED', level: 'info', message: `"${v.name ?? v.id}" (${v.folderName}) não está em nenhuma etapa.`, videoId: v.id });
    }

    const folder = tree
      ? {
          id: tree.id,
          modules: [
            ...(tree.videos.length ? [{ id: tree.id, name: 'Pasta do planeta', videos: tree.videos }] : []),
            ...tree.folders.map((f) => ({ id: f.id, name: f.name, videos: [...f.videos, ...f.folders.flatMap((g) => g.videos)] })),
          ]
            .sort((a, b) => (a.id === tree.id ? -1 : b.id === tree.id ? 1 : (lastNumber(a.name) ?? 1e9) - (lastNumber(b.name) ?? 1e9) || a.name.localeCompare(b.name)))
            .map((m) => ({
            ...m,
            videos: [...m.videos]
              .map((v) => ({ id: v.id, name: v.name, durationSeconds: v.durationSeconds, thumbnail: v.thumbnail, number: videoNumber(v.name), usedIn: usedBy.get(v.id) ?? [] }))
              .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || String(a.name).localeCompare(String(b.name))),
          })),
        }
      : null;

    return { planet: { id: planet.id, slug: planet.slug, name: planet.name, vimeoFolderId: folderIdOf(planet.vimeoFolderUri) }, folder, folderError: error ?? null, courses, issues };
  }

  async save(me: AuthUser, idOrSlug: string, dto: VideoBoardSave) {
    const planet = await this.loadPlanet(idOrSlug);
    const units = new Map(planet.courses.flatMap((c) => c.units.map((u) => [u.id, { ...u, courseId: c.id }])));
    const lessons = new Map(planet.courses.flatMap((c) => c.units.flatMap((u) => u.lessons.map((l) => [l.id, { ...l, unitId: u.id }]))));
    const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

    for (const o of dto.unitOrder ?? []) {
      const c = planet.courses.find((x) => x.id === o.courseId);
      if (!c) throw new BadRequestException('Curso não pertence a este planeta');
      if (!sameSet(o.unitIds, c.units.map((u) => u.id))) throw new BadRequestException(`A nova ordem de "${c.title}" precisa ter todas as unidades do curso, uma vez cada`);
    }
    for (const o of dto.lessonOrder ?? []) {
      const u = units.get(o.unitId);
      if (!u) throw new BadRequestException('Unidade não pertence a este planeta');
      if (!sameSet(o.lessonIds, u.lessons.map((l) => l.id))) throw new BadRequestException(`A nova ordem de "${u.title}" precisa ter todas as etapas da unidade, uma vez cada`);
    }
    for (const t of dto.titles ?? []) if (!lessons.has(t.lessonId)) throw new BadRequestException('Etapa não pertence a este planeta');

    // vídeos: os da pasta já trazem hash, duração e miniatura; fora dela, consulta o Vimeo
    const needVideo = (dto.assignments ?? []).filter((a) => a.videoId);
    const { index } = needVideo.length ? await this.folderIndex(planet.vimeoFolderUri) : { index: new Map<string, FolderVideo>() };
    const resolved = new Map<string, { id: string; hash?: string; durationSeconds?: number; thumbnail?: string; link?: string }>();
    for (const a of dto.assignments ?? []) {
      const l = lessons.get(a.lessonId);
      if (!l) throw new BadRequestException('Etapa não pertence a este planeta');
      if (l.type !== 'VIDEO') throw new BadRequestException(`"${l.title}" não é uma etapa de vídeo`);
      if (a.videoId && !resolved.has(a.videoId)) {
        const v = index.get(a.videoId) ?? (await this.vimeo.getVideo(a.videoId));
        if (!v) throw new BadRequestException(`Vídeo ${a.videoId} não encontrado no Vimeo`);
        resolved.set(a.videoId, v);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const a of dto.assignments ?? []) {
        const v = a.videoId ? resolved.get(a.videoId)! : null;
        await tx.lesson.update({
          where: { id: a.lessonId },
          data: v
            ? { vimeoVideoId: v.id, vimeoHash: v.hash ?? null, vimeoUrl: v.link ?? `https://vimeo.com/${v.id}${v.hash ? `/${v.hash}` : ''}`, durationSeconds: v.durationSeconds ?? null, thumbnailUrl: v.thumbnail ?? null, vimeoSyncedAt: this.vimeo.enabled ? new Date() : null }
            : { vimeoVideoId: null, vimeoHash: null, vimeoUrl: null, thumbnailUrl: null, vimeoSyncedAt: null },
        });
      }
      for (const t of dto.titles ?? []) await tx.lesson.update({ where: { id: t.lessonId }, data: { title: t.title, ...(lessons.get(t.lessonId)!.type === 'VIDEO' ? { videoTitle: t.title } : {}) } });
      for (const o of dto.unitOrder ?? []) for (const [i, id] of o.unitIds.entries()) await tx.unit.update({ where: { id }, data: { sortOrder: i } });
      for (const o of dto.lessonOrder ?? []) for (const [i, id] of o.lessonIds.entries()) await tx.lesson.update({ where: { id }, data: { sortOrder: i } });
    });
    await this.audit.log(me, 'content.video_board', 'planet', planet.id, {
      assignments: dto.assignments?.length ?? 0, titles: dto.titles?.length ?? 0, unitOrder: dto.unitOrder?.length ?? 0, lessonOrder: dto.lessonOrder?.length ?? 0,
    });
    return this.board(planet.id);
  }
}
