"use strict";
// Som sintetizado (sem arquivo): notas e acordes de violão, tons puros e pausas.
// É o mesmo motor do protótipo (corda dedilhada por Karplus-Strong), mas gera PCM em memória e
// um WAV, para tocar igual no app (iOS/Android) e na web, sem internet.
Object.defineProperty(exports, "__esModule", { value: true });
exports.degreeQuality = exports.midiToSolfege = exports.hzToMidi = exports.midiToHz = void 0;
exports.noteToMidi = noteToMidi;
exports.midiToName = midiToName;
exports.chordName = chordName;
exports.degreeRoot = degreeRoot;
exports.isValidSequence = isValidSequence;
exports.sequenceDurationMs = sequenceDurationMs;
exports.renderSequence = renderSequence;
exports.encodeWav = encodeWav;
exports.sequenceKey = sequenceKey;
exports.soundOf = soundOf;
const PC_SHARP = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const SOLFEGE = ['Dó', 'Dó♯', 'Ré', 'Mi♭', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Lá♭', 'Lá', 'Si♭', 'Si'];
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJ = [0, 2, 4, 5, 7, 9, 11];
const QL = ['', 'm', 'm', '', '', 'm', 'dim'];
/** "E2" → 40, "C#4" → 61, "Bb3" → 58; número passa direto. NaN se não entender. */
function noteToMidi(n) {
    if (typeof n === 'number')
        return n;
    const m = n.trim().replace('♯', '#').replace('♭', 'b').match(/^([A-Ga-g])([#b]?)(-?\d)$/);
    if (!m)
        return NaN;
    const pc = LETTER[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return (Number(m[3]) + 1) * 12 + pc;
}
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
exports.midiToHz = midiToHz;
const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);
exports.hzToMidi = hzToMidi;
const pcOf = (m) => ((Math.round(m) % 12) + 12) % 12;
/** 40 → "E2" */
function midiToName(m) {
    const r = Math.round(m);
    return `${PC_SHARP[pcOf(r)]}${Math.floor(r / 12) - 1}`;
}
/** 40 → "Mi" (nome em português, sem oitava) */
const midiToSolfege = (m) => SOLFEGE[pcOf(m)];
exports.midiToSolfege = midiToSolfege;
/** Nome de acorde como no protótipo: 40,'m' → "Em" */
function chordName(root, q = '') {
    const pc = pcOf(root);
    return (q === 'm' && pc === 8 ? 'G♯' : PC_SHARP[pc]) + (q === 'm' ? 'm' : q === 'dim' ? 'dim' : '');
}
/** Raiz do grau no campo maior (fica na região grave do violão). */
function degreeRoot(tonic, degree) {
    let r = tonic + MAJ[degree];
    while (r > 52)
        r -= 12;
    return r;
}
const degreeQuality = (degree) => QL[degree] ?? '';
exports.degreeQuality = degreeQuality;
function voicing(r, q) {
    const th = q === '' ? 4 : 3;
    const fi = q === 'dim' ? 6 : 7;
    return [r, r + fi, r + 12, r + 12 + th, r + 12 + fi];
}
/** Sequência é válida? (notas reconhecidas, graus 0..6, tempos razoáveis) */
function isValidSequence(seq) {
    if (!Array.isArray(seq) || !seq.length || seq.length > 64)
        return false;
    return seq.every((ev) => {
        if (!Array.isArray(ev))
            return false;
        const [k, a, b] = ev;
        if (k === 'r')
            return typeof a === 'number' && a >= 0 && a <= 10;
        if (!Number.isFinite(noteToMidi(a)))
            return false;
        const m = noteToMidi(a);
        if (m < 24 || m > 96)
            return false;
        if (k === 'n')
            return true;
        if (k === 'c')
            return b === undefined || b === '' || b === 'm' || b === 'dim';
        if (k === 'p')
            return Array.isArray(b) && b.length > 0 && b.length <= 8 && b.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
        if (k === 't')
            return b === undefined || (typeof b === 'number' && b > 0 && b <= 10);
        return false;
    });
}
/** Duração aproximada da sequência em milissegundos (para a barra de tempo começar depois do som). */
function sequenceDurationMs(seq) {
    let t = 0;
    for (const ev of seq)
        t += step(ev);
    return Math.round(t * 1000) + 300;
}
function step(ev) {
    switch (ev[0]) {
        case 'n': return 0.75;
        case 'c': return 1.15;
        case 'p': return 1.05 * ev[2].length;
        case 't': return (ev[2] ?? 1) + 0.12;
        case 'r': return ev[1];
    }
}
/** Gerador pseudoaleatório previsível (o ruído da corda fica igual a cada vez). */
function lcg(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}
const pluckCache = new Map();
function pluckBuffer(m, sr) {
    const key = `${m}:${sr}`;
    const hit = pluckCache.get(key);
    if (hit)
        return hit;
    const f = (0, exports.midiToHz)(m);
    const N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * 2.2);
    const d = new Float32Array(len);
    const ring = new Float32Array(N);
    const rnd = lcg(m * 7919);
    for (let i = 0; i < N; i++)
        ring[i] = rnd();
    let p = 0, prev = 0;
    const decay = 0.9965 - Math.max(0, m - 50) * 0.0002;
    for (let i = 0; i < len; i++) {
        const v = ring[p], n = ring[(p + 1) % N];
        ring[p] = decay * 0.5 * (v + n);
        d[i] = v * 0.9 + prev * 0.1;
        prev = v;
        p = (p + 1) % N;
    }
    // passa-baixa simples (~3,2 kHz) e fim suave
    const a = Math.exp((-2 * Math.PI * 3200) / sr);
    let y = 0;
    for (let i = 0; i < len; i++) {
        y = (1 - a) * d[i] + a * y;
        d[i] = y;
    }
    const fo = Math.floor(sr * 0.08);
    for (let i = 0; i < fo; i++)
        d[len - 1 - i] *= i / fo;
    pluckCache.set(key, d);
    return d;
}
function addInto(out, src, at, vol) {
    const n = Math.min(src.length, out.length - at);
    for (let i = 0; i < n; i++)
        out[at + i] += src[i] * vol;
}
function toneBuffer(m, seconds, sr) {
    const len = Math.floor(sr * seconds);
    const d = new Float32Array(len);
    const w = (2 * Math.PI * (0, exports.midiToHz)(m)) / sr;
    const att = Math.floor(sr * 0.02), rel = Math.floor(sr * 0.12);
    for (let i = 0; i < len; i++) {
        const env = Math.min(1, i / att, (len - i) / rel);
        d[i] = (Math.sin(w * i) + 0.18 * Math.sin(2 * w * i)) * env;
    }
    return d;
}
/** Sintetiza a sequência em PCM mono (-1..1). */
function renderSequence(seq, sampleRate = 22050) {
    let t = 0.05;
    const marks = [];
    for (const ev of seq) {
        if (ev[0] === 'n') {
            marks.push({ at: t, buf: pluckBuffer(noteToMidi(ev[1]), sampleRate), vol: 0.42 });
            t += 0.75;
        }
        else if (ev[0] === 'c') {
            voicing(noteToMidi(ev[1]), ev[2] ?? '').forEach((m, i) => marks.push({ at: t + i * 0.028, buf: pluckBuffer(m, sampleRate), vol: 0.22 }));
            t += 1.15;
        }
        else if (ev[0] === 'p') {
            const tonic = noteToMidi(ev[1]);
            for (const deg of ev[2]) {
                voicing(degreeRoot(tonic, deg), (0, exports.degreeQuality)(deg)).forEach((m, i) => marks.push({ at: t + i * 0.028, buf: pluckBuffer(m, sampleRate), vol: 0.22 }));
                t += 1.05;
            }
        }
        else if (ev[0] === 't') {
            const s = ev[2] ?? 1;
            marks.push({ at: t, buf: toneBuffer(noteToMidi(ev[1]), s, sampleRate), vol: 0.32 });
            t += s + 0.12;
        }
        else
            t += ev[1];
    }
    const end = marks.reduce((mx, k) => Math.max(mx, k.at + k.buf.length / sampleRate), t);
    const out = new Float32Array(Math.ceil(Math.min(end, t + 1.6) * sampleRate));
    for (const k of marks)
        addInto(out, k.buf, Math.floor(k.at * sampleRate), k.vol);
    let peak = 0;
    for (let i = 0; i < out.length; i++)
        peak = Math.max(peak, Math.abs(out[i]));
    if (peak > 0.95)
        for (let i = 0; i < out.length; i++)
            out[i] *= 0.95 / peak;
    // fim suave
    const fo = Math.min(out.length, Math.floor(sampleRate * 0.15));
    for (let i = 0; i < fo; i++)
        out[out.length - 1 - i] *= i / fo;
    return out;
}
/** PCM mono → arquivo WAV 16 bits. */
function encodeWav(pcm, sampleRate = 22050) {
    const bytes = new Uint8Array(44 + pcm.length * 2);
    const v = new DataView(bytes.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++)
        v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    v.setUint32(4, 36 + pcm.length * 2, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++)
        v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    return bytes;
}
/** Chave estável da sequência (cache do arquivo gerado). */
function sequenceKey(seq) {
    const s = JSON.stringify(seq);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}
/** Lê o som que vier no conteúdo (questão, demo de aula), aceitando o formato antigo do protótipo. */
function soundOf(x) {
    if (!x || typeof x !== 'object')
        return null;
    const o = x;
    if (o.kind === 'TTS' && typeof o.text === 'string')
        return { kind: 'TTS', lang: typeof o.lang === 'string' ? o.lang : 'pt-BR', text: o.text };
    if ((o.kind === 'URL' || (!o.kind && typeof o.url === 'string')) && typeof o.url === 'string' && /^https?:\/\//.test(o.url))
        return { kind: 'URL', url: o.url, label: typeof o.label === 'string' ? o.label : undefined };
    const seq = o.sequence ?? o.seq;
    if (isValidSequence(seq))
        return { kind: 'NOTES', sequence: seq, label: typeof o.label === 'string' ? o.label : undefined };
    return null;
}
