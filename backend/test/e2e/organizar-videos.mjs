// e2e: quadro "Organizar vídeos" do MASTER (equívocos de quem criou o planeta, ex.: o Claude).
// Usa a pasta real "Excel - Iniciante" do Vimeo (30131059), só leitura: precisa do VIMEO_ACCESS_TOKEN na API.
// Rode contra um banco DE TESTE (skill testes-e2e):
//   bash ../skills/testes-e2e/banco-teste.sh criar videos
//   PORT=3011 DATABASE_URL=...universo_folks_test_videos node dist/main.js
//   API_URL=http://localhost:3011/api node test/e2e/organizar-videos.mjs
const API = process.env.API_URL ?? 'http://localhost:3011/api';
const ROOT = API.replace(/\/api\/?$/, '');
const RUN = Date.now().toString(36);
let fails = 0, total = 0;
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 260) : ''}`); if (!c) fails++; };
const call = async (method, path, token, body) => {
  const r = await fetch(path.startsWith('http') ? path : API + path, { method, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { const m = t.match(/data: (.*)/); try { j = m ? JSON.parse(m[1]) : t; } catch { j = t; } }
  return { status: r.status, body: j };
};
const M = (await call('POST', '/auth/login', null, { email: process.env.MASTER_EMAIL ?? 'master@folks.com.br', password: process.env.MASTER_PASSWORD ?? 'TroqueEssaSenha123' })).body.accessToken;
ok(!!M, 'MASTER faz login');

// pasta real: Módulo 1 (vídeos 1-5) e Módulo 2
const tree = (await call('GET', '/master/content/vimeo/folders/30131059/tree', M)).body;
const mod = (n) => tree.folders.find((f) => f.name.includes(String(n)));
const vid = (m, n) => mod(m).videos.find((v) => new RegExp(`V[ií]deo\\s*${n}\\b`, 'i').test(v.name));
const url = (v) => `https://vimeo.com/${v.id}/${v.hash}`;
ok(mod(1)?.videos.length === 5 && mod(2)?.videos.length === 5, 'lê a pasta com subpastas no Vimeo (Módulo 1 e 2 com 5 vídeos)');

// planeta montado ERRADO de propósito
const practice = (t) => ({ type: 'PRACTICE', title: `Prática ${t}`, questions: [{ type: 'TRUE_FALSE', methodology: 'true_false', prompt: `Afirmação sobre ${t}?`, options: [{ text: 'Verdade', isCorrect: true }, { text: 'Mito', isCorrect: false }] }] });
const unit = (t, v) => ({ title: t, lessons: [{ type: 'VIDEO', title: `Vídeo ${t}`, vimeoUrl: v ? url(v) : null }, practice(t)] });
const slug = `e2e-videos-${RUN}`;
const bundle = { schemaVersion: 'folks.content/v1', planets: [{ key: slug, slug, name: `E2E Vídeos ${RUN}`, category: 'para-o-trabalho', accessTier: 'PREMIUM', vimeoFolder: '30131059', courses: [{
  key: `${slug}.curso`, slug: 'curso', title: 'Curso E2E', hasCertificate: false, trailTemplate: 'video-e-pratica',
  units: [unit('U1', vid(1, 2)), unit('U2', vid(1, 1)), unit('U3', vid(2, 1)), unit('U4', vid(1, 2)), unit('U5', null)],
}] }] };
const imp = await call('POST', '/master/content/imports', M, { content: bundle, label: 'e2e organizar vídeos' });
const applied = await call('POST', `/master/content/imports/${imp.body.id}/apply`, M, { publish: false });
ok(applied.status === 200 && applied.body.status === 'APPLIED', 'importa o planeta (com vimeoFolder) mesmo com vídeo faltando', [imp.body?.errors, applied.body?.status]);

let b = (await call('GET', `/master/content/planets/${slug}/video-board`, M)).body;
const codes = () => b.issues.map((i) => i.code);
const lessonsOf = () => b.courses[0].units.map((u) => u.lessons.find((l) => l.type === 'VIDEO'));
ok(b.planet.vimeoFolderId === '30131059' && b.folder?.modules.length === 5, 'quadro usa a pasta do planeta gravada pela importação', b.planet);
ok(b.folder.modules.map((m) => m.name).join() === 'Módulo 1,Módulo 2,Módulo 3,Módulo 4,Módulo 5', 'módulos da pasta em ordem numérica');
ok(b.courses[0].moduleName === 'Módulo 1', 'reconhece o módulo do curso pela maioria dos vídeos', b.courses[0].moduleName);
ok(codes().includes('MISSING'), 'aponta etapa sem vídeo (U5)');
ok(codes().includes('DUPLICATE'), 'aponta vídeo repetido (Vídeo 2 em U1 e U4)');
ok(codes().includes('WRONG_MODULE'), 'aponta vídeo de outro módulo (Módulo 2 em U3)');
ok(codes().includes('ORDER'), 'aponta vídeos fora de ordem (Vídeo 2 antes do Vídeo 1)');
ok(b.issues.filter((i) => i.code === 'UNUSED').length >= 3, 'aponta vídeos da pasta não usados (Vídeos 3, 4 e 5 do Módulo 1)');

// regras de validação
const [l1, l2, l3, l4, l5] = lessonsOf();
const practiceId = b.courses[0].units[0].lessons.find((l) => l.type === 'PRACTICE').id;
const unitIds = b.courses[0].units.map((u) => u.id);
ok((await call('PUT', `/master/content/planets/${slug}/video-board`, M, { assignments: [{ lessonId: practiceId, videoId: vid(1, 1).id }] })).status === 400, 'não coloca vídeo em etapa de prática');
ok((await call('PUT', `/master/content/planets/${slug}/video-board`, M, { unitOrder: [{ courseId: b.courses[0].id, unitIds: unitIds.slice(1) }] })).status === 400, 'ordem de unidades precisa ter todas as unidades');
const other = (await call('GET', '/master/content/planets/matematica/video-board', M));
if (other.status === 200 && other.body.courses?.[0]) {
  const foreign = other.body.courses[0].units[0].lessons[0].id;
  ok((await call('PUT', `/master/content/planets/${slug}/video-board`, M, { assignments: [{ lessonId: foreign, videoId: vid(1, 1).id }] })).status === 400, 'não mexe em etapa de outro planeta');
}

// correção do MASTER: vídeos 1..5 nas unidades, sem repetição, e títulos
const fix = await call('PUT', `/master/content/planets/${slug}/video-board`, M, {
  assignments: [l1, l2, l3, l4, l5].map((l, i) => ({ lessonId: l.id, videoId: vid(1, i + 1).id })),
  titles: [{ lessonId: l1.id, title: 'Por que o Excel existe' }],
});
b = fix.body;
ok(fix.status === 200 && b.issues.filter((i) => i.code !== 'UNUSED' && i.code !== 'NOT_IN_FOLDER').length === 0, 'depois da correção não sobra equívoco no curso', b.issues?.filter((i) => i.code !== 'UNUSED').map((i) => i.code));
ok(lessonsOf().map((l) => l.video.number).join() === '1,2,3,4,5', 'vídeos 1 a 5 na ordem da trilha');
ok(lessonsOf()[0].title === 'Por que o Excel existe' && lessonsOf()[0].video.durationSeconds > 0, 'título corrigido e duração do vídeo gravada');

// reordenar unidades e etapas
const rev = [...unitIds].reverse();
b = (await call('PUT', `/master/content/planets/${slug}/video-board`, M, { unitOrder: [{ courseId: b.courses[0].id, unitIds: rev }] })).body;
ok(b.courses[0].units.map((u) => u.id).join() === rev.join() && codes().includes('ORDER'), 'inverter as unidades faz o quadro apontar a ordem errada');
b = (await call('PUT', `/master/content/planets/${slug}/video-board`, M, { unitOrder: [{ courseId: b.courses[0].id, unitIds }] })).body;
const u1 = b.courses[0].units[0];
b = (await call('PUT', `/master/content/planets/${slug}/video-board`, M, { lessonOrder: [{ unitId: u1.id, lessonIds: [...u1.lessons.map((l) => l.id)].reverse() }] })).body;
ok(b.courses[0].units[0].lessons[0].type === 'PRACTICE', 'reordena as etapas de uma unidade');

// o Claude também revisa e corrige pelo MCP (token de conteúdo)
const pat = await call('POST', '/master/api-tokens', M, { name: 'e2e vídeos', expiresInDays: 1 });
const mcp = async (name, args = {}) => {
  const r = await call('POST', `${ROOT}/mcp`, pat.body.token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return JSON.parse(r.body?.result?.content?.[0]?.text ?? 'null');
};
const rv = await mcp('review_planet_videos', { idOrSlug: slug });
ok(Array.isArray(rv?.issues) && rv.courses?.length === 1, 'MCP: review_planet_videos devolve o quadro');
const tr = await mcp('vimeo_folder_tree', { folderId: '30131059' });
ok(tr?.folders?.length === 5, 'MCP: vimeo_folder_tree lista as subpastas');
await call('DELETE', `/master/api-tokens/${pat.body.id}`, M);

console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
