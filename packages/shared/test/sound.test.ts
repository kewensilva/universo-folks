import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canGenerate, centsFrom, detectPitch, encodeWav, generateRound, micChallengeOf, midiToName, noteToMidi, renderSequence,
  sequenceDurationMs, sineWave, soundOf, isValidSequence, tuningHint, GUITAR_STRINGS,
} from '../src';

/** Gerador previsível para os testes */
const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('nomes de nota viram MIDI e voltam', () => {
  assert.equal(noteToMidi('E2'), 40);
  assert.equal(noteToMidi('A4'), 69);
  assert.equal(noteToMidi('C#4'), 61);
  assert.equal(noteToMidi('Bb3'), 58);
  assert.ok(Number.isNaN(noteToMidi('H2')));
  assert.equal(midiToName(40), 'E2');
});

test('sequência válida e inválida', () => {
  assert.ok(isValidSequence([['n', 48], ['c', 'A2', 'm'], ['p', 48, [0, 4, 5, 3]], ['t', 'A4', 1], ['r', 0.5]]));
  assert.ok(!isValidSequence([['x', 48]]), 'evento desconhecido');
  assert.ok(!isValidSequence([['p', 48, [9]]]), 'grau fora de 0..6');
  assert.ok(!isValidSequence([]), 'vazia');
  assert.ok(sequenceDurationMs([['n', 48], ['n', 55]]) >= 1500);
});

test('sintetiza e gera um WAV válido', () => {
  const pcm = renderSequence([['n', 48], ['c', 45, 'm']], 22050);
  assert.ok(pcm.length > 22050, 'mais de 1 s de som');
  assert.ok(pcm.every((v) => v >= -1 && v <= 1), 'sem estourar');
  const wav = encodeWav(pcm, 22050);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
  assert.equal(wav.length, 44 + pcm.length * 2);
});

test('detecta a nota de um tom puro com precisão de poucos cents', () => {
  for (const m of [45, 57, 60, 69, 76]) {
    const r = detectPitch(sineWave(m, 0.1, 48000), 48000);
    assert.ok(r, `detectou ${m}`);
    assert.ok(Math.abs(centsFrom(m, r!.midi)) < 10, `${midiToName(m)}: ${centsFrom(m, r!.midi).toFixed(1)} cents`);
  }
});

test('detecta a corda solta do violão sintetizada (som real de corda, não senoide)', () => {
  for (const s of GUITAR_STRINGS) {
    const pcm = renderSequence([['n', s.midi]], 44100);
    const frame = pcm.slice(Math.floor(0.2 * 44100), Math.floor(0.2 * 44100) + 4096);
    const r = detectPitch(frame, 44100);
    assert.ok(r, `detectou ${s.name}`);
    assert.ok(Math.abs(centsFrom(s.midi, r!.midi)) < 25, `${s.name}: ${centsFrom(s.midi, r!.midi).toFixed(1)} cents`);
  }
});

test('silêncio não vira nota', () => {
  assert.equal(detectPitch(new Float32Array(4096), 48000), null);
});

test('canto: qualquer oitava vale; violão: oitava exata', () => {
  assert.ok(Math.abs(centsFrom(60, 72, 'pitchClass')) < 1, 'Dó4 cantado como Dó5');
  assert.equal(centsFrom(60, 72, 'note'), 1200);
  assert.equal(tuningHint(-80).dir, -1);
  assert.equal(tuningHint(10).label, 'Afinado!');
});

test('geradores de ouvido: sempre uma resposta certa e som válido', () => {
  const r = seeded(7);
  const kinds = ['pitch', 'pitch_tone', 'pitch2', 'qual', 'qual2', 'deg', 'deg2', 'prog', 'prog2', 'mix', 'rev2', 'rev3', 'rev4'];
  assert.ok(canGenerate(kinds));
  assert.ok(!canGenerate(['t1']), 'tabuada ainda não é gerada por este módulo');
  for (const k of kinds) {
    for (const q of generateRound([k], 12, r)) {
      assert.equal(q.type, 'choice');
      if (q.type !== 'choice') continue;
      assert.equal(q.options.filter((o) => o.correct).length, 1, `${k}: uma certa`);
      assert.ok(isValidSequence(q.sound), `${k}: som válido`);
      assert.ok(q.explanation.length > 10);
    }
  }
});

test('geradores de microfone: afinação do violão e canto', () => {
  const r = seeded(3);
  for (const q of generateRound(['tune', 'sing', 'sing_steps'], 20, r)) {
    assert.equal(q.type, 'mic');
    if (q.type !== 'mic') continue;
    assert.ok(q.mic.targets.length >= 1);
    assert.equal(q.mic.mode, q.mic.instrument === 'voz' ? 'pitchClass' : 'note');
    assert.ok(isValidSequence(q.mic.reference));
  }
});

test('desafio de microfone de uma questão do banco (SIMULATOR mic_pitch)', () => {
  const m = micChallengeOf({ id: 'mic_pitch', targets: ['E2', 'A2'], instrument: 'violao' });
  assert.deepEqual(m?.targets, [40, 45]);
  assert.equal(m?.mode, 'note');
  assert.equal(micChallengeOf({ id: 'mic_pitch', target: 'C4', instrument: 'voz' })?.mode, 'pitchClass');
  assert.equal(micChallengeOf({ id: 'outro' }), null);
  assert.equal(micChallengeOf({ id: 'mic_pitch', target: 'zz' }), null);
});

test('soundOf lê os formatos de som do conteúdo', () => {
  assert.equal(soundOf({ label: 'Subiu', sequence: [['n', 48], ['n', 55]] })?.kind, 'NOTES');
  assert.equal(soundOf({ kind: 'URL', url: 'https://exemplo.com/a.mp3' })?.kind, 'URL');
  assert.equal(soundOf({ kind: 'TTS', lang: 'en-US', text: 'hello' })?.kind, 'TTS');
  assert.equal(soundOf({ url: 'javascript:alert(1)' }), null, 'só http(s)');
});
