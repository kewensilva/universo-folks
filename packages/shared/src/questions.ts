/**
 * Questões como a API entrega ao aluno (SEM resposta) e o formato da resposta.
 * Espelha packages/content-ingest/src/questions.ts (ADR 0011).
 */
export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'NUMBER' | 'ORDER' | 'BUILD_SENTENCE' | 'MATCH_PAIRS' | 'CLASSIFY' | 'SIMULATOR';

interface Base {
  id: string;
  prompt: string;
  points: number;
  methodology?: string | null;
  timeLimitMs?: number | null;
  visual?: { kind: string; svg?: string; html?: string; url?: string };
  /** som da questão: voz (TTS), notas sintetizadas ou arquivo (ver soundOf) */
  audio?: { kind: 'TTS'; lang: string; text: string } | { kind: 'NOTES'; sequence: unknown[] } | { kind: 'URL'; url: string };
}
export type PublicQuestion =
  | (Base & { type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE'; options: Array<{ id: string; text: string }> })
  | (Base & { type: 'NUMBER' })
  | (Base & { type: 'ORDER' | 'BUILD_SENTENCE'; pieces: string[] })
  | (Base & { type: 'MATCH_PAIRS'; left: string[]; right: string[] })
  | (Base & { type: 'CLASSIFY'; groups: string[]; items: string[] })
  | (Base & { type: 'SIMULATOR'; simulator: { id: string; [k: string]: unknown }; note?: string });

export interface AnswerPayload {
  questionId: string;
  optionIds?: string[];
  value?: number;
  sequence?: string[];
  pairs?: Array<{ left: string; right: string }>;
  assignments?: Array<{ item: string; group: number }>;
  simulator?: { correct: boolean; values?: Record<string, number> };
  timeMs?: number;
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'Escolha uma',
  MULTIPLE_CHOICE: 'Marque todas as certas',
  TRUE_FALSE: 'Mito ou verdade',
  NUMBER: 'Digite o número',
  ORDER: 'Coloque em ordem',
  BUILD_SENTENCE: 'Monte a frase',
  MATCH_PAIRS: 'Ligue os pares',
  CLASSIFY: 'Classifique',
  SIMULATOR: 'Simulador',
};

/** A resposta está completa o suficiente para enviar? */
export function isAnswered(q: PublicQuestion, a: Partial<AnswerPayload> | undefined): boolean {
  if (!a) return false;
  switch (q.type) {
    case 'NUMBER': return typeof a.value === 'number' && Number.isFinite(a.value);
    case 'ORDER': return (a.sequence?.length ?? 0) === q.pieces.length;
    case 'BUILD_SENTENCE': return (a.sequence?.length ?? 0) > 0;
    case 'MATCH_PAIRS': return (a.pairs?.length ?? 0) === q.left.length;
    case 'CLASSIFY': return (a.assignments?.length ?? 0) === q.items.length;
    case 'SIMULATOR': return typeof a.simulator?.correct === 'boolean';
    default: return (a.optionIds?.length ?? 0) > 0;
  }
}
