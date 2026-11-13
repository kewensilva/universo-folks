import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dayInTz } from '../common/utils';
import { SeatsService } from '../access/seats.service';

export type Mode = 'week' | 'month';
export type PersonStatus = 'INVITED' | 'ON_TRACK' | 'LATE' | 'NOT_STARTED' | 'DONE';
export const STATUS_LABEL: Record<PersonStatus, string> = {
  INVITED: 'Convite enviado',
  ON_TRACK: 'Em dia',
  LATE: 'Atrasado',
  NOT_STARTED: 'Não começou',
  DONE: 'Concluiu',
};

export interface EngPoint {
  label: string;
  start: string;
  /** média diária de pessoas engajadas ÷ usuários (0..1) */
  rate: number;
  ratePct: number;
  /** pessoas engajadas por dia (média) */
  daily: number;
  /** pessoas diferentes no período */
  unique: number;
  users: number;
}

export interface PersonTrack {
  assignmentId: string;
  title: string;
  courseIds: string[];
  progress: number;
  due: string | null;
  mandatory: boolean;
}

export interface Person {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  departments: Array<{ id: string; name: string }>;
  status: PersonStatus;
  statusLabel: string;
  progress: number;
  progressPct: number;
  lastActivity: string | null;
  tracks: PersonTrack[];
}

const TZ = 'America/Sao_Paulo';
const DAY = 86400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** CSV no formato que o Excel em português abre direto: separador ";" e BOM UTF-8. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}
const pctStr = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Indicadores da empresa vindos do protótipo:
 *  - situação de cada pessoa nas trilhas obrigatórias (em dia, atrasado...)
 *  - engajamento semanal/mensal (pessoa engajada = ≥1 atividade no dia, fuso SP)
 *  - relatórios CSV
 */
@Injectable()
export class CompanyInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seats: SeatsService,
  ) {}

  licensesUsed(tenantId: string) {
    return this.prisma.membership.count({ where: { tenantId, status: { in: ['ACTIVE', 'INVITED'] } } });
  }

  // ------------------------------------------------------------- pessoas
  async people(tenantId: string): Promise<Person[]> {
    const [members, assignments] = await Promise.all([
      this.prisma.membership.findMany({
        where: { tenantId, status: { in: ['ACTIVE', 'INVITED'] } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          departments: { include: { department: { select: { id: true, name: true } } } },
        },
        orderBy: { user: { name: 'asc' } },
      }),
      this.prisma.assignment.findMany({
        where: { tenantId },
        include: {
          course: { select: { id: true, title: true } },
          planet: { select: { name: true, courses: { where: { status: 'PUBLISHED' }, select: { id: true } } } },
        },
        orderBy: [{ mandatory: 'desc' }, { priority: 'asc' }],
      }),
    ]);
    const userIds = members.map((m) => m.userId);
    const courseIds = [...new Set(assignments.flatMap((a) => (a.courseId ? [a.courseId] : a.planet?.courses.map((c) => c.id) ?? [])))];
    const [enrollments, last] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId: { in: userIds }, courseId: { in: courseIds } }, select: { userId: true, courseId: true, progressPct: true } }),
      this.prisma.activityEvent.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _max: { day: true } }),
    ]);
    const prog = new Map(enrollments.map((e) => [`${e.userId}|${e.courseId}`, e.progressPct / 100]));
    const lastDay = new Map(last.map((l) => [l.userId, l._max.day ? iso(l._max.day) : null]));
    const today = iso(dayInTz(new Date(), TZ));

    return members.map((m) => {
      const depts = new Set(m.departments.map((d) => d.departmentId));
      const mine: PersonTrack[] = assignments
        .filter((a) => (a.membershipId ? a.membershipId === m.id : a.departmentId ? depts.has(a.departmentId) : true))
        .map((a) => {
          const ids = a.courseId ? [a.courseId] : a.planet?.courses.map((c) => c.id) ?? [];
          const p = ids.length ? ids.reduce((s, id) => s + (prog.get(`${m.userId}|${id}`) ?? 0), 0) / ids.length : 0;
          return { assignmentId: a.id, title: a.course?.title ?? a.planet?.name ?? '', courseIds: ids, progress: p, due: a.dueDate ? iso(a.dueDate) : null, mandatory: a.mandatory };
        });
      const progress = mine.length ? mine.reduce((s, t) => s + t.progress, 0) / mine.length : 0;
      const lastActivity = lastDay.get(m.userId) ?? null;
      let status: PersonStatus;
      if (m.status === 'INVITED') status = 'INVITED';
      else if (mine.length && mine.every((t) => t.progress >= 1)) status = 'DONE';
      else if (mine.some((t) => t.progress < 1 && t.due && t.due < today)) status = 'LATE';
      else if (!lastActivity) status = 'NOT_STARTED';
      else status = 'ON_TRACK';
      return {
        membershipId: m.id,
        userId: m.userId,
        name: m.user.name || m.user.email,
        email: m.user.email,
        role: m.role,
        departments: m.departments.map((d) => d.department),
        status,
        statusLabel: STATUS_LABEL[status],
        progress,
        progressPct: Math.round(progress * 100),
        lastActivity,
        tracks: mine,
      };
    });
  }

  // ---------------------------------------------------------- engajamento
  /**
   * Engajamento em N períodos (semanas começando na segunda ou meses).
   * tenantId nulo = plataforma inteira (todos os usuários).
   */
  async engagement(tenantId: string | null, mode: Mode, periods = 8): Promise<EngPoint[]> {
    const today = dayInTz(new Date(), TZ);
    const starts: Date[] = [];
    if (mode === 'week') {
      const dow = (today.getUTCDay() + 6) % 7; // segunda = 0
      const cur = new Date(today.getTime() - dow * DAY);
      for (let i = periods - 1; i >= 0; i--) starts.push(new Date(cur.getTime() - 7 * i * DAY));
    } else {
      for (let i = periods - 1; i >= 0; i--) starts.push(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1)));
    }
    const scope = tenantId ? Prisma.sql`AND tenant_id = ${tenantId}::uuid` : Prisma.empty;
    const unit = mode === 'week' ? 'week' : 'month';
    const rows = await this.prisma.$queryRaw<Array<{ p: Date; ud: bigint; uu: bigint }>>(Prisma.sql`
      SELECT date_trunc(${unit}, day::timestamp)::date AS p,
             COUNT(DISTINCT (user_id, day)) AS ud,
             COUNT(DISTINCT user_id) AS uu
      FROM activity_events WHERE day >= ${starts[0]}::date ${scope}
      GROUP BY 1`);
    const users = tenantId
      ? await this.licensesUsed(tenantId)
      : await this.prisma.user.count({ where: { deletedAt: null, platformRole: 'USER' } });
    return starts.map((s, idx) => {
      const r = rows.find((x) => iso(new Date(x.p)) === iso(s));
      const next = idx < starts.length - 1 ? starts[idx + 1] : mode === 'week' ? new Date(s.getTime() + 7 * DAY) : new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1));
      const days = Math.max(1, Math.min(Math.round((next.getTime() - s.getTime()) / DAY), Math.round((today.getTime() - s.getTime()) / DAY) + 1));
      const ud = Number(r?.ud ?? 0);
      const rate = users ? Math.min(1, ud / days / users) : 0;
      return {
        label: mode === 'week' ? `${String(s.getUTCDate()).padStart(2, '0')}/${String(s.getUTCMonth() + 1).padStart(2, '0')}` : `${MESES[s.getUTCMonth()]}/${String(s.getUTCFullYear()).slice(2)}`,
        start: iso(s),
        rate,
        ratePct: Math.round(rate * 100),
        daily: Math.round(ud / days),
        unique: Number(r?.uu ?? 0),
        users,
      };
    });
  }

  // ------------------------------------------------------------ resumo
  async summary(tenantId: string) {
    const [people, weekly, monthly, certificates] = await Promise.all([
      this.people(tenantId),
      this.engagement(tenantId, 'week'),
      this.engagement(tenantId, 'month'),
      this.prisma.certificate.count({ where: { tenantId, revokedAt: null } }),
    ]);
    const withTracks = people.filter((p) => p.tracks.length && p.status !== 'INVITED');
    const trackCompletion = withTracks.length
      ? withTracks.reduce((a, p) => a + p.tracks.filter((t) => t.progress >= 1).length / p.tracks.length, 0) / withTracks.length
      : 0;
    const count = (s: PersonStatus) => people.filter((p) => p.status === s).length;
    return {
      people: people.length,
      statusCounts: { INVITED: count('INVITED'), ON_TRACK: count('ON_TRACK'), LATE: count('LATE'), NOT_STARTED: count('NOT_STARTED'), DONE: count('DONE') },
      trackCompletionPct: Math.round(trackCompletion * 100),
      certificates,
      engagement: { week: weekly, month: monthly },
      weeklyActive: weekly.map((w) => ({ label: w.label, unique: w.unique })),
    };
  }

  // -------------------------------------------------------------- CSV
  async companyReportCsv(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const [seats, W, M, people] = await Promise.all([this.seats.usage(tenantId), this.engagement(tenantId, 'week'), this.engagement(tenantId, 'month'), this.people(tenantId)]);
    const lim = (n: number) => (n > 0 ? n : 'sem limite');
    return toCsv([
      ['Relatório Folks Poplearning', t.tradeName],
      ['Gerado em', new Date().toLocaleDateString('pt-BR', { timeZone: TZ })],
      ['Colaboradores', seats.collaborators.used, 'Limite', lim(seats.collaborators.max), 'Administradores', seats.admins.used, 'Limite', lim(seats.admins.max)],
      ['Contrato', t.planLabel ?? '', 'Situação', t.status === 'ACTIVE' ? 'ativa' : 'suspensa'],
      [],
      ['Engajamento semanal'],
      ['Semana (início)', 'Engajamento diário médio', 'Pessoas engajadas por dia (média)', 'Pessoas diferentes na semana', 'Usuários'],
      ...W.map((d) => [d.label, pctStr(d.rate), d.daily, d.unique, d.users]),
      [],
      ['Engajamento mensal'],
      ['Mês', 'Engajamento diário médio', 'Pessoas engajadas por dia (média)', 'Pessoas diferentes no mês', 'Usuários'],
      ...M.map((d) => [d.label, pctStr(d.rate), d.daily, d.unique, d.users]),
      [],
      ['Pessoas'],
      ['Nome', 'E-mail', 'Departamentos', 'Situação', 'Progresso nas trilhas', 'Última atividade'],
      ...people.map((p) => [p.name, p.email, p.departments.map((d) => d.name).join(', '), p.statusLabel, pctStr(p.progress), p.lastActivity ?? '']),
    ]);
  }

  /** Visão geral da Folks (protótipo "ADM Folks · Visão geral"). */
  async masterOverview() {
    const tenants = await this.prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { tradeName: 'asc' },
      select: { id: true, tradeName: true, initials: true, color: true, status: true, planLabel: true, type: true },
    });
    const rows = [];
    for (const t of tenants) {
      const [seats, w, m] = await Promise.all([this.seats.usage(t.id), this.engagement(t.id, 'week', 2), this.engagement(t.id, 'month', 1)]);
      const used = seats.collaborators.used;
      const limit = seats.collaborators.max;
      rows.push({
        tenantId: t.id, name: t.tradeName, initials: t.initials, color: t.color, type: t.type, status: t.status, plan: t.planLabel,
        used, limit, usagePct: limit ? Math.round((used / limit) * 100) : 0,
        admins: seats.admins,
        weekRatePct: w[1].ratePct, weekDeltaPct: w[1].ratePct - w[0].ratePct, monthRatePct: m[0].ratePct, monthUnique: m[0].unique,
        atLimit: limit > 0 && used >= limit, nearLimit: limit > 0 && used / limit >= 0.9,
      });
    }
    const active = rows.filter((r) => r.status === 'ACTIVE');
    const now = new Date();
    const [published, totalCourses, personal, premium, week, month] = await Promise.all([
      this.prisma.course.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.course.count({ where: { status: { not: 'ARCHIVED' } } }),
      this.prisma.user.count({ where: { deletedAt: null, platformRole: 'USER', memberships: { none: { status: { in: ['ACTIVE', 'INVITED'] } } } } }),
      this.prisma.user.count({ where: { deletedAt: null, subscriptions: { some: { status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: now }, plan: { audience: 'B2C' } } } } }),
      this.engagement(null, 'week'),
      this.engagement(null, 'month'),
    ]);
    return {
      companies: { active: active.length, total: rows.length },
      companyUsers: { used: active.reduce((a, r) => a + r.used, 0), limit: active.reduce((a, r) => a + r.limit, 0) },
      courses: { published, total: totalCourses },
      personalUsers: { total: personal, premium },
      engagement: { week, month },
      byCompany: rows.sort((a, b) => b.weekRatePct - a.weekRatePct),
      alerts: active
        .flatMap((r) => [
          ...(r.atLimit || r.nearLimit
            ? [{ tenantId: r.tenantId, level: r.atLimit ? 'LIMIT' : 'NEAR_LIMIT', message: r.atLimit ? `${r.name} chegou no limite de colaboradores` : `${r.name} está com ${r.usagePct}% das licenças de colaboradores em uso` }]
            : []),
          ...(r.admins.max > 0 && r.admins.used >= r.admins.max ? [{ tenantId: r.tenantId, level: 'ADMIN_LIMIT', message: `${r.name} usa todas as ${r.admins.max} licenças de administrador` }] : []),
        ]),
    };
  }

  async masterReportCsv() {
    const o = await this.masterOverview();
    return toCsv([
      ['Relatório geral Folks Poplearning'],
      ['Gerado em', new Date().toLocaleDateString('pt-BR', { timeZone: TZ })],
      ['Empresas ativas', o.companies.active, 'Usuários de empresas', o.companyUsers.used, 'Usuários individuais', o.personalUsers.total, 'Premium', o.personalUsers.premium],
      [],
      ['Engajamento geral semanal'],
      ['Semana', 'Engajamento diário médio', 'Pessoas por dia', 'Pessoas diferentes', 'Usuários'],
      ...o.engagement.week.map((d) => [d.label, `${d.ratePct}%`, d.daily, d.unique, d.users]),
      [],
      ['Empresas'],
      ['Empresa', 'Tipo', 'Situação', 'Contrato', 'Colaboradores', 'Limite colaboradores', 'Uso das licenças', 'Administradores', 'Limite administradores', 'Engajamento semana', 'Variação', 'Engajamento mês', 'Pessoas diferentes no mês'],
      ...o.byCompany.map((r) => [r.name, r.type, r.status === 'ACTIVE' ? 'ativa' : r.status.toLowerCase(), r.plan, r.used, r.limit || 'sem limite', `${r.usagePct}%`, r.admins.used, r.admins.max || 'sem limite', `${r.weekRatePct}%`, `${r.weekDeltaPct >= 0 ? '+' : ''}${r.weekDeltaPct} p.p.`, `${r.monthRatePct}%`, r.monthUnique]),
    ]);
  }
}
