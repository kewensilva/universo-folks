/**
 * Seed da plataforma.
 *   npm run db:seed                 -> base: categorias, MASTER, catálogo do protótipo (content/catalog.json), hangar, templates, planos
 *   npm run db:seed -- --force-content  -> regrava as trilhas a partir do JSON (só cursos sem progresso)
 *   SEED_DEMO=true npm run db:seed  -> + empresa de exemplo "Órbita Logística" com pessoas, trilhas e 8 semanas de atividade
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ActivityKind, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { CatalogImportService, ProtoCatalog } from '../src/content/catalog-import.service';
import { DEFAULT_COURSE_TEMPLATE, DEFAULT_PLANET_TEMPLATE } from '../src/certificates/default-templates';

const prisma = new PrismaClient();
const DAY = 86400_000;

async function base() {
  // categorias (o importador cria "para-a-vida" e "para-o-trabalho"; "para-a-escola" vem da arquitetura)
  for (const c of [
    { slug: 'para-a-vida', name: 'Para a vida', description: 'Conhecimentos para o âmbito pessoal', sortOrder: 0 },
    { slug: 'para-o-trabalho', name: 'Para o trabalho', description: 'Treinamentos profissionais', sortOrder: 1 },
    { slug: 'para-a-escola', name: 'Para a escola', description: 'Conteúdos escolares', sortOrder: 2 },
  ]) {
    await prisma.studyCategory.upsert({ where: { slug: c.slug }, create: c, update: {} });
  }

  // Planos de acesso vêm da migração, mas num banco novo a migração roda antes das galáxias
  // existirem: liga o Premium a "Para a vida" e "Para o trabalho" se ele nunca foi editado.
  const premium = await prisma.planTier.findUnique({ where: { code: 'premium' }, include: { _count: { select: { categories: true } } } });
  if (premium && premium._count.categories === 0 && premium.updatedAt.getTime() === premium.createdAt.getTime()) {
    const cats = await prisma.studyCategory.findMany({ where: { slug: { in: ['para-a-vida', 'para-o-trabalho'] } } });
    await prisma.planTierCategory.createMany({ data: cats.map((c) => ({ tierId: premium.id, categoryId: c.id })), skipDuplicates: true });
  }

  const email = (process.env.SEED_MASTER_EMAIL ?? 'master@folks.com.br').toLowerCase();
  const password = process.env.SEED_MASTER_PASSWORD ?? 'TroqueEssaSenha123';
  const master = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Master Folks',
      displayName: 'Master',
      passwordHash: await bcrypt.hash(password, 11),
      platformRole: 'MASTER_FOLKS',
      preferences: { create: {} },
      gamification: { create: {} },
    },
    update: { platformRole: 'MASTER_FOLKS' },
  });

  for (const [type, name, html] of [
    ['COURSE', 'Padrão Folks - Curso', DEFAULT_COURSE_TEMPLATE],
    ['PLANET', 'Padrão Folks - Planeta', DEFAULT_PLANET_TEMPLATE],
  ] as const) {
    const exists = await prisma.certificateTemplate.findFirst({ where: { type, tenantId: null, isDefault: true } });
    if (!exists) await prisma.certificateTemplate.create({ data: { type, name, html, isDefault: true } });
  }

  // planos (valores ainda não definidos: INATIVOS com preço 0). Vincule os product ids da loja/RevenueCat.
  for (const p of [
    { code: 'b2c-premium-monthly', name: 'Premium Mensal', audience: 'B2C' as const, interval: 'MONTHLY' as const },
    { code: 'b2c-premium-yearly', name: 'Premium Anual', audience: 'B2C' as const, interval: 'YEARLY' as const },
    { code: 'b2b-seat-yearly', name: 'Empresa - por colaborador/ano', audience: 'B2B' as const, interval: 'YEARLY' as const },
  ]) {
    // os planos de acesso (Básico, Premium, Premium Plus) vêm da migração; o Premium mensal/anual libera o Premium
    const tier = p.audience === 'B2C' ? await prisma.planTier.findUnique({ where: { code: 'premium' } }) : null;
    await prisma.plan.upsert({ where: { code: p.code }, create: { ...p, priceCents: 0, isActive: false, tierId: tier?.id }, update: {} });
  }
  return master;
}

/** Empresa de exemplo baseada no "demo" do protótipo. */
async function demo(catalog: any) {
  const d = catalog.demo?.orbita;
  if (!d) return;
  let tenant = await prisma.tenant.findUnique({ where: { joinCode: d.code } });
  if (tenant) return;
  tenant = await prisma.tenant.create({
    data: {
      legalName: `${d.name} LTDA`,
      tradeName: d.name,
      joinCode: d.code,
      initials: d.ini,
      color: d.col,
      planLabel: 'Anual',
      contactEmail: `rh@${d.domain}`,
      settings: { create: { maxCollaborators: d.licenses, maxAdmins: 3, passingScore: 80 } },
    },
  });
  const deps = new Map<string, string>();
  for (const name of d.areas as string[]) deps.set(name, (await prisma.department.create({ data: { tenantId: tenant.id, name } })).id);
  deps.set('Gestores', (await prisma.department.create({ data: { tenantId: tenant.id, name: 'Gestores' } })).id);

  const pw = await bcrypt.hash('demo1234', 11);
  const admin = await prisma.user.create({
    data: { email: `admin@${d.domain.replace('.com.br', '.example')}`, name: 'RH Órbita', displayName: 'RH', passwordHash: pw, preferences: { create: {} }, gamification: { create: {} } },
  });
  await prisma.membership.create({ data: { userId: admin.id, oneCompanyKey: admin.id, tenantId: tenant.id, role: 'ADMIN_CLIENTE', joinedAt: new Date() } });

  // temas liberados para a empresa
  for (const slug of d.themes as string[]) {
    const planet = await prisma.planet.findUnique({ where: { slug } });
    if (planet) await prisma.tenantPlanetAccess.create({ data: { tenantId: tenant.id, planetId: planet.id, enabled: true, allDepartments: true } });
  }
  // trilhas obrigatórias com prazo (por área)
  for (const t of d.tracks as Array<{ c: string; due: string; for: string }>) {
    const course = await prisma.course.findUnique({ where: { code: t.c } });
    if (!course) continue;
    const [dd, mm, yy] = t.due.split('/').map(Number);
    await prisma.assignment.create({
      data: {
        tenantId: tenant.id, targetType: 'COURSE', courseId: course.id, mandatory: true, priority: 10,
        departmentId: t.for === 'Todos' ? null : deps.get(t.for) ?? null, dueDate: new Date(Date.UTC(yy, mm - 1, dd)), createdById: admin.id,
      },
    });
  }

  // pessoas + atividade das últimas 8 semanas (engajamento)
  const feedback = await prisma.course.findUnique({ where: { code: 'feedback-0' }, include: { units: { include: { lessons: true } } } });
  const kinds: ActivityKind[] = ['LESSON', 'PRACTICE', 'REVIEW', 'INFINITE'];
  for (const p of catalog.demo.people as Array<{ n: string; a: string; p: number; st: string; mail: string }>) {
    const email = p.mail.replace('.com.br', '.example');
    const u = await prisma.user.create({
      data: { email, name: p.n, displayName: p.n.split(' ')[0], passwordHash: pw, preferences: { create: {} }, gamification: { create: { totalXp: Math.round(p.p * 900), level: 1 + Math.floor((p.p * 900) / 200) } } },
    });
    await prisma.membership.create({
      data: { userId: u.id, oneCompanyKey: u.id, tenantId: tenant.id, role: 'COLABORADOR_CLIENTE', joinedAt: new Date(), departments: deps.get(p.a) ? { create: [{ departmentId: deps.get(p.a)! }] } : undefined },
    });
    if (p.st === 'none') continue;
    const activeDays = Math.round(56 * Math.min(0.9, p.p + 0.15));
    for (let i = 0; i < activeDays; i++) {
      const day = new Date(Date.now() - Math.floor(Math.random() * 56) * DAY);
      day.setUTCHours(0, 0, 0, 0);
      await prisma.activityEvent.create({ data: { userId: u.id, tenantId: tenant.id, kind: kinds[i % kinds.length], xp: 10 + (i % 3) * 10, day } });
    }
    if (feedback && p.p > 0) {
      const lessons = feedback.units.flatMap((un) => un.lessons);
      const done = lessons.slice(0, Math.round(lessons.length * Math.min(1, p.p * 1.4)));
      for (const l of done) await prisma.lessonProgress.create({ data: { userId: u.id, lessonId: l.id, status: 'COMPLETED', completedAt: new Date() } });
      if (done.length) {
        await prisma.enrollment.create({ data: { userId: u.id, courseId: feedback.id, progressPct: Math.round((done.length / (lessons.length + 1)) * 100), status: 'IN_PROGRESS' } });
      }
    }
  }
  console.log(`  logins demo: ${admin.email} (ADMIN) e ${(catalog.demo.people[0].mail as string).replace('.com.br', '.example')} (colaborador) - senha demo1234`);
}

async function main() {
  const master = await base();
  console.log(`✔ base: categorias, MASTER (${master.email}), templates e planos`);

  const catalog = JSON.parse(readFileSync(join(__dirname, '..', 'content', 'catalog.json'), 'utf8')) as ProtoCatalog & { demo?: unknown };
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const stats = await app.get(CatalogImportService).import(catalog, { force: process.argv.includes('--force-content') });
  await app.close();
  console.log(`✔ catálogo do protótipo: ${stats.planets} planetas, ${stats.courses} cursos, ${stats.trails} trilhas (${stats.skippedTrails} mantidas), ${stats.avatarItems} itens do Hangar`);

  if (process.env.SEED_DEMO === 'true') {
    await demo(catalog);
    console.log('✔ demo: empresa Órbita Logística (código ORBITA-2026) com pessoas, trilhas e atividade');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
