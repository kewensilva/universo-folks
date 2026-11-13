// e2e (ADR 0013): menus Metodologia e Personalização de trilha do MASTER.
// Uso: API rodando (API_URL, padrão http://localhost:3000/api) e um MASTER de teste.
//   node test/e2e/catalogo-metodologias-e-modelos.mjs
// Cria só itens de teste (prefixo e2e) e apaga tudo no fim. A importação de teste é descartada, nunca gravada.
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const ROOT = API.replace(/\/api\/?$/, '');
let fails = 0, total = 0;
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 220) : ''}`); if (!c) fails++; };
const call = async (method, path, token, body) => {
  const r = await fetch(path.startsWith('http') ? path : API + path, { method, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { const m = t.match(/data: (.*)/); try { j = m ? JSON.parse(m[1]) : t; } catch { j = t; } }
  return { status: r.status, body: j };
};

const M = (await call('POST', '/auth/login', null, { email: process.env.MASTER_EMAIL ?? 'master@folks.com.br', password: process.env.MASTER_PASSWORD ?? 'TroqueEssaSenha123' })).body.accessToken;
ok(!!M, 'MASTER faz login');
const cleanup = [];

// ---------------------------------------------------------------- metodologias
const list = await call('GET', '/master/methodologies', M);
ok(list.status === 200 && list.body.length >= 21, 'lista o catálogo inicial (18 de prática + 3 de captura)', list.body.length);
const tf = list.body.find((m) => m.code === 'true_false');
const voz = list.body.find((m) => m.code === 'voice_simulation');
ok(tf?.isSystem && tf.status === 'ACTIVE', 'mito ou verdade vem ativa e do sistema');
ok(voz?.status === 'COMING_SOON' && voz.capture, 'simulação por voz vem como "em breve" (captura)');
ok((await call('PATCH', `/master/methodologies/${voz.id}`, M, { status: 'ACTIVE' })).status === 400, 'captura não pode ficar ativa enquanto o app não captura');
ok((await call('DELETE', `/master/methodologies/${tf.id}`, M)).status === 400, 'metodologia do sistema não é excluída');

const novo = await call('POST', '/master/methodologies', M, { code: 'e2e_quiz_relampago', name: 'E2E Quiz relâmpago', answerFormats: ['SINGLE_CHOICE'], guidance: 'Perguntas curtas.', status: 'ACTIVE' });
ok(novo.status === 201, 'MASTER cria uma metodologia', novo.body);
if (novo.body?.id) cleanup.push(() => call('DELETE', `/master/methodologies/${novo.body.id}`, M));
ok((await call('POST', '/master/methodologies', M, { code: 'e2e_quiz_relampago', name: 'Duplicada', answerFormats: ['SINGLE_CHOICE'] })).status === 409, 'código repetido é recusado');
ok((await call('POST', '/master/methodologies', M, { code: 'Código Ruim', name: 'X', answerFormats: [] })).status === 400, 'código e tipos de resposta inválidos são recusados');
const off = await call('PATCH', `/master/methodologies/${novo.body.id}`, M, { status: 'INACTIVE' });
ok(off.status === 200 && off.body.status === 'INACTIVE', 'MASTER desativa a metodologia');
const renamed = await call('PATCH', `/master/methodologies/${novo.body.id}`, M, { name: 'E2E Quiz relâmpago (renomeada)' });
ok(renamed.status === 200 && renamed.body.status === 'INACTIVE', 'PATCH só do nome não reativa a metodologia', renamed.body?.status);

// ----------------------------------------------------------- modelos de trilha
const tpls = await call('GET', '/master/trail-templates', M);
ok(tpls.status === 200 && ['video-e-pratica', 'videos-e-pratica-no-fim', 'so-pratica'].every((c) => tpls.body.some((t) => t.code === c)), 'lista os 3 modelos de exemplo');
ok((await call('POST', '/master/trail-templates', M, { name: 'E2E vazio', structure: { unitSteps: [] } })).status === 400, 'modelo sem etapas é recusado');
ok((await call('POST', '/master/trail-templates', M, { name: 'E2E metodologia inexistente', structure: { unitSteps: [{ kind: 'PRACTICE', min: 1 }], methodologies: ['nao_existe'] } })).status === 400, 'modelo com metodologia inexistente é recusado');
const tpl = await call('POST', '/master/trail-templates', M, { code: 'e2e-video-pratica', name: 'E2E Vídeo e prática', structure: { unitSteps: [{ kind: 'VIDEO', min: 1 }, { kind: 'PRACTICE', min: 1 }], exam: false, methodologies: ['true_false'] } });
ok(tpl.status === 201 && tpl.body.code === 'e2e-video-pratica', 'MASTER cria um modelo de trilha', tpl.body);
if (tpl.body?.id) cleanup.push(() => call('DELETE', `/master/trail-templates/${tpl.body.id}`, M));

// --------------------------------------------- o token do Claude só LÊ (pelo MCP)
const pat = await call('POST', '/master/api-tokens', M, { name: 'e2e catálogo', expiresInDays: 1 });
cleanup.push(() => call('DELETE', `/master/api-tokens/${pat.body.id}`, M));
ok((await call('GET', '/master/methodologies', pat.body.token)).status === 403, 'token do Claude não acessa a rota de metodologias (REST)');
ok((await call('POST', '/master/trail-templates', pat.body.token, { name: 'x', structure: { unitSteps: [{ kind: 'VIDEO' }] } })).status === 403, 'token do Claude não cria modelo de trilha');
const mcp = async (name, args = {}) => {
  const r = await call('POST', `${ROOT}/mcp`, pat.body.token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return JSON.parse(r.body?.result?.content?.[0]?.text ?? 'null');
};
const mm = await mcp('list_methodologies');
ok(Array.isArray(mm) && mm.some((m) => m.code === 'true_false') && !mm.some((m) => m.code === 'voice_simulation' || m.code === 'e2e_quiz_relampago'), 'MCP: Claude vê só metodologias ativas (sem "em breve" e sem as inativas)');
const mt = await mcp('list_trail_templates');
ok(Array.isArray(mt) && mt.some((t) => t.code === 'e2e-video-pratica' && t.structure?.unitSteps?.length === 2), 'MCP: Claude vê os modelos ativos com a estrutura');

// --------------------------------------------- importação confere e só avisa
const bundle = {
  schemaVersion: 'folks.content/v1',
  planets: [{ key: 'e2e-catalogo', slug: 'e2e-catalogo', name: 'E2E Catálogo', category: 'para-o-trabalho', courses: [{
    key: 'e2e-catalogo.curso', slug: 'curso', title: 'Curso E2E', hasCertificate: false, trailTemplate: 'e2e-video-pratica',
    units: [
      { title: 'U1', lessons: [{ type: 'VIDEO', title: 'V1', vimeoUrl: 'https://vimeo.com/1246364597/9b31587cc2' }, { type: 'PRACTICE', title: 'P1', questions: [
        { type: 'TRUE_FALSE', methodology: 'true_false', prompt: 'Afirmação A?', options: [{ text: 'Mito', isCorrect: true }, { text: 'Verdade', isCorrect: false }] },
        { type: 'SINGLE_CHOICE', methodology: 'e2e_quiz_relampago', prompt: 'Pergunta B?', options: [{ text: 'x', isCorrect: true }, { text: 'y', isCorrect: false }] },
      ] }] },
      { title: 'U2', lessons: [{ type: 'PRACTICE', title: 'P2', questions: [{ type: 'TRUE_FALSE', methodology: 'true_false', prompt: 'Afirmação C?', options: [{ text: 'Mito', isCorrect: true }, { text: 'Verdade', isCorrect: false }] }] }] },
    ],
  }] }],
};
const imp = await call('POST', '/master/content/imports', M, { content: bundle, label: 'e2e catálogo (descartar)' });
if (imp.body?.id) cleanup.push(() => call('DELETE', `/master/content/imports/${imp.body.id}`, M));
const codes = (imp.body?.issues ?? []).map((i) => i.code);
ok(imp.status === 201 && imp.body.errors === 0 && imp.body.status === 'VALIDATED', 'avisos do catálogo não bloqueiam a importação', [imp.body?.errors, imp.body?.status]);
ok(codes.includes('trail_template.mismatch'), 'unidade 2 sem vídeo: avisa que foge do modelo', codes);
ok(codes.includes('methodology.inactive'), 'metodologia desativada: avisa');
ok(!codes.includes('methodology.unknown'), 'metodologias do catálogo não aparecem como desconhecidas', (imp.body?.issues ?? []).filter((i) => i.code === 'methodology.unknown'));
ok(codes.includes('trail_template.methodology'), 'metodologia fora das permitidas pelo modelo: avisa');

// ---------------------------------------------- regras de exclusão e limpeza
for (const f of cleanup.reverse()) await f();
ok((await call('GET', '/master/methodologies', M)).body.every((m) => m.code !== 'e2e_quiz_relampago'), 'metodologia de teste removida');
ok((await call('GET', '/master/trail-templates', M)).body.every((t) => t.code !== 'e2e-video-pratica'), 'modelo de teste removido');

console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
