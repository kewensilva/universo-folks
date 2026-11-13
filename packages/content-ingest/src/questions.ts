import { CHOICE_TYPES } from './schema';
import type { Question } from './schema';

/**
 * Tipos de questão: como cada um é GUARDADO no banco, MOSTRADO ao aluno (sem a resposta)
 * e CORRIGIDO no servidor. Fonte única para o importador e para a API (learning).
 *
 * Banco (tabela questions):
 *   - escolha (SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE): alternativas em question_options
 *   - demais tipos: campos próprios em `data` (JSON)
 *   - mídia (visual, áudio) em `media` (JSON); tempo em `timeLimitMs`; formato em `methodology`
 */

export const isChoiceType = (t: string) => (CHOICE_TYPES as readonly string[]).includes(t);

export interface QuestionStorage {
  type: Question['type'];
  prompt: string;
  explanation: string | null;
  methodology: string | null;
  timeLimitMs: number | null;
  data: Record<string, unknown> | null;
  media: Record<string, unknown> | null;
  options: Array<{ text: string; isCorrect: boolean; feedback: string | null }>;
}

/** Formato canônico -> linhas do banco. */
export function toStorage(q: Question): QuestionStorage {
  const media: Record<string, unknown> = {};
  for (const k of ['visual', 'visualAfterAnswer', 'audio', 'speakAfterAnswer'] as const) if (q[k] !== undefined) media[k] = q[k];
  let data: Record<string, unknown> | null = null;
  switch (q.type) {
    case 'NUMBER': data = { answer: q.answer, ...(q.tolerance !== undefined ? { tolerance: q.tolerance } : {}) }; break;
    case 'ORDER':
    case 'BUILD_SENTENCE': data = { pieces: q.pieces, answer: q.answer }; break;
    case 'MATCH_PAIRS': data = { pairs: q.pairs }; break;
    case 'CLASSIFY': data = { groups: q.groups, items: q.items }; break;
    case 'SIMULATOR': data = { simulator: q.simulator, ...(q.note ? { note: q.note } : {}) }; break;
  }
  return {
    type: q.type,
    prompt: q.prompt,
    explanation: q.explanation ?? null,
    methodology: q.methodology ?? null,
    timeLimitMs: q.timeLimitMs ?? null,
    data,
    media: Object.keys(media).length ? media : null,
    options: q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE' ? q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect, feedback: o.feedback ?? null })) : [],
  };
}

// ------------------------------------------------------------------ banco -> aluno
export interface StoredQuestion {
  id: string;
  type: string;
  prompt: string;
  explanation: string | null;
  mediaUrl?: string | null;
  points: number;
  methodology?: string | null;
  timeLimitMs?: number | null;
  data?: unknown;
  media?: unknown;
  options: Array<{ id: string; text: string; isCorrect: boolean; feedback: string | null }>;
}

/** O mínimo para montar a visão do aluno (as alternativas podem vir sem isCorrect). */
export type PublicSource = Omit<StoredQuestion, 'options' | 'explanation'> & { options: Array<{ id: string; text: string }> };

type Obj = Record<string, any>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

function shuffled<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** embaralha garantindo que não fique igual à ordem correta (quando possível) */
function shuffledNot<T>(arr: T[], forbidden: T[], rnd: () => number): T[] {
  for (let t = 0; t < 6; t++) {
    const s = shuffled(arr, rnd);
    if (s.length < 2 || s.some((x, i) => x !== forbidden[i])) return s;
  }
  return [...arr].reverse();
}

/**
 * O que o aluno recebe: NUNCA inclui a resposta (isCorrect, answer, group, pares certos).
 * Peças, pares e itens chegam embaralhados.
 */
export function publicQuestion(q: PublicSource, opts: { shuffleOptions?: boolean; rnd?: () => number } = {}) {
  const rnd = opts.rnd ?? Math.random;
  const d = obj(q.data);
  const m = obj(q.media);
  const base = {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    mediaUrl: q.mediaUrl ?? null,
    points: q.points,
    methodology: q.methodology ?? null,
    timeLimitMs: q.timeLimitMs ?? null,
    ...(m.visual ? { visual: m.visual } : {}),
    ...(m.audio ? { audio: m.audio } : {}),
  };
  switch (q.type) {
    case 'NUMBER':
      return base;
    case 'ORDER':
    case 'BUILD_SENTENCE': {
      const pieces: string[] = Array.isArray(d.pieces) ? d.pieces : [];
      return { ...base, pieces: shuffledNot(pieces, Array.isArray(d.answer) ? d.answer : [], rnd) };
    }
    case 'MATCH_PAIRS': {
      const pairs: Array<{ left: string; right: string }> = Array.isArray(d.pairs) ? d.pairs : [];
      return { ...base, left: shuffled(pairs.map((p) => p.left), rnd), right: shuffled(pairs.map((p) => p.right), rnd) };
    }
    case 'CLASSIFY': {
      const items: Array<{ text: string }> = Array.isArray(d.items) ? d.items : [];
      return { ...base, groups: Array.isArray(d.groups) ? d.groups : [], items: shuffled(items.map((i) => i.text), rnd) };
    }
    case 'SIMULATOR': {
      const sim = obj(d.simulator);
      return { ...base, simulator: sim, ...(d.note ? { note: d.note } : {}) };
    }
    default:
      const options = q.options.map((o) => ({ id: o.id, text: o.text }));
      return { ...base, options: opts.shuffleOptions ? shuffled(options, rnd) : options };
  }
}

// ------------------------------------------------------------------ correção
/** Resposta do aluno. Cada tipo usa o seu campo. */
export interface AnswerPayload {
  questionId: string;
  /** escolha */
  optionIds?: string[];
  /** NUMBER */
  value?: number;
  /** ORDER e BUILD_SENTENCE: peças na ordem escolhida */
  sequence?: string[];
  /** MATCH_PAIRS */
  pairs?: Array<{ left: string; right: string }>;
  /** CLASSIFY: item -> índice do grupo */
  assignments?: Array<{ item: string; group: number }>;
  /** SIMULATOR: o app aplica a regra do simulador e informa o resultado */
  simulator?: { correct: boolean; values?: Record<string, number> };
  timeMs?: number;
}

export interface GradeResult {
  correct: boolean;
  /** acerto informado pelo app (sem conferência no servidor) */
  selfReported?: boolean;
  /** dados para mostrar depois da resposta (só quando a correção é com feedback) */
  feedback: Record<string, unknown>;
}

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const sameSeq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => norm(x) === norm(b[i]));

export function gradeQuestion(q: StoredQuestion, a: AnswerPayload | undefined): GradeResult {
  const d = obj(q.data);
  const m = obj(q.media);
  const after = { explanation: q.explanation, ...(m.visualAfterAnswer ? { visualAfterAnswer: m.visualAfterAnswer } : {}), ...(m.speakAfterAnswer ? { speakAfterAnswer: m.speakAfterAnswer } : {}) };

  switch (q.type) {
    case 'NUMBER': {
      const expected = Number(d.answer);
      const tol = Number(d.tolerance ?? 0);
      const ok = typeof a?.value === 'number' && Number.isFinite(a.value) && Math.abs(a.value - expected) <= tol;
      return { correct: ok, feedback: { ...after, answer: expected } };
    }
    case 'ORDER':
    case 'BUILD_SENTENCE': {
      const expected: string[] = Array.isArray(d.answer) ? d.answer : [];
      const got = Array.isArray(a?.sequence) ? a!.sequence! : [];
      const ok = sameSeq(got, expected);
      const firstWrong = ok ? -1 : expected.findIndex((x, i) => norm(x) !== norm(got[i]));
      return { correct: ok, feedback: { ...after, answer: expected, ...(ok ? {} : { firstWrongIndex: firstWrong < 0 ? expected.length : firstWrong }) } };
    }
    case 'MATCH_PAIRS': {
      // compara pelo TEXTO: itens com o mesmo texto à direita são intercambiáveis
      const expected: Array<{ left: string; right: string }> = Array.isArray(d.pairs) ? d.pairs : [];
      const given = new Map((a?.pairs ?? []).map((p) => [norm(p.left), norm(p.right)]));
      const ok = expected.length > 0 && given.size === expected.length && expected.every((p) => given.get(norm(p.left)) === norm(p.right));
      return { correct: ok, feedback: { ...after, pairs: expected } };
    }
    case 'CLASSIFY': {
      const items: Array<{ text: string; group: number; feedback?: string }> = Array.isArray(d.items) ? d.items : [];
      const given = new Map((a?.assignments ?? []).map((x) => [norm(x.item), x.group]));
      const wrong = items.filter((i) => given.get(norm(i.text)) !== i.group);
      return {
        correct: items.length > 0 && wrong.length === 0,
        feedback: { ...after, items: items.map((i) => ({ text: i.text, group: i.group })), wrong: wrong.map((i) => ({ text: i.text, group: i.group, feedback: i.feedback ?? null })) },
      };
    }
    case 'SIMULATOR':
      // A regra de acerto de cada simulador roda no app (ainda não há regra no servidor).
      return { correct: a?.simulator?.correct === true, selfReported: true, feedback: { ...after } };
    default: {
      const right = q.options.filter((o) => o.isCorrect).map((o) => o.id).sort();
      const chosen = [...new Set(a?.optionIds ?? [])].sort();
      const ok = right.length > 0 && right.length === chosen.length && right.every((id, i) => id === chosen[i]);
      return {
        correct: ok,
        feedback: { ...after, correctOptionIds: right, feedback: q.options.filter((o) => chosen.includes(o.id) && o.feedback).map((o) => ({ optionId: o.id, feedback: o.feedback })) },
      };
    }
  }
}
