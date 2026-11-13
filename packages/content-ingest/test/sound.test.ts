import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingest, toStorage, type ChoiceQuestion } from '../src';

const bundle = (lessons: unknown[]) => ({
  schemaVersion: 'folks.content/v1',
  planets: [{ key: 'musica-t', slug: 'musica-t', name: 'Música T', category: 'para-a-vida', accessTier: 'FREE', courses: [{
    key: 'musica-t.som', slug: 'som', title: 'Curso de som', hasCertificate: false, units: [{ title: 'Unidade 1', lessons }],
  }] }],
});
const lessonsOf = (r: ReturnType<typeof ingest>) => r.bundle.planets[0].courses[0].units[0].lessons as any[];

test('aula de som: os sons das telas são mantidos na importação', () => {
  const r = ingest({ content: bundle([{ type: 'LESSON', title: 'Aula: grave ou agudo', slides: [{ heading: 'Ouça', text: 'Subiu ou desceu?', audioDemos: [
    { label: 'Subiu', caption: 'Uma nota e depois outra mais aguda', sequence: [['n', 48], ['n', 'G3']] },
    { label: 'Acorde menor', sequence: [['c', 'A2', 'm']] },
    { label: 'Gravação', url: 'https://exemplo.com/voz.mp3' },
  ] }] }]) });
  assert.equal(r.errors, 0, JSON.stringify(r.issues));
  const demos = lessonsOf(r)[0].slides[0].audioDemos;
  assert.equal(demos.length, 3);
  assert.deepEqual(demos[0].sequence, [['n', 48], ['n', 'G3']]);
  assert.equal(demos[2].url, 'https://exemplo.com/voz.mp3');
});

test('som inválido na tela é barrado com mensagem', () => {
  const r = ingest({ content: bundle([{ type: 'LESSON', title: 'Aula ruim', slides: [{ heading: 'x', text: 'y', audioDemos: [{ label: 'Nada' }, { label: 'Nota errada', sequence: [['n', 'H9']] }] }] }]) });
  assert.ok(r.errors > 0);
});

test('questão "ouça e responda" guarda o som em media.audio', () => {
  const r = ingest({ content: bundle([{ type: 'PRACTICE', title: 'Prática de ouvido', questions: [
    { type: 'SINGLE_CHOICE', methodology: 'listen_choose', prompt: 'Esse acorde é maior ou menor?', audio: { kind: 'NOTES', sequence: [['c', 45, 'm']] }, options: [{ text: 'Maior', isCorrect: false }, { text: 'Menor', isCorrect: true }] },
  ] }]) });
  assert.equal(r.errors, 0, JSON.stringify(r.issues));
  const q = lessonsOf(r)[0].questions[0] as ChoiceQuestion;
  const stored = toStorage(q);
  assert.deepEqual((stored.media as any).audio, { kind: 'NOTES', sequence: [['c', 45, 'm']] });
});

test('desafio no microfone (mic_pitch): nota válida passa sem aviso de regra pendente; inválida é erro', () => {
  const ok = ingest({ content: bundle([{ type: 'PRACTICE', title: 'Afinar', questions: [
    { type: 'SIMULATOR', methodology: 'play_or_sing_note', prompt: 'Toque a 5ª corda solta (Lá)', simulator: { id: 'mic_pitch', target: 'A2', instrument: 'violao' } },
  ] }]) });
  assert.equal(ok.errors, 0, JSON.stringify(ok.issues));
  assert.ok(!ok.issues.some((i) => i.code === 'simulator.rule_pending'));
  const bad = ingest({ content: bundle([{ type: 'PRACTICE', title: 'Afinar', questions: [
    { type: 'SIMULATOR', prompt: 'Toque algo', simulator: { id: 'mic_pitch' } },
  ] }]) });
  assert.ok(bad.issues.some((i) => i.code === 'simulator.mic_pitch_target'));
});

test('prática gerada com som e microfone usa geradores conhecidos', () => {
  const r = ingest({ content: bundle([{ type: 'GENERATED_PRACTICE', title: 'Treino de ouvido', generators: ['pitch_tone', 'sing', 'tune'], questionCount: 6 }]) });
  assert.equal(r.errors, 0, JSON.stringify(r.issues));
  assert.ok(!r.issues.some((i) => /generator/.test(i.code)), JSON.stringify(r.issues));
});
