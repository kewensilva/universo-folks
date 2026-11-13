// e2e: menu Planos do MASTER (Básico, Premium, Premium Plus) e o acesso por galáxia.
// Uso: API apontando para um banco DE TESTE com seed (skill testes-e2e), nunca para o de dev:
//   bash ../skills/testes-e2e/banco-teste.sh criar planos
//   PORT=3011 DATABASE_URL=...universo_folks_test_planos node dist/main.js
//   API_URL=http://localhost:3011/api node test/e2e/planos-de-acesso.mjs
// Cria aluno, planeta e preços de teste: por isso só roda em banco descartável.
const API = process.env.API_URL ?? 'http://localhost:3011/api';
let fails = 0, total = 0;
const RUN = Date.now().toString(36); // sufixo: o roteiro pode rodar de novo no mesmo banco
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 240) : ''}`); if (!c) fails++; };
const call = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};

const M = (await call('POST', '/auth/login', null, { email: process.env.MASTER_EMAIL ?? 'master@folks.com.br', password: process.env.MASTER_PASSWORD ?? 'TroqueEssaSenha123' })).body.accessToken;
ok(!!M, 'MASTER faz login');
const cats = Object.fromEntries((await call('GET', '/master/content/categories', M)).body.map((c) => [c.slug, c.id]));

// ------------------------------------------------------------- planos iniciais
let tiers = (await call('GET', '/master/plan-tiers', M)).body;
const T = (code) => tiers.find((t) => t.code === code);
ok(T('basico')?.isDefault && T('basico').categories.length === 0 && !T('basico').includesAllCategories, 'Básico: plano de quem não assina, só conteúdo grátis');
ok(T('premium')?.categories.map((c) => c.slug).sort().join() === 'para-a-vida,para-o-trabalho', 'Premium: Para a vida + Para o trabalho', T('premium')?.categories);
ok(T('premium-plus')?.includesAllCategories, 'Premium Plus: todas as galáxias (inclusive as futuras)');
ok(T('premium').plans.some((p) => p.code === 'b2c-premium-monthly'), 'preços Premium mensal/anual já liberam o plano Premium');

// ------------------------------------------------------------------- regras
ok((await call('DELETE', `/master/plan-tiers/${T('basico').id}`, M)).status === 400, 'o plano de quem não assina não pode ser excluído');
ok((await call('PATCH', `/master/plan-tiers/${T('basico').id}`, M, { isDefault: false })).status === 400, 'não dá para ficar sem plano padrão');
ok((await call('PATCH', `/master/plan-tiers/${T('basico').id}`, M, { isActive: false })).status === 400, 'plano padrão não pode ficar inativo');
ok((await call('DELETE', `/master/plan-tiers/${T('premium').id}`, M)).status === 409, 'plano com preços vinculados não é excluído');
ok((await call('POST', '/master/plan-tiers', M, { name: 'E2E X', categoryIds: ['00000000-0000-4000-8000-000000000000'] })).status === 400, 'galáxia inexistente é recusada');
const e2e = await call('POST', '/master/plan-tiers', M, { name: 'E2E Escola', code: `e2e-escola-${RUN}`, categoryIds: [cats['para-a-escola']] });
ok(e2e.status === 201 && e2e.body.code === `e2e-escola-${RUN}`, 'MASTER cria um plano', e2e.body);
ok((await call('POST', '/master/plan-tiers', M, { name: 'E2E Escola', code: `e2e-escola-${RUN}` })).status === 409, 'código repetido é recusado');
await call('PATCH', `/master/plan-tiers/${e2e.body.id}`, M, { isDefault: true });
tiers = (await call('GET', '/master/plan-tiers', M)).body;
ok(T(`e2e-escola-${RUN}`).isDefault && !T('basico').isDefault, 'marcar outro como padrão desmarca o anterior (sempre um só)');
await call('PATCH', `/master/plan-tiers/${T('basico').id}`, M, { isDefault: true });
ok((await call('DELETE', `/master/plan-tiers/${e2e.body.id}`, M)).status === 200, 'plano sem preços é excluído');
await call('PATCH', `/master/plan-tiers/${T('premium-plus').id}`, M, { description: 'Todas as galáxias completas.' });
tiers = (await call('GET', '/master/plan-tiers', M)).body;
ok(T('premium-plus').includesAllCategories && T('basico').isDefault && !T(`e2e-escola-${RUN}`), 'PATCH parcial não volta "todas as galáxias" ao padrão');

const pat = await call('POST', '/master/api-tokens', M, { name: 'e2e planos', expiresInDays: 1 });
ok((await call('GET', '/master/plan-tiers', pat.body.token)).status === 403, 'token do Claude não acessa os planos');

// ---------------------------------------- planeta Premium na galáxia "Para a escola"
const planet = await call('POST', '/master/content/planets', M, { categorySlug: 'para-a-escola', name: 'E2E Escola Planeta', slug: `e2e-escola-${RUN}`, status: 'PUBLISHED', accessTier: 'PREMIUM' });
const course = await call('POST', '/master/content/courses', M, { planetId: planet.body.id, title: 'Curso E2E escola', status: 'PUBLISHED' });
const unit = await call('POST', '/master/content/units', M, { courseId: course.body.id, title: 'Unidade E2E' });
ok(planet.status === 201 && course.status === 201 && unit.status === 201, 'planeta Premium em "Para a escola" criado', [planet.status, course.status, unit.status]);
const feedback = (await call('GET', '/master/content/planets?search=feedback', M)).body.find((p) => p.slug === 'feedback') ?? (await call('GET', '/master/content/planets', M)).body.find((p) => p.category?.slug === 'para-o-trabalho' && p.status === 'PUBLISHED');

// --------------------------------------------------------------------- aluno
const email = `e2e.planos.${Date.now()}@example.com`;
const reg = await call('POST', '/auth/register', null, { name: 'Aluno Planos', email, password: 'SenhaE2e123!', birthDate: '1990-01-01' });
const A = reg.body.accessToken;
const me = (await call('GET', '/me', A)).body;
ok(!!A && !!me?.id, 'aluno B2C se cadastra', reg.status);
const view = async () => {
  const list = (await call('GET', '/catalog/planets', A)).body.items;
  const ent = (await call('GET', '/me/entitlements', A)).body;
  return { work: list.find((p) => p.id === feedback.id), school: list.find((p) => p.slug === `e2e-escola-${RUN}`), ent };
};

let v = await view();
ok(v.ent.plan?.code === 'basico' && v.ent.premium === false, 'sem assinatura: plano Básico', v.ent.plan);
ok(v.work?.locked && v.work.requiredPlan === 'Premium', 'Básico: planeta de "Para o trabalho" bloqueado, disponível no Premium', [v.work?.locked, v.work?.requiredPlan]);
ok(v.school?.locked && v.school.requiredPlan === 'Premium Plus', 'Básico: planeta de "Para a escola" disponível só no Premium Plus', [v.school?.locked, v.school?.requiredPlan]);
const free = (await call('GET', '/catalog/planets?filter=free', A)).body.items;
ok(free.length > 0 && free.every((p) => !p.locked), 'Básico: cursos gratuitos liberados', free.map((p) => p.slug));

// Premium (mensal)
const plans = (await call('GET', '/master/billing/plans', M)).body;
const monthly = plans.find((p) => p.code === 'b2c-premium-monthly');
const sPremium = await call('POST', '/master/billing/subscriptions', M, { userId: me.id, planId: monthly.id });
ok(sPremium.status === 201, 'MASTER concede o Premium ao aluno', sPremium.body);
v = await view();
ok(v.ent.plan?.code === 'premium' && v.ent.premium && [...v.ent.plan.categories].sort().join() === 'para-a-vida,para-o-trabalho', 'Premium: plano e galáxias no /me/entitlements', v.ent.plan);
ok(v.work && !v.work.locked, 'Premium: "Para o trabalho" liberado');
ok(v.school?.locked && v.school.requiredPlan === 'Premium Plus', 'Premium: "Para a escola" continua bloqueado (Premium Plus)');
const schoolTrail = (await call('GET', `/learning/courses/${course.body.id}/trail`, A)).body;
ok(schoolTrail.access?.locked && schoolTrail.access.reason === 'PREMIUM_REQUIRED' && schoolTrail.requiredPlan === 'Premium Plus', 'Premium: trilha de "Para a escola" bloqueada e indica o Premium Plus', [schoolTrail.access, schoolTrail.requiredPlan]);
const workCourse = (await call('GET', `/catalog/planets/${feedback.slug}`, A)).body.courses[0];
const workTrail = (await call('GET', `/learning/courses/${workCourse.id}/trail`, A)).body;
ok(!workTrail.access.locked && workTrail.units.every((u) => !u.locked) && workTrail.requiredPlan === null, 'Premium: todas as unidades de "Para o trabalho" liberadas');

// Premium Plus (preço novo vinculado ao plano)
const plusPrice = await call('POST', '/master/billing/plans', M, { code: `e2e-premium-plus-${RUN}`, name: 'Premium Plus Mensal', audience: 'B2C', interval: 'MONTHLY', priceCents: 4990, isActive: true, tierId: T('premium-plus').id });
ok(plusPrice.status === 201 && plusPrice.body.tierId === T('premium-plus').id, 'preço do Premium Plus vinculado ao plano', plusPrice.body);
const pub = (await call('GET', '/billing/plans', null)).body.find((p) => p.code === `e2e-premium-plus-${RUN}`);
ok(pub?.tier?.name === 'Premium Plus' && pub.tier.includesAllCategories, 'tela de assinatura recebe o plano e as galáxias de cada preço', pub?.tier);
const sPlus = await call('POST', '/master/billing/subscriptions', M, { userId: me.id, planId: plusPrice.body.id });
v = await view();
ok(v.ent.plan?.code === 'premium-plus' && v.ent.plan.categories === 'ALL', 'Premium Plus: vale o maior plano assinado, com todas as galáxias', v.ent.plan);
ok(v.school && !v.school.locked && v.school.requiredPlan === null, 'Premium Plus: "Para a escola" liberado');

// cancelou o Plus: volta ao Premium
await call('POST', `/master/billing/subscriptions/${sPlus.body.id}/cancel?immediately=true`, M);
v = await view();
ok(v.ent.plan?.code === 'premium' && v.school?.locked, 'cancelou o Premium Plus: volta ao Premium e "Para a escola" bloqueia de novo', v.ent.plan);

// MASTER muda as galáxias do Premium: vale na hora
await call('PATCH', `/master/plan-tiers/${T('premium').id}`, M, { categoryIds: [cats['para-a-vida'], cats['para-o-trabalho'], cats['para-a-escola']] });
v = await view();
ok(v.school && !v.school.locked, 'MASTER incluiu "Para a escola" no Premium: libera na hora');
await call('PATCH', `/master/plan-tiers/${T('premium').id}`, M, { categoryIds: [cats['para-a-vida'], cats['para-o-trabalho']] });

// Básico com uma galáxia: o MASTER pode liberar uma galáxia inteira para quem não assina
await call('POST', `/master/billing/subscriptions/${sPremium.body.id}/cancel?immediately=true`, M);
await call('PATCH', `/master/plan-tiers/${T('basico').id}`, M, { categoryIds: [cats['para-o-trabalho']] });
v = await view();
ok(v.ent.plan?.code === 'basico' && v.work && !v.work.locked && v.school?.locked, 'Básico com "Para o trabalho": libera essa galáxia sem assinatura', [v.ent.plan, v.work?.locked]);
await call('PATCH', `/master/plan-tiers/${T('basico').id}`, M, { categoryIds: [] });

console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
