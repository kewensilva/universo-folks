// e2e: progresso de vídeo (anti-pulo) e engajamento ao rever um vídeo já concluído.
// Uso: API rodando (API_URL, padrão http://localhost:3000/api), um MASTER de teste e um planeta com vídeos.
//   COURSE_ID=<id do curso> DATABASE_CHECK=1 node test/e2e/video-progresso.mjs
// O roteiro estuda como "Individual" do MASTER: avança só o necessário (no máximo 15 s de um vídeo novo).
const API = process.env.API_URL ?? 'http://localhost:3000/api';
let fails = 0, total = 0;
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 200) : ''}`); if (!c) fails++; };
const call = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};

const login = await call('POST', '/auth/login', null, { email: process.env.MASTER_EMAIL ?? 'master@folks.com.br', password: process.env.MASTER_PASSWORD ?? 'TroqueEssaSenha123' });
const sw = await call('POST', '/auth/switch-context', login.body.accessToken, { mode: 'B2C' });
const T = sw.body.accessToken;
ok(!!T, 'entra como Individual');

let courseId = process.env.COURSE_ID;
if (!courseId) {
  const p = await call('GET', '/catalog/planets/feedback', T);
  courseId = (p.body.courses ?? p.body.planet?.courses ?? [])[0]?.id;
}
const trail = (await call('GET', `/learning/courses/${courseId}/trail`, T)).body;
const lessons = trail.units.flatMap((u) => u.lessons.map((l) => ({ ...l, locked: u.locked })));

// 1) anti-pulo: dois envios seguidos dizendo "assisti tudo" só avançam o tempo real decorrido
const fresh = lessons.find((l) => l.type === 'VIDEO' && l.state === 'AVAILABLE' && !l.locked);
if (fresh) {
  const r1 = await call('POST', `/learning/lessons/${fresh.id}/video-progress`, T, { watchedSeconds: 5000 });
  const r2 = await call('POST', `/learning/lessons/${fresh.id}/video-progress`, T, { watchedSeconds: 5000, ended: true });
  if (r1.body.completed) console.log('… este vídeo já tinha acumulado tempo real suficiente: pulei o teste do anti-pulo');
  else {
    ok(r2.status === 201 && r2.body.completed === false, 'pular direto para o fim NÃO conclui o vídeo', r2.body);
    ok((r2.body.watchedSeconds ?? 0) - (r1.body.watchedSeconds ?? 0) <= 2, 'o segundo envio só avança o tempo real (até 2x)', [r1.body.watchedSeconds, r2.body.watchedSeconds]);
  }
} else console.log('… sem vídeo liberado neste curso: pulei o teste do anti-pulo');

// 2) vídeo já concluído: envios de progresso não registram atividade; o fim conta uma vez, sem XP
const doneVideo = lessons.find((l) => l.type === 'VIDEO' && l.state === 'COMPLETED');
if (doneVideo) {
  const before = (await call('GET', `/learning/lessons/${doneVideo.id}`, T)).body;
  const dur = before.video?.durationSeconds ?? 60;
  const a = await call('POST', `/learning/lessons/${doneVideo.id}/video-progress`, T, { watchedSeconds: dur });
  const b = await call('POST', `/learning/lessons/${doneVideo.id}/video-progress`, T, { watchedSeconds: dur });
  ok(a.body.completed && a.body.alreadyCompleted && !a.body.gamification && !b.body.gamification, 'rever: envios de progresso não registram atividade de novo', [a.body, b.body]);
  const e = await call('POST', `/learning/lessons/${doneVideo.id}/video-progress`, T, { watchedSeconds: dur, ended: true });
  ok(e.body.completed && e.body.alreadyCompleted, 'rever até o fim conta como engajamento (sem XP)', e.body);
  ok(!!a.body.next && !!e.body.next, 'rever também informa a próxima etapa', [a.body.next, e.body.next]);
} else console.log('… nenhum vídeo concluído ainda: pulei o teste de rever');

console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
