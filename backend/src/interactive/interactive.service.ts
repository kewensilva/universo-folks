import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import AdmZip from 'adm-zip';
import { randomUUID } from 'crypto';
import { InteractivePackage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LearningService } from '../learning/learning.service';
import { AuthUser } from '../common/types';
import { parsePackage } from './package-parser';

export interface LaunchClaims {
  sub: string;
  lid: string; // lessonId
  pid: string; // packageId
  reg: string; // registration
  aid: string; // activityId raiz
  mode: AuthUser['mode'];
  tid?: string;
  mid?: string;
  typ: 'launch';
}

const COMPLETION_VERBS = new Set([
  'http://adlnet.gov/expapi/verbs/completed',
  'http://adlnet.gov/expapi/verbs/passed',
  'http://adlnet.gov/expapi/verbs/mastered',
]);

/**
 * Conteúdo interativo (vídeos/atividades em que o aluno interage):
 *  - SCORM 1.2 / 2004: o front usa um runtime JS (ex.: scorm-again) e faz
 *    commit do cmi.* em /api/interactive/scorm/commit
 *  - xAPI / cmi5: o conteúdo envia statements direto para o LRS embutido
 *    (/api/xapi/*), autenticado por um token de launch de curta duração.
 * Conclusão/aprovação vira LessonProgress + XP pelo mesmo fluxo das lições.
 */
@Injectable()
export class InteractiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly learning: LearningService,
  ) {}

  // ---------------------------------------------------------------- pacotes
  async upload(user: AuthUser, file: Express.Multer.File, title?: string) {
    if (!file?.buffer) throw new BadRequestException('Envie o arquivo .zip do pacote');
    let zip: AdmZip;
    let parsed;
    try {
      zip = new AdmZip(file.buffer);
      parsed = parsePackage(zip);
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? 'Pacote inválido');
    }
    const id = randomUUID();
    const dir = `interactive/${id}`;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      await this.storage.write(`${dir}/${entry.entryName}`, entry.getData()); // safePath bloqueia zip-slip
    }
    return this.prisma.interactivePackage.create({
      data: {
        id,
        title: title ?? parsed.title ?? file.originalname,
        standard: parsed.standard,
        activityId: parsed.activityId ?? `${this.config.get('APP_URL')}/xapi/activities/${id}`,
        storagePath: dir,
        launchPath: parsed.launchPath,
        manifest: parsed.manifest as Prisma.InputJsonValue,
        uploadedById: user.id,
      },
    });
  }

  list() {
    return this.prisma.interactivePackage.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, standard: true, activityId: true, launchPath: true, version: true, createdAt: true, _count: { select: { lessons: true } } },
    });
  }

  async remove(id: string) {
    const p = await this.prisma.interactivePackage.findUniqueOrThrow({ where: { id } });
    await this.prisma.interactivePackage.delete({ where: { id } });
    await this.storage.removeDir(p.storagePath);
    return { deleted: true };
  }

  filePath(packageId: string, rel: string) {
    return this.storage.safePath('interactive', packageId, rel);
  }

  // ----------------------------------------------------------------- launch
  async launch(user: AuthUser, lessonId: string) {
    const { lesson } = await this.learning.assertLessonUnlocked(user, lessonId);
    if (lesson.type !== 'INTERACTIVE' || !lesson.interactivePackageId) throw new BadRequestException('Lição não é interativa');
    const pkg = await this.prisma.interactivePackage.findUniqueOrThrow({ where: { id: lesson.interactivePackageId } });
    const registration = randomUUID();
    const claims: LaunchClaims = {
      sub: user.id, lid: lesson.id, pid: pkg.id, reg: registration, aid: pkg.activityId!, mode: user.mode, tid: user.tenantId, mid: user.membershipId, typ: 'launch',
    };
    const token = await this.jwt.signAsync(claims, { secret: this.secret(), expiresIn: '6h' });
    const api = `${this.config.get('APP_URL')}/api`;
    const contentUrl = `${api}/interactive/content/${pkg.id}/${pkg.launchPath}`;
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } });
    const actor = { objectType: 'Agent', name: me.name, account: { homePage: this.config.get('APP_URL'), name: user.id } };

    if (pkg.standard === 'SCORM_12' || pkg.standard === 'SCORM_2004') {
      const state = await this.prisma.scormRuntimeState.findUnique({ where: { userId_lessonId_packageId: { userId: user.id, lessonId, packageId: pkg.id } } });
      return {
        standard: pkg.standard,
        contentUrl,
        runtime: { library: 'scorm-again', version: pkg.standard === 'SCORM_12' ? '1.2' : '2004', commitUrl: `${api}/interactive/scorm/commit`, token, initialCmi: state?.cmi ?? {} },
      };
    }

    const lrs = `${api}/xapi/`;
    const auth = `Basic ${Buffer.from(`launch:${token}`).toString('base64')}`;
    const sep = contentUrl.includes('?') ? '&' : '?';
    if (pkg.standard === 'CMI5') {
      const q = new URLSearchParams({
        endpoint: lrs,
        fetch: `${api}/xapi/cmi5/fetch?token=${encodeURIComponent(token)}`,
        actor: JSON.stringify(actor),
        registration,
        activityId: pkg.activityId!,
      });
      return { standard: pkg.standard, launchUrl: `${contentUrl}${sep}${q}` };
    }
    const q = new URLSearchParams({ endpoint: lrs, auth, actor: JSON.stringify(actor), registration, activity_id: pkg.activityId! });
    return { standard: pkg.standard, launchUrl: `${contentUrl}${sep}${q}` };
  }

  async verifyLaunchToken(token: string): Promise<LaunchClaims> {
    try {
      const c = await this.jwt.verifyAsync<LaunchClaims>(token, { secret: this.secret() });
      if (c.typ !== 'launch') throw new Error();
      return c;
    } catch {
      throw new UnauthorizedException('Token de launch inválido');
    }
  }

  /** Extrai o token de launch de "Authorization: Basic base64(launch:<token>)" ou "Bearer <token>". */
  async claimsFromHeader(header?: string): Promise<LaunchClaims> {
    if (!header) throw new UnauthorizedException();
    if (header.startsWith('Bearer ')) return this.verifyLaunchToken(header.slice(7));
    if (header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString();
      return this.verifyLaunchToken(decoded.slice(decoded.indexOf(':') + 1));
    }
    throw new UnauthorizedException();
  }

  // ------------------------------------------------------------ SCORM commit
  async scormCommit(claims: LaunchClaims, cmi: Record<string, any>) {
    const pkg = await this.prisma.interactivePackage.findUniqueOrThrow({ where: { id: claims.pid } });
    const is12 = pkg.standard === 'SCORM_12';
    const get = (path: string) => path.split('.').reduce<any>((o, k) => o?.[k], cmi);
    const completion = is12 ? get('cmi.core.lesson_status') ?? get('core.lesson_status') : get('cmi.completion_status') ?? get('completion_status');
    const success = is12 ? null : get('cmi.success_status') ?? get('success_status');
    const raw = Number(is12 ? get('cmi.core.score.raw') ?? get('core.score.raw') : get('cmi.score.raw') ?? get('score.raw'));
    const max = Number(is12 ? get('cmi.core.score.max') ?? get('core.score.max') ?? 100 : get('cmi.score.max') ?? get('score.max') ?? 100);
    const scaled = Number(get('cmi.score.scaled') ?? get('score.scaled'));
    const scorePct = !isNaN(scaled) ? Math.round(scaled * 100) : !isNaN(raw) && max > 0 ? Math.round((raw / max) * 100) : undefined;

    await this.prisma.scormRuntimeState.upsert({
      where: { userId_lessonId_packageId: { userId: claims.sub, lessonId: claims.lid, packageId: claims.pid } },
      create: { userId: claims.sub, lessonId: claims.lid, packageId: claims.pid, cmi, completionStatus: completion, successStatus: success, scoreScaled: scorePct != null ? scorePct / 100 : null },
      update: { cmi, completionStatus: completion, successStatus: success, scoreScaled: scorePct != null ? scorePct / 100 : null },
    });

    const done = is12 ? ['completed', 'passed'].includes(completion) : completion === 'completed' || success === 'passed';
    const failed = is12 ? completion === 'failed' : success === 'failed';
    if (done && !failed) return { saved: true, ...(await this.complete(claims, scorePct)) };
    return { saved: true, completed: false };
  }

  // -------------------------------------------------------------------- LRS
  async storeStatements(claims: LaunchClaims, body: any, forcedId?: string) {
    const list = Array.isArray(body) ? body : [body];
    const ids: string[] = [];
    let completion: unknown = null;
    for (const raw of list) {
      const st = { ...raw };
      st.id = forcedId ?? st.id ?? randomUUID();
      st.stored = new Date().toISOString();
      st.timestamp = st.timestamp ?? st.stored;
      st.authority = { objectType: 'Agent', account: { homePage: this.config.get('APP_URL'), name: 'universo-folks-lrs' } };
      if (!st.verb?.id || !st.object) throw new BadRequestException('Statement sem verb/object');
      const verbId: string = st.verb.id;
      const activityId: string = st.object.id ?? '';
      const voidedTarget = verbId === 'http://adlnet.gov/expapi/verbs/voided' ? st.object.id : null;

      await this.prisma.xapiStatement.upsert({
        where: { id: st.id },
        create: {
          id: st.id,
          userId: claims.sub,
          lessonId: claims.lid,
          registration: st.context?.registration ?? claims.reg,
          verbId,
          activityId,
          resultCompletion: st.result?.completion ?? null,
          resultSuccess: st.result?.success ?? null,
          resultScore: st.result?.score?.scaled ?? null,
          statement: st,
          timestamp: new Date(st.timestamp),
        },
        update: {},
      });
      if (voidedTarget) await this.prisma.xapiStatement.updateMany({ where: { id: voidedTarget }, data: { voided: true } });
      ids.push(st.id);

      const isRoot = activityId === claims.aid || activityId.startsWith(claims.aid);
      const completes = COMPLETION_VERBS.has(verbId) || (st.result?.completion === true && st.result?.success !== false);
      if (isRoot && completes && st.result?.success !== false) {
        const scaled = st.result?.score?.scaled;
        completion = await this.complete(claims, typeof scaled === 'number' ? Math.round(scaled * 100) : undefined);
      }
    }
    return { ids, completion };
  }

  async queryStatements(claims: LaunchClaims, q: Record<string, string>) {
    if (q.statementId || q.voidedStatementId) {
      const s = await this.prisma.xapiStatement.findFirst({ where: { id: q.statementId ?? q.voidedStatementId, userId: claims.sub } });
      if (!s) throw new NotFoundException();
      return s.statement;
    }
    const rows = await this.prisma.xapiStatement.findMany({
      where: {
        userId: claims.sub,
        voided: false,
        ...(q.verb ? { verbId: q.verb } : {}),
        ...(q.activity ? { activityId: q.activity } : {}),
        ...(q.registration ? { registration: q.registration } : {}),
        ...(q.since ? { stored: { gt: new Date(q.since) } } : {}),
      },
      orderBy: { stored: q.ascending === 'true' ? 'asc' : 'desc' },
      take: Math.min(Number(q.limit) || 100, 500),
    });
    return { statements: rows.map((r) => r.statement), more: '' };
  }

  async getDocument(kind: string, q: Record<string, string>, claims: LaunchClaims) {
    const where = this.docWhere(kind, q, claims);
    if (!q.stateId && !q.profileId) {
      const docs = await this.prisma.xapiDocument.findMany({ where: { kind, activityId: where.activityId, agentKey: where.agentKey, registration: where.registration }, select: { documentId: true } });
      return { list: docs.map((d) => d.documentId) };
    }
    const d = await this.prisma.xapiDocument.findUnique({ where: { kind_activityId_agentKey_registration_documentId: where } });
    if (!d) throw new NotFoundException();
    return { doc: d };
  }

  async putDocument(kind: string, q: Record<string, string>, claims: LaunchClaims, contents: Buffer, contentType: string, merge: boolean) {
    const where = this.docWhere(kind, q, claims);
    let data = contents;
    if (merge && contentType.includes('json')) {
      const cur = await this.prisma.xapiDocument.findUnique({ where: { kind_activityId_agentKey_registration_documentId: where } });
      if (cur) data = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cur.contents).toString() || '{}'), ...JSON.parse(contents.toString() || '{}') }));
    }
    const etag = `"${randomUUID()}"`;
    await this.prisma.xapiDocument.upsert({
      where: { kind_activityId_agentKey_registration_documentId: where },
      create: { ...where, contents: new Uint8Array(data), contentType, etag },
      update: { contents: new Uint8Array(data), contentType, etag },
    });
  }

  async deleteDocument(kind: string, q: Record<string, string>, claims: LaunchClaims) {
    const where = this.docWhere(kind, q, claims);
    await this.prisma.xapiDocument.deleteMany({ where });
  }

  /** Documentos sempre isolados pelo usuário do token (agentKey = userId). */
  private docWhere(kind: string, q: Record<string, string>, claims: LaunchClaims) {
    return {
      kind,
      activityId: q.activityId ?? '',
      agentKey: claims.sub,
      registration: q.registration ?? '',
      documentId: q.stateId ?? q.profileId ?? '',
    };
  }

  // ---------------------------------------------------------------- helpers
  private async complete(claims: LaunchClaims, scorePct?: number) {
    const lesson = await this.prisma.lesson.findUniqueOrThrow({ where: { id: claims.lid }, include: { unit: { select: { courseId: true } } } });
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: claims.sub } });
    const authUser: AuthUser = { id: u.id, email: u.email, name: u.name, platformRole: u.platformRole, mode: claims.mode, tenantId: claims.tid, membershipId: claims.mid };
    return this.learning.completeLesson(authUser, lesson, { xp: lesson.xpReward, scorePct });
  }

  private secret() {
    return `${this.config.getOrThrow('JWT_ACCESS_SECRET')}:launch`;
  }

  packageById(id: string): Promise<InteractivePackage | null> {
    return this.prisma.interactivePackage.findUnique({ where: { id } });
  }
}
