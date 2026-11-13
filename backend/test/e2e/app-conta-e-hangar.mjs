// e2e: conta do app (cadastro grátis B2C, planos para a tela Premium, Hangar, preferências, código da empresa, troca de senha).
// Rode contra um banco DE TESTE (skill testes-e2e, seed demo com a empresa ORBITA-2026):
//   bash ../skills/testes-e2e/banco-teste.sh criar app
//   PORT=3011 DATABASE_URL=...universo_folks_test_app node dist/main.js
//   API_URL=http://localhost:3011/api node test/e2e/app-conta-e-hangar.mjs
const API = process.env.API_URL ?? 'http://localhost:3011/api';
const RUN = Date.now().toString(36);
let fails = 0, total = 0;
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 260) : ''}`); if (!c) fails++; };
const call = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const PW = `Senha${RUN}1`;

// ---- planos para a tela Premium (público)
const tiers = await call('GET', '/billing/tiers');
const byCode = Object.fromEntries((tiers.body ?? []).map((t) => [t.code, t]));
ok(tiers.status === 200 && byCode.basico?.isDefault && byCode.premium && byCode['premium-plus'], 'GET /billing/tiers é público e traz Básico, Premium e Premium Plus', tiers.body?.map?.((t) => t.code));
ok(byCode.premium.categories.map((c) => c.slug).sort().join() === 'para-a-vida,para-o-trabalho', 'Premium mostra as galáxias Para a vida e Para o trabalho', byCode.premium.categories);
ok(byCode['premium-plus'].categories.length >= 3 && byCode['premium-plus'].categories.some((c) => c.slug === 'para-a-escola'), 'Premium Plus mostra todas as galáxias (inclui Para a escola)', byCode['premium-plus'].categories);
ok(byCode.basico.categories.length === 0, 'Básico não libera galáxia (só o gratuito)');
ok(!JSON.stringify(tiers.body).includes('subscriptions'), 'rota pública não expõe assinaturas nem dados de ninguém');

// ---- cadastro grátis
const email = `aluno-${RUN}@teste.example`;
ok((await call('POST', '/auth/register', null, { name: 'Aluno E2E', email, password: 'curta', birthDate: '1995-06-15' })).status === 400, 'cadastro recusa senha fraca');
ok((await call('POST', '/auth/register', null, { name: 'Aluno E2E', email, password: PW, birthDate: '1990-02-31' })).status === 400, 'cadastro recusa data de nascimento inexistente');
const reg = await call('POST', '/auth/register', null, { name: 'Aluno E2E', email, password: PW, birthDate: '1995-06-15' });
ok(reg.status === 201 || reg.status === 200, 'cadastro grátis cria a conta e já devolve a sessão', reg.status);
ok(reg.body?.context?.mode === 'B2C', 'quem se cadastra pelo app entra como aluno individual (B2C)', reg.body?.context);
let T = reg.body.accessToken;
const dup = await call('POST', '/auth/register', null, { name: 'Outro', email, password: PW, birthDate: '1995-06-15' });
ok(dup.status === 409 || dup.status === 400, 'não deixa cadastrar o mesmo e-mail duas vezes', dup.status);
const ent = (await call('GET', '/me/entitlements', T)).body;
ok(ent.premium === false && ent.plan?.code === 'basico', 'conta nova fica no plano Básico, sem Premium', ent.plan);
ok((await call('GET', '/me/company', T)).status === 404, 'aluno sem empresa não tem a aba Empresa (404 em /me/company)');

// ---- Hangar
let h = (await call('GET', '/me/hangar', T)).body;
const item = (slot, key) => h.slots.find((s) => s.slot === slot).items.find((i) => i.key === key);
ok(h.level === 1 && h.slots.length === 5, 'Hangar tem as 5 categorias (traje, detalhes, viseira, cabeça, costas)', h.slots?.map((s) => s.slot));
const eq = await call('PUT', `/me/hangar/${item('HEAD', 'antena').id}`, T);
h = eq.body;
ok(eq.status === 200 && item('HEAD', 'antena').equipped, 'equipa um item liberado (Antena, nível 1)');
const locked = await call('PUT', `/me/hangar/${item('HEAD', 'fones').id}`, T);
ok(locked.status === 403, 'não equipa item de nível acima do seu (Fones, nível 3)', locked.body?.message);

// ---- preferências
const pref = await call('PATCH', '/me/preferences', T, { dailyGoalXp: 50, reduceAnimations: true, soundEffects: false });
ok(pref.status === 200 && pref.body.dailyGoalXp === 50 && pref.body.reduceAnimations === true && pref.body.soundEffects === false, 'salva meta diária, reduzir animações e efeitos sonoros', pref.body);
ok((await call('PATCH', '/me/preferences', T, { dailyGoalXp: 30 })).status === 400, 'meta diária só aceita 20, 50, 100 ou 150');
ok((await call('GET', '/me/progress', T)).body.dailyGoalXp === 50, 'progresso usa a nova meta diária');

// ---- troca de senha
ok((await call('POST', '/auth/change-password', T, { currentPassword: 'errada123', newPassword: `Nova${RUN}2` })).status === 400, 'troca de senha exige a senha atual correta');
const chg = await call('POST', '/auth/change-password', T, { currentPassword: PW, newPassword: `Nova${RUN}2` });
ok(chg.status === 200, 'troca a senha com a senha atual', chg.status);
const relog = await call('POST', '/auth/login', null, { email, password: `Nova${RUN}2` });
ok(relog.status === 200, 'entra com a senha nova');
T = relog.body.accessToken ?? T;

// ---- código da empresa (Ajustes)
const join = await call('POST', '/auth/join-company', T, { code: 'ORBITA-2026' });
ok(join.status === 200 && join.body?.context?.mode === 'TENANT', 'aluno entra na empresa pelo código e passa a estudar nela', join.body?.context ?? join.body);
const co = await call('GET', '/me/company', join.body?.accessToken);
ok(co.status === 200 && co.body?.company?.tradeName, 'colaborador vê a aba Empresa', co.body?.company);

// ---- cadastro já com o código da empresa
const reg2 = await call('POST', '/auth/register', null, { name: 'Colab E2E', email: `colab-${RUN}@teste.example`, password: PW, birthDate: '1990-01-10', companyCode: 'ORBITA-2026' });
ok((reg2.status === 201 || reg2.status === 200) && reg2.body?.context?.mode === 'TENANT', 'cadastro com código da empresa já entra como colaborador', reg2.body?.context ?? reg2.body);

console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
