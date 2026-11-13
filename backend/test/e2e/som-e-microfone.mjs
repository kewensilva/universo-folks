// e2e: cursos de som (aula de som, "ouça e responda", microfone e prática gerada de ouvido).
// Rode contra um banco DE TESTE (skill testes-e2e):
//   bash ../skills/testes-e2e/banco-teste.sh criar som
//   PORT=3011 DATABASE_URL=...universo_folks_test_som node dist/main.js
//   API_URL=http://localhost:3011/api node test/e2e/som-e-microfone.mjs
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

// ---- catálogo: metodologia do microfone e modelo de trilha de som
const meths = (await call('GET', '/master/methodologies', M)).body;
const list = Array.isArray(meths) ? meths : meths?.items ?? [];
ok(list.some((m) => m.code === 'play_or_sing_note' && m.status === 'ACTIVE' && m.answerFormats.includes('SIMULATOR')), 'metodologia "Tocar ou cantar a nota (microfone)" ativa', list.map((m) => m.code));
ok(/NOTES/.test(list.find((m) => m.code === 'listen_choose')?.guidance ?? ''), '"Ouvir e escolher" orienta som sintetizado e arquivo');
const tpls = (await call('GET', '/master/trail-templates', M)).body;
ok((Array.isArray(tpls) ? tpls : tpls?.items ?? []).some((t) => t.code === 'som-e-pratica'), 'modelo de trilha "Som e prática em cada unidade" existe');

// ---- curso de som criado pelo painel/MCP (formato completo de questão)
const planets = (await call('GET', '/master/content/planets', M)).body;
const planet = planets.find((p) => p.slug === 'musica') ?? planets[0];
const slug = `som-e2e-${RUN}`;
const course = {
  title: `Som E2E ${RUN}`, slug, status: 'PUBLISHED', accessTier: 'FREE', trailTemplate: 'som-e-pratica',
  units: [{ title: 'Unidade de som', accessTier: 'FREE', lessons: [
    { type: 'LESSON', title: 'Aula de som', content: { slides: [{ heading: 'Grave e agudo', text: 'Ouça.', audioDemos: [{ label: 'Grave', sequence: [['n', 'E2']] }, { label: 'Agudo', sequence: [['n', 'E4']] }] }] } },
    { type: 'PRACTICE', title: 'Ouça e afine', questions: [
      { type: 'SINGLE_CHOICE', methodology: 'listen_choose', prompt: 'A segunda nota é mais grave?', audio: { kind: 'NOTES', sequence: [['n', 'A2'], ['n', 'E2']] }, options: [{ text: 'Sim', isCorrect: true }, { text: 'Não', isCorrect: false }] },
      { type: 'SIMULATOR', methodology: 'play_or_sing_note', prompt: 'Toque a 5ª corda solta', simulator: { id: 'mic_pitch', target: 'A2', instrument: 'violao' } },
    ] },
    { type: 'GENERATED_PRACTICE', title: 'Treino de ouvido', generators: ['pitch_tone', 'tune'], questionCount: 4 },
  ] }],
};
const bad = await call('POST', `/master/content/planets/${planet.id}/import/course`, M, { ...course, slug: `${slug}-x`, units: [{ ...course.units[0], lessons: [{ type: 'PRACTICE', title: 'Ruim', questions: [{ type: 'SIMULATOR', prompt: 'Toque algo', simulator: { id: 'mic_pitch' } }] }] }] });
ok(bad.status === 400, 'microfone sem nota é recusado com mensagem', bad.body?.issues?.[0]?.message);
const imp = await call('POST', `/master/content/planets/${planet.id}/import/course`, M, course);
ok(imp.status === 201 || imp.status === 200, 'curso com aula de som, "ouça e responda" e microfone é criado', imp.body?.issues ?? imp.status);

// ---- aluno estuda
const email = `som-${RUN}@teste.example`;
const reg = await call('POST', '/auth/register', null, { name: 'Aluno Som', email, password: `Senha${RUN}1`, birthDate: '1995-06-15' });
const T = reg.body.accessToken;
const cat = (await call('GET', `/catalog/planets/${planet.slug}`, T)).body;
const c = cat.courses.find((x) => x.slug === slug);
const trail = (await call('GET', `/learning/courses/${c.id}/trail`, T)).body;
const [aula, pratica, gerada] = trail.units[0].lessons;
const lesson = (await call('GET', `/learning/lessons/${aula.id}`, T)).body;
ok(lesson.content?.slides?.[0]?.audioDemos?.length === 2 && lesson.content.slides[0].audioDemos[0].sequence[0][1] === 'E2', 'aula de som chega ao app com os sons da tela', lesson.content?.slides?.[0]?.audioDemos);
ok((await call('POST', `/learning/lessons/${aula.id}/complete`, T)).status < 300, 'aluno conclui a aula de som');

const p = (await call('GET', `/learning/lessons/${pratica.id}`, T)).body;
const qListen = p.questions.find((q) => q.type === 'SINGLE_CHOICE');
const qMic = p.questions.find((q) => q.type === 'SIMULATOR');
ok(qListen?.audio?.kind === 'NOTES' && qListen.audio.sequence.length === 2, '"ouça e responda" chega com o som (notas) para o app tocar', qListen?.audio);
ok(qMic?.simulator?.id === 'mic_pitch' && qMic.simulator.target === 'A2', 'questão de microfone chega com a nota pedida', qMic?.simulator);
ok(!JSON.stringify(qListen).includes('isCorrect'), 'resposta certa não vai para o app');
const sub = await call('POST', `/learning/lessons/${pratica.id}/practice`, T, { answers: [
  { questionId: qListen.id, optionIds: [qListen.options.find((o) => o.text === 'Sim').id] },
  { questionId: qMic.id, simulator: { correct: true, values: { cents: -8 } } },
] });
const res = sub.body.result ?? sub.body;
ok(sub.status < 300 && res.correct === 2 && res.total === 2, 'servidor corrige o "ouça e responda" e aceita o resultado do microfone', res);

const g = (await call('GET', `/learning/lessons/${gerada.id}`, T)).body;
ok(g.questionSource === 'GENERATED' && g.generators.join() === 'pitch_tone,tune' && g.questionCount === 4, 'prática gerada de ouvido/microfone traz os geradores para o app', g);
ok((await call('POST', `/learning/lessons/${gerada.id}/practice-result`, T, { correct: 9, total: 4 })).status === 400, 'resultado gerado impossível (9 de 4) é recusado');
const gr = await call('POST', `/learning/lessons/${gerada.id}/practice-result`, T, { correct: 3, total: 4 });
ok(gr.status < 300 && gr.body.scorePct === 75 && gr.body.passed === true, 'resultado da prática gerada é gravado (3 de 4)', gr.body);

// ---- o Claude (MCP) cria questão de som e de microfone pelo add_question
const pat = await call('POST', '/master/api-tokens', M, { name: 'e2e som', expiresInDays: 1 });
const mcp = async (name, args = {}) => {
  const r = await call('POST', `${ROOT}/mcp`, pat.body.token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return { raw: r.body, data: (() => { try { return JSON.parse(r.body?.result?.content?.[0]?.text ?? 'null'); } catch { return r.body?.result?.content?.[0]?.text; } })() };
};
const tl = await call('POST', `${ROOT}/mcp`, pat.body.token, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
ok(Array.isArray(tl.body?.result?.tools) && tl.body.result.tools.some((t) => t.name === 'add_question'), 'MCP: lista de tools continua funcionando com o novo formato de questão', tl.body?.error);
const added = await mcp('add_question', { lessonId: pratica.id, question: { type: 'SIMULATOR', methodology: 'play_or_sing_note', prompt: 'Cante a nota Dó', simulator: { id: 'mic_pitch', target: 'C4', instrument: 'voz' } } });
ok(added.data?.type === 'SIMULATOR' && added.data?.data?.simulator?.target === 'C4', 'MCP: add_question cria a questão de microfone (formato completo)', added.data ?? added.raw);
await call('DELETE', `/master/api-tokens/${pat.body.id}`, M);

console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
