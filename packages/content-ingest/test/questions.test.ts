import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest, gradeQuestion, publicQuestion, toStorage, type Question, type StoredQuestion } from '../src';

const fx = (f: string) => readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', f), 'utf8');

/** simula o que o banco devolve: toStorage + ids */
const stored = (q: Question, id = 'q1'): StoredQuestion => {
  const st = toStorage(q);
  return { id, type: st.type, prompt: st.prompt, explanation: st.explanation, points: 1, methodology: st.methodology, timeLimitMs: st.timeLimitMs, data: st.data, media: st.media, options: st.options.map((o, i) => ({ id: `o${i}`, ...o })) };
};
const base = { prompt: 'Pergunta de teste?' };

test('formato estendido do cliente: todos os tipos, widgets, confere rapidinho e geradores são aceitos', () => {
  const r = ingest({ content: fx('cliente-v1-estendido.json') });
  assert.equal(r.errors, 0, JSON.stringify(r.issues.filter((i) => i.severity === 'error')));
  const p = r.valid!.planets[0];
  assert.equal(p.accessTier, 'FREE', 'FREEMIUM vira planeta no plano grátis');
  const c = p.courses[0];
  assert.equal(c.meta, '4 unidades · simuladores · do zero', 'summary vira a linha curta do card');
  assert.equal(c.badge?.name, 'Dono do Próprio Dinheiro', 'badge.title vira name');
  assert.deepEqual(c.units.map((u) => u.accessTier), ['FREE', 'FREE', 'PREMIUM'], 'isFree decide a unidade');
  assert.match(c.units[0].color ?? '', /^#[0-9a-f]{6}$/i);
  const aula = c.units[0].lessons[0];
  assert.equal(aula.type, 'LESSON');
  if (aula.type === 'LESSON') {
    assert.deepEqual(new Set(aula.slides.map((s) => s.widget?.type).filter(Boolean)), new Set(['SIM', 'SORTG', 'EXPLORE', 'MODES', 'PRON', 'PHRASE', 'STEPS', 'FLIP', 'REFLECT', 'CHAT']));
    assert.ok(aula.slides.every((s) => s.textParts?.length), 'texto em partes preservado');
    const semPergunta = aula.slides.at(-1)!.check!;
    assert.equal(semPergunta.type, 'MATCH_PAIRS');
    assert.equal(semPergunta.prompt, 'Ligue os pares.', 'confere rapidinho sem pergunta ganha enunciado padrão');
  }
  const pr = c.units[1].lessons[0];
  assert.equal(pr.type, 'PRACTICE');
  if (pr.type === 'PRACTICE') {
    assert.equal(pr.questionsPerRound, 4);
    assert.deepEqual(new Set(pr.questions.map((q) => q.type)), new Set(['SINGLE_CHOICE', 'TRUE_FALSE', 'NUMBER', 'ORDER', 'BUILD_SENTENCE', 'MATCH_PAIRS', 'CLASSIFY', 'SIMULATOR']));
    assert.ok(pr.questions.some((q) => q.audio?.kind === 'TTS'), 'áudio preservado');
    assert.ok(pr.questions.some((q) => q.visual && q.visualAfterAnswer), 'imagens preservadas');
    assert.ok(pr.questions.every((q) => q.methodology && q.timeLimitMs), 'metodologia e tempo preservados');
    assert.ok(pr.generators?.every((g) => g.methodology && g.data), 'geradores com dados preservados');
  }
  assert.deepEqual(r.stats.questionTypes.SIMULATOR, 1);
  assert.ok(r.issues.some((i) => i.code === 'simulator.rule_pending'), 'simulador avisa que a regra roda no app');
});

test('reprocessar o formato estendido é estável (mesmo hash)', () => {
  const a = ingest({ content: fx('cliente-v1-estendido.json') });
  const b = ingest({ content: JSON.parse(JSON.stringify(a.valid)) });
  assert.equal(b.errors, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(b.valid)), JSON.parse(JSON.stringify(a.valid)));
});

test('validação por tipo: ordem com peças diferentes, frase com palavra fora das peças, grupo inexistente', () => {
  const bundle = (qs: unknown[]) => ({ schemaVersion: 'folks.content/v1', planets: [{ key: 'teste', slug: 'teste', name: 'Teste', category: 'para-a-vida', accessTier: 'FREE', courses: [{ key: 'teste.c', slug: 'c', title: 'Curso', hasCertificate: false, units: [{ title: 'Unidade', lessons: [{ type: 'PRACTICE', title: 'Prática', questions: qs }] }] }] }] });
  const codes = (qs: unknown[]) => ingest({ content: bundle(qs) }).issues.filter((i) => i.severity === 'error').map((i) => i.code);
  assert.ok(codes([{ ...base, type: 'ORDER', pieces: ['a', 'b'], answer: ['a', 'c'] }]).includes('question.order_mismatch'));
  assert.ok(codes([{ ...base, type: 'BUILD_SENTENCE', pieces: ['I', 'am'], answer: ['I', 'is'] }]).includes('question.sentence_piece'));
  assert.ok(codes([{ ...base, type: 'CLASSIFY', groups: ['A', 'B'], items: [{ text: 'x', group: 0 }, { text: 'y', group: 5 }] }]).includes('question.classify_group'));
  assert.ok(codes([{ ...base, type: 'NUMBER' }]).includes('question.number_answer'));
  assert.deepEqual(codes([{ ...base, type: 'NUMBER', answer: '1.900' }]), [], 'número no formato brasileiro é aceito');
});

test('visão do aluno nunca leva a resposta', () => {
  const qs: Question[] = [
    { ...base, type: 'SINGLE_CHOICE', options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false, feedback: 'não' }] },
    { ...base, type: 'NUMBER', answer: 1900 },
    { ...base, type: 'ORDER', pieces: ['1', '2', '3'], answer: ['1', '2', '3'] },
    { ...base, type: 'MATCH_PAIRS', pairs: [{ left: 'I', right: 'eu' }, { left: 'we', right: 'nós' }] },
    { ...base, type: 'CLASSIFY', groups: ['Fixo', 'Variável'], items: [{ text: 'Aluguel', group: 0, feedback: 'fixo' }, { text: 'Cinema', group: 1 }] },
    { ...base, type: 'BUILD_SENTENCE', pieces: ['She', 'is', 'are'], answer: ['She', 'is'], speakAfterAnswer: { lang: 'en-US', text: 'She is' } },
  ];
  for (const q of qs) {
    const pub = JSON.stringify(publicQuestion(stored(q)));
    for (const leak of ['isCorrect', '"answer"', '"group"', '"feedback"', 'speakAfterAnswer', '"pairs"']) assert.ok(!pub.includes(leak), `${q.type} vazou ${leak}: ${pub}`);
  }
  const order = publicQuestion(stored(qs[2]), { rnd: () => 0.99 }) as { pieces: string[] };
  assert.notDeepEqual(order.pieces, ['1', '2', '3'], 'peças de ordenar nunca chegam na ordem certa');
});

test('correção por tipo', () => {
  const g = (q: Question, a: object) => gradeQuestion(stored(q), { questionId: 'q1', ...a });
  const choice: Question = { ...base, type: 'SINGLE_CHOICE', options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }] };
  assert.equal(g(choice, { optionIds: ['o0'] }).correct, true);
  assert.equal(g(choice, { optionIds: ['o1'] }).correct, false);
  assert.equal(g(choice, {}).correct, false, 'sem resposta é erro');

  const num: Question = { ...base, type: 'NUMBER', answer: 1900 };
  assert.equal(g(num, { value: 1900 }).correct, true);
  assert.equal(g(num, { value: 1901 }).correct, false);
  assert.equal(g(num, {}).correct, false, 'NUMBER sem resposta não pode passar');

  const ord: Question = { ...base, type: 'ORDER', pieces: ['a', 'b', 'c'], answer: ['a', 'b', 'c'] };
  assert.equal(g(ord, { sequence: ['a', 'b', 'c'] }).correct, true);
  const wrong = g(ord, { sequence: ['a', 'c', 'b'] });
  assert.equal(wrong.correct, false);
  assert.equal(wrong.feedback.firstWrongIndex, 1, 'aponta o primeiro passo fora de ordem');

  const mp: Question = { ...base, type: 'MATCH_PAIRS', pairs: [{ left: 'he', right: 'ele' }, { left: 'it', right: 'ele / ela' }, { left: 'they', right: 'eles' }] };
  assert.equal(g(mp, { pairs: [{ left: 'he', right: 'ele' }, { left: 'it', right: 'ele / ela' }, { left: 'they', right: 'eles' }] }).correct, true);
  assert.equal(g(mp, { pairs: [{ left: 'he', right: 'ele / ela' }, { left: 'it', right: 'ele' }, { left: 'they', right: 'eles' }] }).correct, false);

  const cl: Question = { ...base, type: 'CLASSIFY', groups: ['Fixo', 'Variável'], items: [{ text: 'Aluguel', group: 0 }, { text: 'Cinema', group: 1, feedback: 'Lazer varia' }] };
  assert.equal(g(cl, { assignments: [{ item: 'Aluguel', group: 0 }, { item: 'Cinema', group: 1 }] }).correct, true);
  const clw = g(cl, { assignments: [{ item: 'Aluguel', group: 0 }, { item: 'Cinema', group: 0 }] });
  assert.equal(clw.correct, false);
  assert.deepEqual(clw.feedback.wrong, [{ text: 'Cinema', group: 1, feedback: 'Lazer varia' }]);

  const bs: Question = { ...base, type: 'BUILD_SENTENCE', pieces: ['She', 'is', 'hungry', 'are'], answer: ['She', 'is', 'hungry'] };
  assert.equal(g(bs, { sequence: ['She', 'is', 'hungry'] }).correct, true);
  assert.equal(g(bs, { sequence: ['She', 'are', 'hungry'] }).correct, false);

  const sim: Question = { ...base, type: 'SIMULATOR', simulator: { id: 'saldo' } };
  const s = g(sim, { simulator: { correct: true } });
  assert.equal(s.correct, true);
  assert.equal(s.selfReported, true, 'simulador marcado como informado pelo app');
});
