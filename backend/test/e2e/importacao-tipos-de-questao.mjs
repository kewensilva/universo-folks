// e2e: importar o material real do cliente (folks-content.json) e responder questões de todos os tipos como aluno.
// Uso (dentro de backend/, com a API de teste na 3011 e um banco universo_folks_test_*):
//   BACKEND_DIR=$PWD DB=universo_folks_test_<sufixo> node test/e2e/importacao-tipos-de-questao.mjs <caminho do folks-content.json>
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const API = process.env.API_URL ?? 'http://localhost:3011/api';
const DB = process.env.DB ?? 'universo_folks_test_tipos';
const FILE = process.argv[2];
let fails = 0, total = 0;
const ok = (cond, msg, extra) => {
  total++;
  console.log(`${cond ? '✔' : '✘'} ${msg}${extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 300) : ''}`);
  if (!cond) fails++;
};
async function call(method, path, token, body) {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
const sql = (q) => JSON.parse(execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'folks', '-d', DB, '-tAc', q], { cwd: process.env.BACKEND_DIR, encoding: 'utf8' }).trim() || 'null');

const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).body;
const MASTER = (await login('master@folks.com.br', 'TroqueEssaSenha123')).accessToken;
ok(!!MASTER, 'MASTER faz login');

// ---------------------------------------------------------------- importação
const content = readFileSync(FILE, 'utf8');
const up = await call('POST', '/master/content/imports', MASTER, { content, filename: 'folks-content.json', label: 'Lote do cliente 2026-11-10' });
ok(up.status === 201 && up.body.status === 'VALIDATED', 'material do cliente é validado sem erros', { status: up.status, st: up.body.status, errors: up.body.errors });
const id = up.body.id;
ok(up.body.stats?.questions === 795, '795 questões reconhecidas', up.body.stats?.questionTypes);

const plan = await call('POST', `/master/content/imports/${id}/plan`, MASTER, {});
ok(plan.status === 200 || plan.status === 201, 'prévia (plano) gerada', plan.body.summary);
const pl = plan.body.plan ?? plan.body;
const byPlanet = Object.fromEntries((pl.planets ?? []).map((p) => [p.slug, p.action + '/' + p.courses.map((c) => c.action).join(',')]));
ok(byPlanet.dinheiro?.startsWith('UPDATE') && byPlanet.mecanica?.startsWith('UPDATE'), 'Dinheiro e Mecânica (do catálogo, "Em breve") são atualizados, não duplicados', byPlanet);
ok(byPlanet.fotografia?.startsWith('CREATE') && byPlanet.ingles?.startsWith('CREATE'), 'Fotografia e Inglês são criados', byPlanet);
const fbProgress = sql(`select count(*) from lesson_progress lp join lessons l on l.id=lp.lesson_id join units u on u.id=l.unit_id join courses c on c.id=u.course_id where c.code='feedback-0'`);
ok(fbProgress > 0 ? /CONFLICT/.test(byPlanet.feedback ?? '') : /REPLACE/.test(byPlanet.feedback ?? ''), `Feedback: curso do catálogo com progresso de alunos (${fbProgress}) não é sobrescrito (CONFLICT)`, byPlanet);
// o que deve ir para o banco: tudo, menos os cursos em conflito
const src = JSON.parse(content);
const skip = new Set((pl.planets ?? []).flatMap((p) => p.courses.filter((c) => c.action === 'CONFLICT').map((c) => c.key)));
const courses = src.planets.flatMap((p) => p.courses).filter((c) => !skip.has(c.key));
const bankQs = courses.flatMap((c) => [...c.units.flatMap((u) => u.lessons.flatMap((l) => l.questions ?? [])), ...(c.exam?.questions ?? [])]);
const expPractices = courses.flatMap((c) => c.units.flatMap((u) => u.lessons.filter((l) => l.type === 'PRACTICE'))).length;

const ap = await call('POST', `/master/content/imports/${id}/apply`, MASTER, { publish: true });
ok(ap.status === 200 || ap.status === 201, 'importação gravada', { status: ap.status, st: ap.body.status, err: ap.body.message });
ok(ap.body.status === 'APPLIED', 'status APPLIED', ap.body.status);

// ---------------------------------------------------------------- banco
const types = sql(`select json_object_agg(type, n) from (select q.type, count(*) n from questions q left join lessons l on l.id=q.lesson_id left join units u on u.id=l.unit_id left join courses c on c.id=coalesce(u.course_id,(select course_id from exams e where e.id=q.exam_id)) where c.code = any(array[${courses.map((c) => `'${c.key}'`).join(',')}]) group by q.type) t`);
// os "confere rapidinho" ficam dentro da aula (JSON), não na tabela
ok(Object.values(types ?? {}).reduce((a, b) => a + b, 0) === bankQs.length, `${bankQs.length} questões na tabela (banco + certificação)`, types);
ok(sql(`select count(*) from questions where type='NUMBER' and (data->>'answer') is null`) === 0, 'toda questão NUMBER tem resposta em data');
ok(sql(`select count(*) from questions where media ? 'visual'`) === bankQs.filter((q) => q.visual).length, `${bankQs.filter((q) => q.visual).length} imagens (SVG) das questões gravadas em media`);
ok(sql(`select count(*) from questions where media->'audio'->>'kind'='TTS'`) === bankQs.filter((q) => q.audio).length, `${bankQs.filter((q) => q.audio).length} áudios TTS gravados`);
ok(sql(`select count(*) from lessons where generator_specs is not null`) === expPractices, `${expPractices} práticas com geradores e seus dados`);
ok(sql(`select count(*) from lessons l join units u on u.id=l.unit_id join courses c on c.id=u.course_id where l.type='LESSON' and c.code like 'dinheiro.%' and l.content::text like '%"widget"%' and l.content::text like '%"textParts"%'`) >= 1, 'telas com widget e texto em partes gravadas na aula');
ok(sql(`select count(*) from units u join courses c on c.id=u.course_id join planets p on p.id=c.planet_id where p.slug='dinheiro' and u.theme_color is not null`) === 4, 'cor das unidades gravada');
ok(sql(`select to_json(string_agg(coalesce(u.access_tier::text,'-'), '' order by u.sort_order)) from units u join courses c on c.id=u.course_id where c.code='dinheiro.organizacao-financeira'`) === 'FREEFREEPREMIUMPREMIUM', 'Dinheiro: unidades 1-2 grátis, 3-4 Premium');
ok(sql(`select to_json(access_tier) from planets where slug='dinheiro'`) === 'FREE', 'planeta FREEMIUM fica no plano grátis');
ok(sql(`select to_json(meta) from courses where code='dinheiro.organizacao-financeira'`) === '4 unidades · simuladores · do zero', 'linha curta do card (summary) gravada');
ok(sql(`select to_json(theme_color) from planets where slug='dinheiro'`) === '#2fc27a', 'cor do planeta do catálogo preservada na atualização');
ok(sql(`select count(*) from courses where planet_id=(select id from planets where slug='feedback')`) === 1, 'Feedback continua com 1 curso (sem duplicar)');

// ---------------------------------------------------------------- aluno
const email = `aluno.tipos.${Date.now()}@teste.example`;
const reg = await call('POST', '/auth/register', null, { name: 'Aluno Tipos', email, password: 'Senha1234', birthDate: '1990-05-10' });
ok(reg.status === 201, 'aluno B2C se cadastra', reg.body.message);
const ALUNO = reg.body.accessToken ?? (await login(email, 'Senha1234')).accessToken;

const courseId = sql(`select to_json(id) from courses where code='ingles.a-primeira-coisa-que-voce-tem-que-aprender-no-ingles'`);
const trail = await call('GET', `/learning/courses/${courseId}/trail`, ALUNO);
ok(trail.status === 200, 'trilha de Inglês abre para o aluno grátis', trail.body.message);
const steps = (trail.body.units ?? []).flatMap((u) => (u.lessons ?? u.steps ?? []).map((l) => ({ ...l, unitTier: u.accessTier, locked: u.locked ?? l.lockReason })));

const answerFor = (q, right) => {
  const d = q.data ?? {};
  switch (q.type) {
    case 'NUMBER': return { value: right ? Number(d.answer) : Number(d.answer) + 7 };
    case 'ORDER': case 'BUILD_SENTENCE': return { sequence: right ? d.answer : [...d.answer].reverse() };
    case 'MATCH_PAIRS': return { pairs: right ? d.pairs : d.pairs.map((p, i, a) => ({ left: p.left, right: a[(i + 1) % a.length].right })) };
    case 'CLASSIFY': return { assignments: d.items.map((it) => ({ item: it.text, group: right ? it.group : (it.group + 1) % d.groups.length })) };
    case 'SIMULATOR': return { simulator: { correct: right } };
    default: return { optionIds: q.options.filter((o) => (right ? o.isCorrect : !o.isCorrect)).slice(0, 1).map((o) => o.id) };
  }
};
const seen = new Set();
let practices = 0, leaks = 0;
for (const s of steps) {
  if (s.accessTier === 'PREMIUM' || s.unitTier === 'PREMIUM') break; // grátis: só unidades 1-2
  const L = await call('GET', `/learning/lessons/${s.id}`, ALUNO);
  if (L.status !== 200) { ok(false, `abre a etapa ${s.title}`, L.body); break; }
  if (L.body.type === 'LESSON') {
    if (!seen.has('slides')) { ok(L.body.content?.slides?.some((sl) => sl.widget), 'aula entrega telas com widget para o app'); seen.add('slides'); }
    const c = await call('POST', `/learning/lessons/${s.id}/complete`, ALUNO, {});
    if (c.status >= 300) { ok(false, `conclui a aula ${s.title}`, c.body); break; }
    continue;
  }
  if (L.body.type !== 'PRACTICE') continue;
  practices++;
  const qs = L.body.questions;
  const pub = JSON.stringify(qs);
  if (/isCorrect|"answer"|"group"|"pairs"|speakAfterAnswer|visualAfterAnswer/.test(pub)) leaks++;
  const full = sql(`select json_agg(json_build_object('id', q.id, 'type', q.type, 'data', q.data, 'options', (select coalesce(json_agg(json_build_object('id', o.id, 'isCorrect', o.is_correct)), '[]') from question_options o where o.question_id=q.id))) from questions q where q.lesson_id='${s.id}'`);
  const byId = new Map(full.map((q) => [q.id, q]));
  if (L.body.questionsPerRound) ok(qs.length === L.body.questionsPerRound, `"${s.title}": rodada com ${L.body.questionsPerRound} questões sorteadas`, { recebidas: qs.length, banco: full.length });
  // primeira tentativa: tudo errado -> nenhum acerto; segunda: tudo certo
  const wrong = await call('POST', `/learning/lessons/${s.id}/practice`, ALUNO, { answers: qs.map((q) => ({ questionId: q.id, ...answerFor(byId.get(q.id), false) })) });
  const wrongCorrect = wrong.body.result?.correct ?? wrong.body.correct;
  const right = await call('POST', `/learning/lessons/${s.id}/practice`, ALUNO, { answers: qs.map((q) => ({ questionId: q.id, ...answerFor(byId.get(q.id), true) })) });
  const r = right.body.result ?? right.body;
  const typesHere = [...new Set(qs.map((q) => q.type))];
  for (const t of typesHere) seen.add(t);
  ok(wrongCorrect === 0 && r.correct === qs.length, `"${s.title}" (${typesHere.join(', ')}): errado = 0 acertos, certo = ${qs.length}/${qs.length}`, { wrong: wrong.status === 201 ? wrongCorrect : wrong.body, right: right.status === 201 ? r.correct : right.body });
}
ok(practices >= 2, `aluno grátis fez ${practices} práticas das unidades liberadas`);
ok(leaks === 0, 'nenhuma questão entregue ao aluno contém a resposta');
ok(seen.has('MATCH_PAIRS'), 'ligar pares corrigido no servidor', [...seen]);

const inf = await call('POST', `/learning/courses/${courseId}/infinite/start`, ALUNO, {});
ok(inf.status === 201 && inf.body.generatorSpecs?.length > 0 && inf.body.generatorSpecs.every((g) => g.methodology && g.data), 'prática infinita entrega os geradores com dados', { status: inf.status, n: inf.body.generatorSpecs?.length, msg: inf.body.message });

// tipos que não aparecem em Inglês: corrige direto as práticas de Dinheiro com conta premium? -> via B2C grátis nas unidades 1-2
const dinheiroId = sql(`select to_json(id) from courses where code='dinheiro.organizacao-financeira'`);
const dTrail = await call('GET', `/learning/courses/${dinheiroId}/trail`, ALUNO);
const dSteps = (dTrail.body.units ?? []).filter((u) => u.accessTier !== 'PREMIUM').flatMap((u) => u.lessons ?? u.steps ?? []);
for (const s of dSteps) {
  const L = await call('GET', `/learning/lessons/${s.id}`, ALUNO);
  if (L.body.type === 'LESSON') { await call('POST', `/learning/lessons/${s.id}/complete`, ALUNO, {}); continue; }
  if (L.body.type !== 'PRACTICE') continue;
  const full = sql(`select json_agg(json_build_object('id', q.id, 'type', q.type, 'data', q.data, 'options', (select coalesce(json_agg(json_build_object('id', o.id, 'isCorrect', o.is_correct)), '[]') from question_options o where o.question_id=q.id))) from questions q where q.lesson_id='${s.id}'`);
  const byId = new Map(full.map((q) => [q.id, q]));
  const qs = L.body.questions;
  const right = await call('POST', `/learning/lessons/${s.id}/practice`, ALUNO, { answers: qs.map((q) => ({ questionId: q.id, ...answerFor(byId.get(q.id), true) })) });
  const r = right.body.result ?? right.body;
  for (const q of qs) seen.add(q.type);
  const sim = (r.items ?? []).filter((i) => i.type === 'SIMULATOR');
  ok(r.correct === qs.length && sim.every((i) => i.selfReported), `Dinheiro "${s.title}" (${[...new Set(qs.map((q) => q.type))].join(', ')}): ${r.correct}/${qs.length}${sim.length ? ' (simulador marcado como informado pelo app)' : ''}`, right.status >= 300 ? right.body : undefined);
}
ok(['NUMBER', 'CLASSIFY', 'TRUE_FALSE', 'SINGLE_CHOICE'].every((t) => seen.has(t)), 'tipos de Dinheiro corrigidos no servidor', [...seen]);

// ---------------------------------------------------------------- Premium: unidades 3+, ordenar, montar frase e certificação
const userId = sql(`select to_json(id) from users where email='${email}'`);
sql(`with x as (insert into subscriptions (id, user_id, plan_id, status, provider, current_period_start, current_period_end, updated_at) select gen_random_uuid(), '${userId}', id, 'ACTIVE', 'MANUAL', now(), now() + interval '30 days', now() from plans where code='b2c-premium-monthly' returning id) select to_json(id) from x`);
async function doTrail(code) {
  const cid = sql(`select to_json(id) from courses where code='${code}'`);
  const t = await call('GET', `/learning/courses/${cid}/trail`, ALUNO);
  const all = (t.body.units ?? []).flatMap((u) => u.lessons ?? u.steps ?? []);
  const kinds = new Set();
  let allRight = true;
  for (const s of all) {
    const L = await call('GET', `/learning/lessons/${s.id}`, ALUNO);
    if (L.status !== 200) { allRight = false; console.log('  etapa bloqueada', s.title, L.body.message); continue; }
    if (L.body.type === 'LESSON') { await call('POST', `/learning/lessons/${s.id}/complete`, ALUNO, {}); continue; }
    if (L.body.type !== 'PRACTICE') continue;
    const full = sql(`select json_agg(json_build_object('id', q.id, 'type', q.type, 'data', q.data, 'options', (select coalesce(json_agg(json_build_object('id', o.id, 'isCorrect', o.is_correct)), '[]') from question_options o where o.question_id=q.id))) from questions q where q.lesson_id='${s.id}'`);
    const byId = new Map(full.map((q) => [q.id, q]));
    const res = await call('POST', `/learning/lessons/${s.id}/practice`, ALUNO, { answers: L.body.questions.map((q) => ({ questionId: q.id, ...answerFor(byId.get(q.id), true) })) });
    const r = res.body.result ?? res.body;
    L.body.questions.forEach((q) => kinds.add(q.type));
    if (r.correct !== L.body.questions.length) { allRight = false; console.log('  falhou', s.title, JSON.stringify(res.body).slice(0, 300)); }
  }
  return { cid, kinds: [...kinds], allRight, n: all.length };
}
for (const code of ['ingles.a-primeira-coisa-que-voce-tem-que-aprender-no-ingles', 'mecanica.mecanica-basica-entenda-o-seu-carro', 'dinheiro.organizacao-financeira']) {
  const r = await doTrail(code);
  ok(r.allRight, `Premium: trilha ${code.split('.')[0]} inteira (${r.n} etapas) respondida certo — tipos ${r.kinds.join(', ')}`);
  if (code.startsWith('dinheiro')) {
    const ex = await call('POST', `/learning/courses/${r.cid}/exam/start`, ALUNO, {});
    ok(ex.status === 201 && ex.body.questions?.length > 0, 'certificação de Dinheiro abre depois da trilha', { status: ex.status, msg: ex.body.message, n: ex.body.questions?.length });
    if (ex.status === 201) {
      ok(!/isCorrect|"answer"|"group"|"pairs"/.test(JSON.stringify(ex.body.questions)), 'prova não entrega respostas');
      const examId = sql(`select to_json(id) from exams where course_id='${r.cid}'`);
      const full = sql(`select json_agg(json_build_object('id', q.id, 'type', q.type, 'data', q.data, 'options', (select coalesce(json_agg(json_build_object('id', o.id, 'isCorrect', o.is_correct)), '[]') from question_options o where o.question_id=q.id))) from questions q where q.exam_id='${examId}'`);
      const byId = new Map(full.map((q) => [q.id, q]));
      const sub = await call('POST', `/learning/exam-attempts/${ex.body.attemptId}/submit`, ALUNO, { answers: ex.body.questions.map((q) => ({ questionId: q.id, ...answerFor(byId.get(q.id), true) })) });
      ok(sub.status === 201 && sub.body.passed === true && sub.body.scorePct === 100, `certificação com tipos mistos (${[...new Set(ex.body.questions.map((q) => q.type))].join(', ')}) aprovada com 100%`, { status: sub.status, passed: sub.body.passed, score: sub.body.scorePct, msg: sub.body.message });
    }
  }
}

// ---------------------------------------------------------------- idempotência
const again = await call('POST', '/master/content/imports', MASTER, { content, filename: 'folks-content.json', label: 'reenvio' });
const plan2 = await call('POST', `/master/content/imports/${again.body.id}/plan`, MASTER, {});
const pl2 = plan2.body.plan ?? plan2.body;
ok(pl2.hasChanges === false, 'reenviar o mesmo arquivo não muda nada (idempotente)', pl2.summary);

console.log(`\n${total - fails}/${total} verificações — ${fails === 0 ? 'TODAS PASSARAM' : fails + ' FALHA(S)'}`);
process.exit(fails ? 1 : 0);
