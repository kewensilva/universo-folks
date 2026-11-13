// e2e: curso com progresso não é sobrescrito; arquivar o antigo libera importar a trilha nova sem perder histórico.
// Uso (dentro de backend/, API na porta indicada apontando para o banco):
//   BACKEND_DIR=$PWD DB=<banco> API_URL=http://localhost:3011/api node test/e2e/arquivar-e-recriar-curso.mjs <folks-content.json> [codigo-do-curso-antigo]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const API = process.env.API_URL ?? 'http://localhost:3011/api';
const DB = process.env.DB ?? 'universo_folks_test_tipos4';
const [FILE, OLD = 'feedback-0'] = process.argv.slice(2);
const NEW_KEY = 'feedback.fundamentos-do-feedback';
let fails = 0, total = 0;
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 300) : ''}`); if (!c) fails++; };
const call = async (m, p, t, b) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); const x = await r.text(); try { return { status: r.status, body: JSON.parse(x) }; } catch { return { status: r.status, body: x }; } };
const sql = (q) => JSON.parse(execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'folks', '-d', DB, '-tAc', q], { cwd: process.env.BACKEND_DIR, encoding: 'utf8' }).trim() || 'null');
for (let i = 0; i < 40; i++) { try { if ((await fetch(API.replace('/api', '/health'))).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

const T = (await call('POST', '/auth/login', null, { email: 'master@folks.com.br', password: 'TroqueEssaSenha123' })).body.accessToken;
ok(!!T, 'MASTER faz login');
const old = sql(`select json_build_object('id', id, 'status', status, 'enrollments', (select count(*) from enrollments e where e.course_id=c.id), 'progress', (select count(*) from lesson_progress lp join lessons l on l.id=lp.lesson_id join units u on u.id=l.unit_id where u.course_id=c.id), 'certs', (select count(*) from certificates x where x.course_id=c.id)) from courses c where code='${OLD}'`);
ok(!!old, `curso antigo ${OLD} existe`, old);
const content = readFileSync(FILE, 'utf8');

// 1. antes de arquivar: conflito
const up1 = await call('POST', '/master/content/imports', T, { content, filename: 'folks-content.json', label: 'antes de arquivar' });
const p1 = (await call('POST', `/master/content/imports/${up1.body.id}/plan`, T, {})).body;
const fb1 = (p1.plan ?? p1).planets.find((p) => p.slug === 'feedback');
ok(fb1.courses[0].action === 'CONFLICT', 'antes de arquivar: Feedback em CONFLICT (tem progresso)', fb1.courses[0]);

// 2. arquivar pela rota do MASTER (arquiva em vez de apagar quando há progresso; fica auditado)
const del = await call('DELETE', `/master/content/courses/${old.id}`, T);
ok(del.status === 200 && del.body.archived === true, 'MASTER arquiva o curso antigo (não apaga)', del.body);
ok(sql(`select to_json(status) from courses where id='${old.id}'`) === 'ARCHIVED', 'curso antigo agora ARCHIVED');
ok(sql(`select count(*) from audit_logs where action='course.archive' and entity_id='${old.id}'`) >= 1, 'arquivamento registrado na auditoria');

// 3. reimportar: cria o novo
const p2 = (await call('POST', `/master/content/imports/${up1.body.id}/plan`, T, {})).body;
const fb2 = (p2.plan ?? p2).planets.find((p) => p.slug === 'feedback');
ok(fb2.courses[0].action === 'CREATE', 'depois de arquivar: Feedback vira CREATE', fb2.courses[0]);
const ap = await call('POST', `/master/content/imports/${up1.body.id}/apply`, T, { publish: false, planets: ['feedback'] });
ok(ap.status === 200 && ['APPLIED', 'PARTIAL'].includes(ap.body.status), 'trilha nova do Feedback gravada', { status: ap.status, st: ap.body.status, msg: ap.body.message });
const neu = sql(`select json_build_object('status', status, 'units', (select count(*) from units u where u.course_id=c.id), 'qs', (select count(*) from questions q join lessons l on l.id=q.lesson_id join units u on u.id=l.unit_id where u.course_id=c.id) + (select count(*) from questions q join exams e on e.id=q.exam_id where e.course_id=c.id)) from courses c where code='${NEW_KEY}'`);
ok(neu && neu.units === 4 && neu.qs > 100, 'curso novo com 4 unidades e o banco de questões', neu);

// 4. histórico preservado
const after = sql(`select json_build_object('status', status, 'enrollments', (select count(*) from enrollments e where e.course_id=c.id), 'progress', (select count(*) from lesson_progress lp join lessons l on l.id=lp.lesson_id join units u on u.id=l.unit_id where u.course_id=c.id), 'certs', (select count(*) from certificates x where x.course_id=c.id)) from courses c where id='${old.id}'`);
ok(after.enrollments === old.enrollments && after.progress === old.progress && after.certs === old.certs, 'matrículas, progresso e certificados do curso antigo intactos', { antes: old, depois: after });
ok(sql(`select count(*) from courses where planet_id=(select id from planets where slug='feedback')`) === 2, 'Feedback tem 2 cursos: o antigo (arquivado) e o novo');

// 5. idempotente
const up3 = await call('POST', '/master/content/imports', T, { content, filename: 'folks-content.json', label: 'reenvio' });
const p3 = (await call('POST', `/master/content/imports/${up3.body.id}/plan`, T, {})).body;
ok((p3.plan ?? p3).hasChanges === false, 'reenviar não muda mais nada', (p3.plan ?? p3).summary);

console.log(`\n${total - fails}/${total} verificações — ${fails === 0 ? 'TODAS PASSARAM' : fails + ' FALHA(S)'}`);
process.exit(fails ? 1 : 0);
