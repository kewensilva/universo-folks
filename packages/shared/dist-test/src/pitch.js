"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUITAR_STRINGS = void 0;
exports.detectPitch = detectPitch;
exports.centsFrom = centsFrom;
exports.tuningHint = tuningHint;
exports.pcmToMono = pcmToMono;
exports.sineWave = sineWave;
// Afinação pelo microfone: descobre a nota tocada ou cantada (algoritmo YIN) e quanto ela está
// acima ou abaixo da nota pedida. Roda em JS puro, igual no app e na web.
const sound_1 = require("./sound");
/**
 * Detecta a frequência fundamental de um trecho de áudio mono.
 * Devolve null quando é silêncio ou ruído sem nota definida.
 */
function detectPitch(input, sampleRate, opts = {}) {
    const minHz = opts.minHz ?? 60, maxHz = opts.maxHz ?? 1100, threshold = opts.threshold ?? 0.15, minRms = opts.minRms ?? 0.01;
    // reduz a taxa para ficar leve no celular (o violão e a voz cabem abaixo de 11 kHz)
    let buf = input, sr = sampleRate;
    while (sr > 24000) {
        const half = new Float32Array(buf.length >> 1);
        for (let i = 0; i < half.length; i++)
            half[i] = (buf[2 * i] + buf[2 * i + 1]) * 0.5;
        buf = half;
        sr /= 2;
    }
    let rms = 0;
    for (let i = 0; i < buf.length; i++)
        rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < minRms)
        return null;
    const tauMin = Math.max(2, Math.floor(sr / maxHz));
    const tauMax = Math.min(Math.floor(sr / minHz), Math.floor(buf.length / 2));
    if (tauMax <= tauMin + 2)
        return null;
    const W = buf.length - tauMax;
    const d = new Float32Array(tauMax + 1);
    for (let tau = 1; tau <= tauMax; tau++) {
        let s = 0;
        for (let i = 0; i < W; i++) {
            const x = buf[i] - buf[i + tau];
            s += x * x;
        }
        d[tau] = s;
    }
    // diferença normalizada acumulada
    let run = 0;
    d[0] = 1;
    for (let tau = 1; tau <= tauMax; tau++) {
        run += d[tau];
        d[tau] = run ? (d[tau] * tau) / run : 1;
    }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
        if (d[t] < threshold) {
            while (t + 1 <= tauMax && d[t + 1] < d[t])
                t++;
            tau = t;
            break;
        }
    }
    if (tau < 0)
        return null;
    // interpolação parabólica para precisão abaixo de 1 amostra
    const a = d[tau - 1] ?? d[tau], b = d[tau], c = d[tau + 1] ?? d[tau];
    const den = a + c - 2 * b;
    const better = den ? tau + (a - c) / (2 * den) : tau;
    const hz = sr / better;
    if (hz < minHz || hz > maxHz)
        return null;
    return { hz, midi: (0, sound_1.hzToMidi)(hz), clarity: Math.max(0, Math.min(1, 1 - b)), rms };
}
/**
 * Distância em cents (100 = um semitom) da leitura até a nota pedida.
 * 'pitchClass' aceita qualquer oitava (canto: homem e mulher cantam a "mesma" nota em alturas diferentes).
 */
function centsFrom(target, readingMidi, mode = 'note') {
    let diff = (readingMidi - target) * 100;
    if (mode === 'pitchClass')
        diff = ((((diff + 600) % 1200) + 1200) % 1200) - 600;
    return diff;
}
/** Texto para o aluno: "afinado", "um pouco grave", "mais agudo"... */
function tuningHint(cents, tolerance = 50) {
    if (Math.abs(cents) <= tolerance)
        return { label: 'Afinado!', dir: 0 };
    if (cents < 0)
        return { label: cents < -150 ? 'Muito grave: suba' : 'Um pouco grave: suba', dir: -1 };
    return { label: cents > 150 ? 'Muito agudo: desça' : 'Um pouco agudo: desça', dir: 1 };
}
/** Converte o buffer do microfone (float32 ou int16, intercalado) em mono float. */
function pcmToMono(data, encoding, channels = 1) {
    const src = encoding === 'float32' ? new Float32Array(data) : new Int16Array(data);
    const scale = encoding === 'float32' ? 1 : 1 / 32768;
    const n = Math.floor(src.length / channels);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++)
            s += src[i * channels + c];
        out[i] = (s / channels) * scale;
    }
    return out;
}
/** Senoide de teste (usada nos testes e na demonstração sem microfone). */
function sineWave(midi, seconds, sampleRate) {
    const n = Math.floor(seconds * sampleRate), w = (2 * Math.PI * (0, sound_1.midiToHz)(midi)) / sampleRate;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++)
        out[i] = 0.5 * Math.sin(w * i) + 0.15 * Math.sin(2 * w * i);
    return out;
}
/** Cordas soltas do violão (afinação padrão), da 6ª (mais grave) para a 1ª. */
exports.GUITAR_STRINGS = [
    { string: 6, midi: 40, name: 'Mi (E2)' },
    { string: 5, midi: 45, name: 'Lá (A2)' },
    { string: 4, midi: 50, name: 'Ré (D3)' },
    { string: 3, midi: 55, name: 'Sol (G3)' },
    { string: 2, midi: 59, name: 'Si (B3)' },
    { string: 1, midi: 64, name: 'Mi (E4)' },
];
