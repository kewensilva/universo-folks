import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest, planImport, courseHash, planetHash, jsonSchema, CONVERSION_PROMPT, type ChoiceQuestion, type Snapshot } from '../src';

const fx = (f: string) => readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', f), 'utf8');
const codes = (r: ReturnType<typeof ingest>, sev?: string) => r.issues.filter((i) => !sev || i.severity === sev).map((i) => i.code);
const questions = (r: ReturnType<typeof ingest>) =>
  r.bundle.planets.flatMap((p) => p.courses).flatMap((c) => c.units).flatMap((u) => u.lessons).flatMap((l) => (l.type === 'PRACTICE' ? l.questions : [])) as ChoiceQuestion[];

test('JSON do Claude em português com variações de chave vira formato canônico válido', () => {
  const r = ingest({ content: fx('claude-pt.json') });
  assert.equal(r.errors, 0, JSON.stringify(r.issues.filter((i) => i.severity === 'error')));
  assert.ok(r.valid);
  assert.equal(r.stats.planets, 2);
  assert.equal(r.stats.courses, 3);
  const [neg, mus] = r.bundle.planets;
  assert.equal(neg.category, 'para-o-trabalho');
  assert.equal(neg.accessTier, 'PREMIUM');
  assert.equal(neg.courses[0].hasCertificate, true, 'curso "para o trabalho" ganha certificado por padrão');
  assert.equal(neg.courses[0].key, 'negociacao.negociacao-ganha-ganha');
  assert.equal(mus.category, 'para-a-vida');
  assert.equal(mus.accessTier, 'FREE');
  assert.equal(mus.courses[1].status, 'COMING_SOON', 'curso só com nome vira "Em breve"');
});

test('resposta correta por letra, mapa de letras, V/F, texto e objeto', () => {
  const qs = questions(ingest({ content: fx('claude-pt.json') }));
  const correct = qs.map((q) => q.options.find((o) => o.isCorrect)?.text);
  assert.deepEqual(correct, ['Um acordo bom para os dois', 'A melhor alternativa sem acordo', 'Verdadeiro', 'Preparar', 'Constante']);
  assert.ok(qs.every((q) => q.options.filter((o) => o.isCorrect).length === 1));
  assert.ok(qs.every((q) => !/^[a-h]\)/i.test(q.options[0].text)), 'prefixo "a)" removido das alternativas');
});

test('índice numérico da prova: base detectada no documento', () => {
  const r = ingest({ content: fx('claude-pt.json') });
  const exam = r.bundle.planets[0].courses[0].exam!;
  assert.equal(exam.questionSource, 'BANK');
  assert.deepEqual((exam.questions as ChoiceQuestion[]).map((q) => q.options.find((o) => o.isCorrect)?.text), ['w', 'um']);
  assert.ok(codes(r).includes('question.index_base'));
});

test('vídeo sem URL fica pendente (aviso, não erro) e tempo "3:20" vira segundos', () => {
  const r = ingest({ content: fx('claude-pt.json') });
  assert.equal(r.stats.videosPending, 1);
  assert.ok(codes(r, 'warning').includes('video.url_missing'));
  const video = r.bundle.planets[0].courses[0].units[0].lessons[1];
  assert.equal(video.type, 'VIDEO');
  assert.equal(video.type === 'VIDEO' && video.durationSeconds, 200);
});

test('formato do MCP (create_planet_tree): prática embutida no vídeo e telas em content.slides', () => {
  const r = ingest({ content: fx('mcp-tree.json') });
  assert.equal(r.errors, 0);
  const u = r.bundle.planets[0].courses[0].units;
  assert.deepEqual(u[0].lessons.map((l) => l.type), ['LESSON', 'VIDEO', 'PRACTICE']);
  assert.deepEqual(u.map((x) => x.accessTier), ['FREE', 'FREE', 'PREMIUM'], 'plano grátis: unidades 1-2 FREE');
  assert.equal(r.bundle.planets[0].courses[0].exam?.questionSource, 'GENERATED');
  assert.equal(r.bundle.planets[0].courses[0].badge?.name, 'Chef de Casa');
});

test('Markdown do chat: ignora conversa, reconhece níveis, vídeo, prática e desafio final', () => {
  const r = ingest({ content: fx('chat-markdown.md') });
  assert.equal(r.format, 'markdown');
  assert.equal(r.errors, 0, JSON.stringify(r.issues));
  assert.equal(r.bundle.planets.length, 1, 'frase de abertura do Claude não vira planeta');
  const p = r.bundle.planets[0];
  assert.equal(p.name, 'Liderança');
  assert.equal(p.category, 'para-o-trabalho');
  const c = p.courses[0];
  assert.equal(c.title, 'Liderança Situacional');
  assert.deepEqual(c.units[0].lessons.map((l) => l.type), ['LESSON', 'VIDEO', 'PRACTICE']);
  const qs = questions(r);
  assert.equal(qs.length, 2, 'pergunta terminada em ":" também é questão');
  assert.deepEqual(qs.map((q) => q.options.find((o) => o.isCorrect)?.text), ['Quatro', 'Experientes e motivados']);
  assert.equal((c.exam?.questions?.[0] as ChoiceQuestion).options.find((o) => o.isCorrect)?.text, 'Maturidade do liderado');
  const v = c.units[0].lessons[1];
  assert.equal(v.type === 'VIDEO' && v.vimeoUrl, 'https://vimeo.com/555666777/ff00aa');
});

test('JSON dentro do texto do chat, com vírgula sobrando, é extraído', () => {
  const r = ingest({ content: fx('chat-with-json.txt') });
  assert.equal(r.format, 'json-in-text');
  assert.equal(r.errors, 0);
  assert.equal(r.bundle.planets[0].name, 'Finanças pessoais');
  assert.equal(r.bundle.planets[0].courses[0].units.length, 3);
});

test('conteúdo quebrado: erros com caminho exato e nada é considerado válido', () => {
  const r = ingest({ content: fx('broken.json') });
  assert.equal(r.valid, null);
  const errs = r.issues.filter((i) => i.severity === 'error');
  assert.ok(errs.some((e) => e.code === 'question.no_correct' && e.path === 'planets[0].courses[0].units[0].lessons[0].questions[0]'));
  assert.ok(errs.some((e) => e.code === 'course.duplicate'));
  assert.ok(errs.some((e) => e.code === 'unit.empty'));
});

test('JSON inválido e texto vazio não derrubam o pipeline', () => {
  assert.ok(codes(ingest({ content: '{ "planetas": [ ' })).includes('json.parse'));
  const r = ingest({ content: 'só conversa, nada de conteúdo' });
  assert.ok(r.errors > 0);
});

// ------------------------------------------------------------- planejador
const snapOf = (r: ReturnType<typeof ingest>, opts: { progress?: boolean; changeHash?: boolean } = {}): Snapshot => ({
  categories: ['para-a-vida', 'para-o-trabalho', 'para-a-escola'],
  planets: r.valid!.planets.map((p, i) => ({
    id: `p${i}`,
    slug: p.slug,
    status: 'DRAFT',
    contentHash: planetHash(p),
    courses: p.courses.map((c, j) => ({ id: `c${i}${j}`, code: c.key, slug: c.slug, contentHash: opts.changeHash ? 'antigo' : courseHash(c), hasProgress: !!opts.progress, status: 'DRAFT' })),
  })),
});

test('planejador: banco vazio -> tudo CREATE', () => {
  const r = ingest({ content: fx('claude-pt.json') });
  const plan = planImport(r.valid!, { categories: ['para-a-vida', 'para-o-trabalho'], planets: [] });
  assert.ok(plan.planets.every((p) => p.action === 'CREATE'));
  assert.equal(plan.summary['course.CREATE'], 3);
  assert.equal(plan.hasChanges, true);
});

test('planejador: reimportar o mesmo conteúdo é idempotente (UNCHANGED)', () => {
  const r = ingest({ content: fx('claude-pt.json') });
  const plan = planImport(r.valid!, snapOf(r));
  assert.ok(plan.planets.every((p) => p.action === 'UNCHANGED'));
  assert.equal(plan.hasChanges, false);
});

test('planejador: trilha alterada sem progresso -> REPLACE; com progresso -> CONFLICT', () => {
  const r = ingest({ content: fx('claude-pt.json') });
  assert.ok(planImport(r.valid!, snapOf(r, { changeHash: true })).planets[0].courses.every((c) => c.action === 'REPLACE'));
  const withProgress = planImport(r.valid!, snapOf(r, { changeHash: true, progress: true }));
  assert.ok(withProgress.planets[0].courses.every((c) => c.action === 'CONFLICT'));
});

test('planejador: categoria inexistente bloqueia; create_only pula planeta existente', () => {
  const r = ingest({ content: fx('claude-pt.json') });
  const blocked = planImport(r.valid!, { categories: ['para-a-vida'], planets: [] });
  assert.equal(blocked.planets[0].action, 'BLOCKED');
  assert.equal(blocked.planets[1].action, 'CREATE');
  const co = planImport(r.valid!, snapOf(r, { changeHash: true }), 'create_only');
  assert.ok(co.planets.every((p) => p.action === 'SKIP'));
});

test('JSON Schema e prompt de conversão estão disponíveis', () => {
  const s = jsonSchema() as any;
  assert.equal(s.type, 'object');
  assert.ok(CONVERSION_PROMPT.includes('folks.content/v1'));
  // o exemplo do prompt deve ser aceito pelo próprio pipeline
  const example = CONVERSION_PROMPT.slice(CONVERSION_PROMPT.indexOf('{\n  "schemaVersion"')).replace('"questions": [ ... ]', '"questions": [ { "prompt": "Pergunta?", "options": [ { "text": "a", "isCorrect": true }, { "text": "b", "isCorrect": false } ] } ]');
  const r = ingest({ content: example });
  assert.equal(r.errors, 0, JSON.stringify(r.issues.filter((i) => i.severity === 'error')));
});

test('ida e volta: processar o canônico de novo é estável (mesmo conteúdo, sem erros novos)', () => {
  for (const f of ['claude-pt.json', 'mcp-tree.json', 'chat-markdown.md', 'chat-with-json.txt']) {
    const first = ingest({ content: fx(f) });
    const again = ingest({ content: JSON.parse(JSON.stringify(first.bundle)) });
    assert.equal(again.errors, first.errors, `${f}: erros mudaram na segunda passada ${JSON.stringify(again.issues.filter((i) => i.severity === 'error'))}`);
    // compara a forma serializada (é o que vai para o banco) e o hash de cada curso/planeta
    const json = (b: unknown) => JSON.parse(JSON.stringify(b));
    assert.deepEqual(json(again.bundle), json(first.bundle), `${f}: conteúdo mudou na segunda passada`);
    if (first.valid && again.valid) {
      assert.deepEqual(again.valid.planets.flatMap((p) => p.courses.map(courseHash)), first.valid.planets.flatMap((p) => p.courses.map(courseHash)), `${f}: hash de curso mudou`);
      assert.deepEqual(again.valid.planets.map(planetHash), first.valid.planets.map(planetHash), `${f}: hash de planeta mudou`);
    }
  }
});

test('exemplo canônico de referência (examples/exemplo-completo.json) é aceito sem erro', () => {
  const r = ingest({ content: readFileSync(join(__dirname, '..', '..', 'examples', 'exemplo-completo.json'), 'utf8') });
  assert.equal(r.errors, 0, JSON.stringify(r.issues.filter((i) => i.severity === 'error')));
  assert.equal(r.format, 'json');
  assert.deepEqual(codes(r, 'warning'), ['video.url_missing'], 'único aviso esperado: vídeo sem URL fica pendente');
});

test('planejador: curso com progresso ARQUIVADO libera criar a trilha nova; mesma chave de um arquivado é conflito', () => {
  const r = ingest({ content: { planeta: { nome: 'Feedback', categoria: 'trabalho', cursos: [{ titulo: 'Fundamentos do Feedback', aulas: [{ tipo: 'aula', titulo: 'O que é', conteudo: 'Texto da aula.' }] }] } } });
  assert.ok(r.valid);
  const snap = (status: string, code = 'feedback-0', slug = 'feedback-0'): Snapshot => ({
    categories: ['para-o-trabalho'],
    planets: [{ id: 'p', slug: 'feedback', status: 'PUBLISHED', contentHash: null, courses: [{ id: 'c0', code, slug, title: 'Fundamentos do Feedback', contentHash: 'antigo', hasProgress: true, status }] }],
  });
  assert.equal(planImport(r.valid!, snap('PUBLISHED')).planets[0].courses[0].action, 'CONFLICT', 'ativo com progresso: conflito');
  assert.equal(planImport(r.valid!, snap('ARCHIVED')).planets[0].courses[0].action, 'CREATE', 'arquivado: cria o novo');
  const clash = planImport(r.valid!, snap('ARCHIVED', 'feedback.fundamentos-do-feedback')).planets[0].courses[0];
  assert.equal(clash.action, 'CONFLICT');
  assert.match(clash.reason ?? '', /ARQUIVADO/);
});

test('planejador: curso "Em breve" do catálogo com o mesmo nome é preenchido, não duplicado', () => {
  const r = ingest({ content: { planeta: { nome: 'Comunicação', categoria: 'trabalho', cursos: [{ titulo: 'Comunicação Assertiva', aulas: [{ tipo: 'aula', titulo: 'O que é', conteudo: 'Texto da aula.' }] }] } } });
  assert.ok(r.valid, JSON.stringify(r.issues.filter((i) => i.severity === 'error')));
  const plan = planImport(r.valid!, {
    categories: ['para-o-trabalho'],
    planets: [{ id: 'p', slug: 'comunicacao', status: 'PUBLISHED', contentHash: null, courses: [{ id: 'c0', code: 'comunicacao-0', slug: 'comunicacao-0', title: 'Comunicação Assertiva', contentHash: null, hasProgress: false, status: 'COMING_SOON' }] }],
  });
  const row = plan.planets[0].courses[0];
  assert.equal(row.action, 'REPLACE');
  assert.match(row.reason ?? '', /Preenche o curso existente/);
});
