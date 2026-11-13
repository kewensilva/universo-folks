import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CertificateType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuthUser } from '../common/types';
import { humanCode } from '../common/utils';
import { DEFAULT_COURSE_TEMPLATE, DEFAULT_PLANET_TEMPLATE } from './default-templates';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface IssueResult {
  courseCertificate?: { id: string; code: string };
  planetCertificate?: { id: string; code: string };
  blockedReason?: 'PREMIUM_REQUIRED';
}

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Emite o certificado do curso e, se for o último curso do planeta, o
   * certificado do PLANETA (com o nome de todos os cursos). Idempotente.
   * Regra: no modo B2C grátis os certificados ficam bloqueados (premium libera).
   */
  async issueForCourse(user: AuthUser, courseId: string, scorePct: number): Promise<IssueResult> {
    if (user.mode === 'B2C' && !(await this.access.isPremium(user))) return { blockedReason: 'PREMIUM_REQUIRED' };
    const tenantId = user.mode === 'TENANT' ? user.tenantId : undefined;

    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: courseId }, include: { planet: true } });
    if (!course.hasCertificate) return {};
    const student = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const tenant = tenantId ? await this.prisma.tenant.findUnique({ where: { id: tenantId } }) : null;

    let courseCert = await this.prisma.certificate.findFirst({
      where: { userId: user.id, courseId, type: 'COURSE', revokedAt: null },
      select: { id: true, code: true },
    });
    if (!courseCert) {
      const templateId = course.certTemplateId ?? (await this.defaultTemplateId('COURSE', tenantId));
      courseCert = await this.prisma.certificate.create({
        data: {
          code: await this.uniqueCode(),
          userId: user.id,
          type: 'COURSE',
          courseId,
          planetId: course.planetId,
          tenantId,
          templateId,
          scorePct,
          data: {
            studentName: student.name,
            courseTitle: course.title,
            planetName: course.planet.name,
            tenantName: tenant?.tradeName ?? null,
            scorePct,
          },
        },
        select: { id: true, code: true },
      });
    }

    // Certificado do planeta: todos os cursos certificáveis concluídos?
    const planetCourses = await this.prisma.course.findMany({
      where: { planetId: course.planetId, status: 'PUBLISHED', hasCertificate: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true },
    });
    const earned = await this.prisma.certificate.findMany({
      where: { userId: user.id, type: 'COURSE', revokedAt: null, courseId: { in: planetCourses.map((c) => c.id) } },
      select: { courseId: true },
    });
    let planetCert: { id: string; code: string } | null = null;
    if (planetCourses.length > 0 && earned.length === planetCourses.length) {
      planetCert = await this.prisma.certificate.findFirst({
        where: { userId: user.id, planetId: course.planetId, type: 'PLANET', revokedAt: null },
        select: { id: true, code: true },
      });
      if (!planetCert) {
        const templateId = course.planet.certTemplateId ?? (await this.defaultTemplateId('PLANET', tenantId));
        planetCert = await this.prisma.certificate.create({
          data: {
            code: await this.uniqueCode(),
            userId: user.id,
            type: 'PLANET',
            planetId: course.planetId,
            tenantId,
            templateId,
            data: {
              studentName: student.name,
              planetName: course.planet.name,
              tenantName: tenant?.tradeName ?? null,
              courses: planetCourses.map((c) => c.title),
            },
          },
          select: { id: true, code: true },
        });
      }
    }
    return { courseCertificate: courseCert, planetCertificate: planetCert ?? undefined };
  }

  /** Aluno que passou na prova no modo grátis e depois virou premium resgata o certificado. */
  async claim(user: AuthUser, courseId: string) {
    const passed = await this.prisma.examAttempt.findFirst({
      where: { userId: user.id, passed: true, exam: { courseId } },
      orderBy: { scorePct: 'desc' },
    });
    if (!passed) throw new ForbiddenException('Você ainda não foi aprovado na certificação deste curso');
    const r = await this.issueForCourse(user, courseId, passed.scorePct ?? 0);
    if (r.blockedReason) throw new ForbiddenException('Certificados são liberados no plano Premium');
    return r;
  }

  listMine(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId, revokedAt: null },
      orderBy: { issuedAt: 'desc' },
      select: { id: true, code: true, type: true, issuedAt: true, scorePct: true, data: true, courseId: true, planetId: true, tenantId: true },
    });
  }

  /** Verificação pública (QR code / link no certificado). */
  async verify(code: string) {
    const c = await this.prisma.certificate.findUnique({ where: { code } });
    if (!c) throw new NotFoundException('Certificado não encontrado');
    return { valid: !c.revokedAt, code: c.code, type: c.type, issuedAt: c.issuedAt, revokedAt: c.revokedAt, data: c.data };
  }

  async renderHtml(code: string, requester?: AuthUser) {
    const c = await this.prisma.certificate.findUnique({ where: { code }, include: { template: true } });
    if (!c || c.revokedAt) throw new NotFoundException('Certificado não encontrado');
    if (requester && requester.id !== c.userId && !this.access.isMaster(requester)) {
      const isAdmin = requester.tenantRole === 'ADMIN_CLIENTE' && requester.tenantId === c.tenantId;
      if (!isAdmin) throw new ForbiddenException();
    }
    const d = c.data as Record<string, any>;
    const html = c.template?.html ?? (c.type === 'PLANET' ? DEFAULT_PLANET_TEMPLATE : DEFAULT_COURSE_TEMPLATE);
    const vars: Record<string, string> = {
      studentName: esc(d.studentName),
      courseTitle: esc(d.courseTitle),
      planetName: esc(d.planetName),
      tenantName: d.tenantName ? `· ${esc(d.tenantName)}` : '',
      scorePct: esc(d.scorePct ?? c.scorePct ?? ''),
      courseList: Array.isArray(d.courses) ? `<ul>${d.courses.map((t: string) => `<li>${esc(t)}</li>`).join('')}</ul>` : '',
      issuedAt: c.issuedAt.toLocaleDateString('pt-BR'),
      code: esc(c.code),
      verifyUrl: esc(`${this.config.get('APP_URL', '')}/api/certificates/verify/${c.code}`),
    };
    return html.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  }

  async revoke(code: string) {
    return this.prisma.certificate.update({ where: { code }, data: { revokedAt: new Date() }, select: { code: true, revokedAt: true } });
  }

  // ------------------------------------------------------------- templates
  listTemplates(tenantId?: string) {
    return this.prisma.certificateTemplate.findMany({
      where: tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {},
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async saveTemplate(data: { id?: string; name: string; type: CertificateType; html: string; layout?: unknown; tenantId?: string | null; isDefault?: boolean }) {
    const payload = {
      name: data.name,
      type: data.type,
      html: data.html,
      layout: (data.layout ?? undefined) as Prisma.InputJsonValue | undefined,
      tenantId: data.tenantId ?? null,
      isDefault: data.isDefault ?? false,
    };
    return this.prisma.$transaction(async (tx) => {
      if (payload.isDefault) {
        await tx.certificateTemplate.updateMany({ where: { type: payload.type, tenantId: payload.tenantId }, data: { isDefault: false } });
      }
      return data.id
        ? tx.certificateTemplate.update({ where: { id: data.id }, data: payload })
        : tx.certificateTemplate.create({ data: payload });
    });
  }

  deleteTemplate(id: string) {
    return this.prisma.certificateTemplate.delete({ where: { id } });
  }

  async previewTemplate(id: string) {
    const t = await this.prisma.certificateTemplate.findUniqueOrThrow({ where: { id } });
    const sample: Record<string, string> = {
      studentName: 'Nome do Aluno',
      courseTitle: 'Comunicação Assertiva',
      planetName: 'Comunicação',
      tenantName: '· Empresa Exemplo',
      scorePct: '92',
      courseList: '<ul><li>Comunicação Assertiva</li><li>Comunicação Não Violenta</li></ul>',
      issuedAt: new Date().toLocaleDateString('pt-BR'),
      code: 'FK-XXXX-XXXX',
      verifyUrl: '#',
    };
    return t.html.replace(/\{\{(\w+)\}\}/g, (_, k) => sample[k] ?? '');
  }

  // --------------------------------------------------------------- helpers
  private async defaultTemplateId(type: CertificateType, tenantId?: string) {
    const t =
      (tenantId && (await this.prisma.certificateTemplate.findFirst({ where: { type, tenantId, isDefault: true } }))) ||
      (await this.prisma.certificateTemplate.findFirst({ where: { type, tenantId: null, isDefault: true } }));
    return t?.id;
  }

  private async uniqueCode() {
    for (;;) {
      const code = humanCode('FK', 2);
      if (!(await this.prisma.certificate.findUnique({ where: { code } }))) return code;
    }
  }
}
