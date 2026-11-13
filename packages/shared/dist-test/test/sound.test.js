"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const src_1 = require("../src");
/** Gerador previsível para os testes */
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
(0, node_test_1.test)('nomes de nota viram MIDI e voltam', () => {
    strict_1.default.equal((0, src_1.noteToMidi)('E2'), 40);
    strict_1.default.equal((0, src_1.noteToMidi)('A4'), 69);
    strict_1.default.equal((0, src_1.noteToMidi)('C#4'), 61);
    strict_1.default.equal((0, src_1.noteToMidi)('Bb3'), 58);
    strict_1.default.ok(Number.isNaN((0, src_1.noteToMidi)('H2')));
    strict_1.default.equal((0, src_1.midiToName)(40), 'E2');
});
(0, node_test_1.test)('sequência válida e inválida', () => {
    strict_1.default.ok((0, src_1.isValidSequence)([['n', 48], ['c', 'A2', 'm'], ['p', 48, [0, 4, 5, 3]], ['t', 'A4', 1], ['r', 0.5]]));
    strict_1.default.ok(!(0, src_1.isValidSequence)([['x', 48]]), 'evento desconhecido');
    strict_1.default.ok(!(0, src_1.isValidSequence)([['p', 48, [9]]]), 'grau fora de 0..6');
    strict_1.default.ok(!(0, src_1.isValidSequence)([]), 'vazia');
    strict_1.default.ok((0, src_1.sequenceDurationMs)([['n', 48], ['n', 55]]) >= 1500);
});
(0, node_test_1.test)('sintetiza e gera um WAV válido', () => {
    const pcm = (0, src_1.renderSequence)([['n', 48], ['c', 45, 'm']], 22050);
    strict_1.default.ok(pcm.length > 22050, 'mais de 1 s de som');
    strict_1.default.ok(pcm.every((v) => v >= -1 && v <= 1), 'sem estourar');
    const wav = (0, src_1.encodeWav)(pcm, 22050);
    strict_1.default.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
    strict_1.default.equal(String.fromCharCode(...wav.slice(8, 12)), 'WAVE');
    strict_1.default.equal(wav.length, 44 + pcm.length * 2);
});
(0, node_test_1.test)('detecta a nota de um tom puro com precisão de poucos cents', () => {
    for (const m of [45, 57, 60, 69, 76]) {
        const r = (0, src_1.detectPitch)((0, src_1.sineWave)(m, 0.1, 48000), 48000);
        strict_1.default.ok(r, `detectou ${m}`);
        strict_1.default.ok(Math.abs((0, src_1.centsFrom)(m, r.midi)) < 10, `${(0, src_1.midiToName)(m)}: ${(0, src_1.centsFrom)(m, r.midi).toFixed(1)} cents`);
    }
});
(0, node_test_1.test)('detecta a corda solta do violão sintetizada (som real de corda, não senoide)', () => {
    for (const s of src_1.GUITAR_STRINGS) {
        const pcm = (0, src_1.renderSequence)([['n', s.midi]], 44100);
        const frame = pcm.slice(Math.floor(0.2 * 44100), Math.floor(0.2 * 44100) + 4096);
        const r = (0, src_1.detectPitch)(frame, 44100);
        strict_1.default.ok(r, `detectou ${s.name}`);
        strict_1.default.ok(Math.abs((0, src_1.centsFrom)(s.midi, r.midi)) < 25, `${s.name}: ${(0, src_1.centsFrom)(s.midi, r.midi).toFixed(1)} cents`);
    }
});
(0, node_test_1.test)('silêncio não vira nota', () => {
    strict_1.default.equal((0, src_1.detectPitch)(new Float32Array(4096), 48000), null);
});
(0, node_test_1.test)('canto: qualquer oitava vale; violão: oitava exata', () => {
    strict_1.default.ok(Math.abs((0, src_1.centsFrom)(60, 72, 'pitchClass')) < 1, 'Dó4 cantado como Dó5');
    strict_1.default.equal((0, src_1.centsFrom)(60, 72, 'note'), 1200);
    strict_1.default.equal((0, src_1.tuningHint)(-80).dir, -1);
    strict_1.default.equal((0, src_1.tuningHint)(10).label, 'Afinado!');
});
(0, node_test_1.test)('geradores de ouvido: sempre uma resposta certa e som válido', () => {
    const r = seeded(7);
    const kinds = ['pitch', 'pitch_tone', 'pitch2', 'qual', 'qual2', 'deg', 'deg2', 'prog', 'prog2', 'mix', 'rev2', 'rev3', 'rev4'];
    strict_1.default.ok((0, src_1.canGenerate)(kinds));
    strict_1.default.ok(!(0, src_1.canGenerate)(['t1']), 'tabuada ainda não é gerada por este módulo');
    for (const k of kinds) {
        for (const q of (0, src_1.generateRound)([k], 12, r)) {
            strict_1.default.equal(q.type, 'choice');
            if (q.type !== 'choice')
                continue;
            strict_1.default.equal(q.options.filter((o) => o.correct).length, 1, `${k}: uma certa`);
            strict_1.default.ok((0, src_1.isValidSequence)(q.sound), `${k}: som válido`);
            strict_1.default.ok(q.explanation.length > 10);
        }
    }
});
(0, node_test_1.test)('geradores de microfone: afinação do violão e canto', () => {
    const r = seeded(3);
    for (const q of (0, src_1.generateRound)(['tune', 'sing', 'sing_steps'], 20, r)) {
        strict_1.default.equal(q.type, 'mic');
        if (q.type !== 'mic')
            continue;
        strict_1.default.ok(q.mic.targets.length >= 1);
        strict_1.default.equal(q.mic.mode, q.mic.instrument === 'voz' ? 'pitchClass' : 'note');
        strict_1.default.ok((0, src_1.isValidSequence)(q.mic.reference));
    }
});
(0, node_test_1.test)('desafio de microfone de uma questão do banco (SIMULATOR mic_pitch)', () => {
    const m = (0, src_1.micChallengeOf)({ id: 'mic_pitch', targets: ['E2', 'A2'], instrument: 'violao' });
    strict_1.default.deepEqual(m?.targets, [40, 45]);
    strict_1.default.equal(m?.mode, 'note');
    strict_1.default.equal((0, src_1.micChallengeOf)({ id: 'mic_pitch', target: 'C4', instrument: 'voz' })?.mode, 'pitchClass');
    strict_1.default.equal((0, src_1.micChallengeOf)({ id: 'outro' }), null);
    strict_1.default.equal((0, src_1.micChallengeOf)({ id: 'mic_pitch', target: 'zz' }), null);
});
(0, node_test_1.test)('soundOf lê os formatos de som do conteúdo', () => {
    strict_1.default.equal((0, src_1.soundOf)({ label: 'Subiu', sequence: [['n', 48], ['n', 55]] })?.kind, 'NOTES');
    strict_1.default.equal((0, src_1.soundOf)({ kind: 'URL', url: 'https://exemplo.com/a.mp3' })?.kind, 'URL');
    strict_1.default.equal((0, src_1.soundOf)({ kind: 'TTS', lang: 'en-US', text: 'hello' })?.kind, 'TTS');
    strict_1.default.equal((0, src_1.soundOf)({ url: 'javascript:alert(1)' }), null, 'só http(s)');
});
