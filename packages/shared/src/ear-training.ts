// Práticas geradas no aparelho (questionSource GENERATED): treino de ouvido do violão e desafios
// no microfone. Portado dos geradores do protótipo (pitch, qual, deg, prog...). O app corrige e
// informa só acertos/total em POST /learning/lessons/:id/practice-result.
import { GUITAR_STRINGS, type PitchMode } from './pitch';
import { chordName, degreeQuality, degreeRoot, midiToName, midiToSolfege, noteToMidi, type ChordQuality, type NoteRef, type SoundSequence } from './sound';

/** Desafio no microfone: tocar ou cantar a(s) nota(s), na ordem, segurando dentro da tolerância. */
export interface MicChallenge {
  targets: number[];
  /** 'note' = oitava exata (violão); 'pitchClass' = qualquer oitava (canto) */
  mode: PitchMode;
  toleranceCents: number;
  /** tempo segurando a nota afinada para valer */
  holdMs: number;
  instrument: 'violao' | 'voz';
  /** som de referência que o aluno pode ouvir antes */
  reference?: SoundSequence;
  /** tempo para tentar; depois conta como não conseguiu */
  timeLimitMs: number;
}

export type GeneratedQuestion =
  | { kind: string; type: 'choice'; prompt: string; options: Array<{ text: string; correct: boolean }>; sound?: SoundSequence; explanation: string; row?: boolean }
  | { kind: string; type: 'mic'; prompt: string; mic: MicChallenge; explanation: string };

type Rnd = () => number;
const pick = <T>(a: readonly T[], r: Rnd): T => a[Math.floor(r() * a.length)];
const shuffle = <T>(a: readonly T[], r: Rnd): T[] => { const o = [...a]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
const int = (n: number, r: Rnd) => Math.floor(r() * n);

const KEYS_T: Array<[number, string]> = [[48, 'C'], [43, 'G'], [50, 'D'], [45, 'A'], [40, 'E']];
const PROG4: Array<[number[], string]> = [[[0, 4, 5, 3], 'I – V – vi – IV'], [[0, 3, 4, 0], 'I – IV – V – I'], [[5, 3, 0, 4], 'vi – IV – I – V'], [[0, 5, 3, 4], 'I – vi – IV – V']];
const DLAB: Record<number, string> = { 0: 'I', 3: 'IV', 4: 'V', 5: 'vi' };
const PC = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const hum = (q: ChordQuality) => (q === '' ? 'maior' : 'menor');
const choice = (labels: string[], ok: (i: number, t: string) => boolean) => labels.map((text, i) => ({ text, correct: ok(i, text) }));

/** Geradores de música e microfone que o app sabe rodar. */
const GEN: Record<string, (r: Rnd) => GeneratedQuestion> = {
  // grave ou agudo: duas notas de violão
  pitch: (r) => {
    const n1 = 48 + int(12, r), d = pick([12, -12, 7, -7, 5, -5, 4, -4, 2, -2, 0, 0], r), n2 = n1 + d, ans = d > 0 ? 0 : d < 0 ? 1 : 2;
    return { kind: 'pitch', type: 'choice', row: true, prompt: 'A segunda nota é mais aguda, mais grave ou igual?', options: choice(['Mais aguda', 'Mais grave', 'Igual'], (i) => i === ans), sound: [['n', n1], ['n', n2]],
      explanation: d === 0 ? 'As duas notas eram a mesma.' : `A segunda nota estava ${Math.abs(d)} ${Math.abs(d) === 1 ? 'casa' : 'casas'} ${d > 0 ? 'acima' : 'abaixo'} da primeira.` };
  },
  // grave ou agudo com tom puro (sem timbre de violão)
  pitch_tone: (r) => {
    const n1 = 55 + int(14, r), d = pick([7, -7, 5, -5, 3, -3, 2, -2, 12, -12], r), n2 = n1 + d, ans = d > 0 ? 0 : 1;
    return { kind: 'pitch_tone', type: 'choice', row: true, prompt: 'O segundo som é mais agudo ou mais grave?', options: choice(['Mais agudo', 'Mais grave'], (i) => i === ans), sound: [['t', n1, 0.9], ['r', 0.15], ['t', n2, 0.9]],
      explanation: `O segundo som estava ${Math.abs(d)} semitons ${d > 0 ? 'acima (mais agudo)' : 'abaixo (mais grave)'}.` };
  },
  // qual das três é a mais aguda
  pitch2: (r) => {
    let ns: number[];
    do { const b = 45 + int(8, r); ns = [0, 1, 2].map(() => b + int(13, r)); }
    while (new Set(ns).size < 3 || (() => { const o = [...ns].sort((a, b) => b - a); return o[0] - o[1] < 2; })());
    const hi = ns.indexOf(Math.max(...ns));
    const second = [...ns].sort((a, b) => b - a)[1];
    return { kind: 'pitch2', type: 'choice', row: true, prompt: 'Qual das três notas é a mais aguda?', options: choice(['1ª nota', '2ª nota', '3ª nota'], (i) => i === hi), sound: ns.map((n) => ['n', n] as ['n', number]),
      explanation: `As notas foram ${ns.map((n) => PC[n % 12]).join(', ')}. A ${hi + 1}ª era a mais aguda, ${Math.max(...ns) - second} casas acima da segunda mais alta.` };
  },
  // maior ou menor
  qual: (r) => {
    const root = 40 + int(8, r), q: ChordQuality = r() < 0.5 ? '' : 'm';
    return { kind: 'qual', type: 'choice', row: true, prompt: 'Esse acorde é maior ou menor?', options: choice(['Maior', 'Menor'], (i) => (i === 0) === (q === '')), sound: [['c', root, q]],
      explanation: `Era ${chordName(root, q)}, um acorde ${q === '' ? 'maior: soa aberto' : 'menor: soa mais fechado'}. A diferença está na terça, ${q === '' ? '4' : '3'} casas acima da tônica.` };
  },
  qual2: (r) => {
    const r1 = 40 + int(9, r); let r2; do { r2 = 40 + int(9, r); } while (r2 === r1);
    const q1: ChordQuality = r() < 0.5 ? '' : 'm', q2: ChordQuality = r() < 0.5 ? '' : 'm';
    const ans = q1 === '' && q2 === 'm' ? 0 : q1 === 'm' && q2 === '' ? 1 : q1 === '' ? 2 : 3;
    return { kind: 'qual2', type: 'choice', prompt: 'Ouça os dois acordes. Qual é a ordem dos humores?', options: choice(['Maior → menor', 'Menor → maior', 'Os dois maiores', 'Os dois menores'], (i) => i === ans), sound: [['c', r1, q1], ['c', r2, q2]],
      explanation: `Foi ${chordName(r1, q1)} (${hum(q1)}) e depois ${chordName(r2, q2)} (${hum(q2)}).` };
  },
  // graus I, IV, V
  deg: (r) => {
    const [t, k] = pick(KEYS_T, r), d = pick([0, 3, 4, 3, 4], r), lab: Record<number, string> = { 0: 'I', 3: 'IV', 4: 'V' };
    return { kind: 'deg', type: 'choice', row: true, prompt: 'Primeiro vem o I (a casa). Qual é o segundo acorde?', options: ['I', 'IV', 'V'].map((x) => ({ text: x, correct: x === lab[d] })), sound: [['c', degreeRoot(t, 0), ''], ['c', degreeRoot(t, d), '']],
      explanation: `Em ${k} maior: I = ${k}, IV = ${chordName(degreeRoot(t, 3))}, V = ${chordName(degreeRoot(t, 4))}. Esse era o ${lab[d]} (${chordName(degreeRoot(t, d))}).${d === 4 ? ' Repare como ele pede para voltar ao I.' : ''}` };
  },
  deg2: (r) => {
    const [t, k] = pick(KEYS_T, r), d = pick([3, 4], r);
    return { kind: 'deg2', type: 'choice', row: true, prompt: 'Ouça I → ? → I. O acorde do meio é o IV ou o V?', options: ['IV', 'V'].map((x) => ({ text: x, correct: x === DLAB[d] })), sound: [['c', degreeRoot(t, 0), ''], ['c', degreeRoot(t, d), ''], ['c', degreeRoot(t, 0), '']],
      explanation: d === 4 ? `Era o V (${chordName(degreeRoot(t, 4))}, em ${k} maior). A volta para o I soa como um ponto final forte.` : `Era o IV (${chordName(degreeRoot(t, 3))}, em ${k} maior). A volta para o I soa suave, como um "amém".` };
  },
  // progressões
  prog: (r) => {
    const [t, k] = pick(KEYS_T, r), right = pick(PROG4, r), others = shuffle(PROG4.filter((p) => p !== right), r).slice(0, 2);
    return { kind: 'prog', type: 'choice', prompt: 'Qual progressão você ouviu?', options: shuffle([right, ...others], r).map((p) => ({ text: p[1], correct: p === right })), sound: [['p', t, right[0]]],
      explanation: `Era ${right[1]} em ${k} maior: ${right[0].map((d) => chordName(degreeRoot(t, d), degreeQuality(d))).join(', ')}.` };
  },
  prog2: (r) => {
    const [t, k] = pick(KEYS_T, r), p = pick(PROG4, r), pos = pick([1, 2, 3], r), d = p[0][pos], ord = ['1º', '2º', '3º', '4º'];
    return { kind: 'prog2', type: 'choice', row: true, prompt: `Qual grau é o ${ord[pos]} acorde? (O 1º é o ${DLAB[p[0][0]]}.)`, options: ['I', 'IV', 'V', 'vi'].map((x) => ({ text: x, correct: x === DLAB[d] })), sound: [['p', t, p[0]]],
      explanation: `Era ${p[1]} em ${k} maior: ${p[0].map((x) => chordName(degreeRoot(t, x), degreeQuality(x))).join(', ')}. O ${ord[pos]} acorde é o ${DLAB[d]} (${chordName(degreeRoot(t, d), degreeQuality(d))}).` };
  },
  // microfone: afinar uma corda solta do violão
  tune: (r) => {
    const s = pick(GUITAR_STRINGS, r);
    return { kind: 'tune', type: 'mic', prompt: `Toque a ${s.string}ª corda solta: ${s.name}`, explanation: `A ${s.string}ª corda solta é ${s.name}. Se ficou grave, aperte a tarraxa; se ficou aguda, afrouxe.`,
      mic: { targets: [s.midi], mode: 'note', toleranceCents: 35, holdMs: 700, instrument: 'violao', reference: [['n', s.midi]], timeLimitMs: 30000 } };
  },
  // microfone: cantar a nota ouvida (qualquer oitava)
  sing: (r) => {
    const m = pick([48, 50, 52, 53, 55, 57, 59, 60], r);
    return { kind: 'sing', type: 'mic', prompt: `Ouça e cante a nota ${midiToSolfege(m)} (${midiToName(m)}), num "ááá" contínuo`, explanation: `A nota era ${midiToSolfege(m)}. Vale em qualquer oitava: o que importa é a nota, não se a voz é grave ou aguda.`,
      mic: { targets: [m], mode: 'pitchClass', toleranceCents: 50, holdMs: 900, instrument: 'voz', reference: [['t', m, 1.4]], timeLimitMs: 30000 } };
  },
  // microfone: cantar uma pequena escala subindo (Dó Ré Mi)
  sing_steps: (r) => {
    const base = pick([48, 50, 53, 55], r), notes = [base, base + 2, base + 4];
    return { kind: 'sing_steps', type: 'mic', prompt: `Cante subindo: ${notes.map(midiToSolfege).join(' → ')}`, explanation: 'Três notas em degraus: cada uma um tom acima da anterior, como "Dó, Ré, Mi".',
      mic: { targets: notes, mode: 'pitchClass', toleranceCents: 50, holdMs: 600, instrument: 'voz', reference: notes.map((n) => ['t', n, 0.8] as ['t', number, number]), timeLimitMs: 40000 } };
  },
};

/** Misturas do protótipo (revisões) */
const POOLS: Record<string, string[]> = {
  rev2: ['pitch', 'pitch2', 'qual', 'qual2', 'qual'],
  rev3: ['pitch2', 'qual', 'qual2', 'deg', 'deg2', 'deg'],
  rev4: ['qual2', 'deg', 'deg2', 'prog', 'prog2', 'prog'],
  mix: ['pitch', 'pitch2', 'qual', 'qual2', 'deg', 'deg2', 'prog', 'prog2'],
  ear: ['pitch', 'pitch_tone', 'pitch2', 'qual'],
  voice: ['sing', 'sing', 'sing_steps'],
  guitar: ['tune'],
};

/** Descrição de cada gerador (catálogo para o MASTER e para o Claude). */
export const SOUND_GENERATORS: Record<string, string> = {
  pitch: 'Grave ou agudo: duas notas de violão (mais aguda, mais grave ou igual)',
  pitch_tone: 'Grave ou agudo com tom puro: o segundo som é mais agudo ou mais grave',
  pitch2: 'Três notas: qual é a mais aguda',
  qual: 'Acorde maior ou menor',
  qual2: 'Dois acordes: ordem dos humores (maior/menor)',
  deg: 'Graus: depois do I, é o IV ou o V',
  deg2: 'I → ? → I: o acorde do meio é IV ou V',
  prog: 'Qual progressão (I–V–vi–IV, I–IV–V–I...)',
  prog2: 'Qual grau é o acorde N da progressão',
  tune: 'Microfone: tocar a corda solta pedida do violão (afinação)',
  sing: 'Microfone: ouvir e cantar a nota (qualquer oitava)',
  sing_steps: 'Microfone: cantar três notas subindo (Dó → Ré → Mi)',
  rev2: 'Revisão: grave/agudo e maior/menor', rev3: 'Revisão: maior/menor e graus', rev4: 'Revisão: graus e progressões',
  mix: 'Mistura de todo o treino de ouvido', ear: 'Mistura de grave/agudo e maior/menor', voice: 'Mistura de canto', guitar: 'Afinação das cordas',
};

/** O app sabe gerar todas estas? */
export function canGenerate(generators: string[]): boolean {
  return generators.length > 0 && generators.every((g) => !!GEN[g] || !!POOLS[g]);
}

/** Uma questão de um dos geradores (sorteia entre eles e dentro das misturas). */
export function generateQuestion(generators: string[], rnd: Rnd = Math.random): GeneratedQuestion {
  let k = pick(generators, rnd);
  if (POOLS[k]) k = pick(POOLS[k], rnd);
  const g = GEN[k];
  if (!g) throw new Error(`Gerador desconhecido: ${k}`);
  return g(rnd);
}

/** Rodada de N questões sem repetir a mesma pergunta+som seguida. */
export function generateRound(generators: string[], count: number, rnd: Rnd = Math.random): GeneratedQuestion[] {
  const out: GeneratedQuestion[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 10) {
    const q = generateQuestion(generators, rnd);
    const prev = out[out.length - 1];
    if (prev && JSON.stringify(prev) === JSON.stringify(q)) continue;
    out.push(q);
  }
  return out;
}

const NOTE_LIST = (v: unknown): number[] => (Array.isArray(v) ? v : v == null ? [] : [v]).map((x) => noteToMidi(x as NoteRef)).filter((m) => Number.isFinite(m) && m >= 28 && m <= 96);

/**
 * Lê o desafio de microfone de uma questão SIMULATOR do banco:
 * simulator = { id: "mic_pitch", target: "E2" | targets: ["E2","A2"], mode?: "note"|"pitchClass",
 *               instrument?: "violao"|"voz", toleranceCents?, holdMs?, reference?: "pluck"|"tone"|"none", timeLimitSec? }
 */
export function micChallengeOf(sim: { id: string; [k: string]: unknown } | null | undefined): MicChallenge | null {
  if (!sim || sim.id !== 'mic_pitch') return null;
  const targets = NOTE_LIST(sim.targets ?? sim.target);
  if (!targets.length || targets.length > 12) return null;
  const instrument = sim.instrument === 'voz' ? 'voz' : 'violao';
  const mode: PitchMode = sim.mode === 'pitchClass' || sim.mode === 'note' ? sim.mode : instrument === 'voz' ? 'pitchClass' : 'note';
  const num = (v: unknown, d: number, min: number, max: number) => (typeof v === 'number' && v >= min && v <= max ? v : d);
  const ref = sim.reference === 'none' ? undefined : sim.reference === 'tone' || (sim.reference !== 'pluck' && instrument === 'voz')
    ? targets.map((t) => ['t', t, 0.9] as ['t', number, number])
    : targets.map((t) => ['n', t] as ['n', number]);
  return {
    targets,
    mode,
    instrument,
    toleranceCents: num(sim.toleranceCents, instrument === 'voz' ? 50 : 35, 5, 100),
    holdMs: num(sim.holdMs, 700, 200, 5000),
    reference: ref,
    timeLimitMs: num(sim.timeLimitSec, 30, 5, 300) * 1000,
  };
}
