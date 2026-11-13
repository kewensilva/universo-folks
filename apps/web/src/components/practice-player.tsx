'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { QUESTION_TYPE_LABEL, encodeWav, errorMessage, isAnswered, renderSequence, soundOf, type AnswerPayload, type PublicQuestion, type SoundSpec } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, Progress, cx } from './ui';
import { QuestionVisual } from './question-visual';

type Draft = Partial<AnswerPayload>;
/** O que a API devolve por questão depois da correção (ver gradeQuestion). */
type Item = {
  questionId: string;
  correct: boolean;
  selfReported?: boolean;
  explanation?: string | null;
  correctOptionIds?: string[];
  feedback?: Array<{ optionId: string; feedback: string }>;
  answer?: number | string[];
  pairs?: Array<{ left: string; right: string }>;
  wrong?: Array<{ text: string; group: number; feedback?: string | null }>;
};
type Result = { correct: number; total: number; scorePct: number; xpEarned: number; items: Item[] };

/** Prática do banco: uma questão por vez; a correção é feita no servidor ao final (ADR 0011). */
export function PracticePlayer({ lessonId, courseId, questions }: { lessonId: string; courseId: string; questions: PublicQuestion[] }) {
  const { api } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const started = useRef(0);
  useEffect(() => { started.current = Date.now(); }, [i]);

  const q = questions[i];
  const a = answers[q?.id];
  const set = (d: Draft) => setAnswers((s) => ({ ...s, [q.id]: { ...s[q.id], ...d } }));

  async function next() {
    // tempo de resposta (bônus de XP quando o cronômetro está ligado)
    set({ timeMs: Date.now() - started.current });
    if (i < questions.length - 1) return setI(i + 1);
    setBusy(true);
    setErr(null);
    try {
      const payload = questions.map((x) => ({ questionId: x.id, ...answers[x.id] }) as AnswerPayload);
      const r = await api.learning.submitPractice(lessonId, payload);
      setResult((r.result ?? r) as Result);
      await qc.invalidateQueries({ queryKey: ['trail', courseId] });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const byId = new Map(result.items.map((it) => [it.questionId, it]));
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="text-center">
          <div className="text-5xl">{result.scorePct >= 70 ? '🎉' : '💪'}</div>
          <h2 className="mt-2 text-2xl font-extrabold">{result.correct} de {result.total} certas</h2>
          <p className="text-muted">+{result.xpEarned} XP</p>
        </Card>
        <div className="mt-4 flex flex-col gap-3">
          {questions.map((x, k) => {
            const it = byId.get(x.id);
            return (
              <Card key={x.id} className={cx('p-4', it?.correct ? 'border-green/40' : 'border-red/40')}>
                <div className="text-sm font-bold">{k + 1}. {x.prompt}</div>
                <QuestionVisual visual={x.visual} />
                <div className={cx('mt-1 text-sm font-bold', it?.correct ? 'text-green' : 'text-red')}>{it?.correct ? 'Certa' : 'Errada'}{it?.selfReported ? ' (resultado informado pelo simulador)' : ''}</div>
                {!it?.correct && <CorrectAnswer q={x} item={it} />}
                {it?.explanation && <p className="mt-2 text-sm text-muted">{it.explanation}</p>}
              </Card>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end"><Button onClick={() => router.push(`/estudar/curso/${courseId}`)}>Voltar à trilha</Button></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Progress value={(i / questions.length) * 100} className="mb-6" />
      <Card className="p-6 md:p-8">
        <div className="text-xs font-extrabold uppercase tracking-wide text-amber">{QUESTION_TYPE_LABEL[q.type]} · {i + 1}/{questions.length}</div>
        <h2 className="mt-2 text-xl font-extrabold">{q.prompt}</h2>
        <QuestionVisual visual={q.visual} />
        <SoundButton key={q.id} spec={soundOf(q.audio)} />
        <div className="mt-6"><QuestionInput q={q} a={a} set={set} /></div>
      </Card>
      {err && <p role="alert" className="mt-3 text-sm font-bold text-red">{err}</p>}
      <div className="mt-6 flex justify-end">
        <Button onClick={next} loading={busy} disabled={!isAnswered(q, a)}>{i < questions.length - 1 ? 'Próxima' : 'Ver resultado'}</Button>
      </div>
    </div>
  );
}

/** Áudio da questão falado pela voz do navegador (TTS). */
/** Som da questão: voz do navegador (TTS), notas sintetizadas (mesmo motor do app) ou arquivo de áudio. */
function SoundButton({ spec }: { spec: SoundSpec | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audio.current?.pause(); if (typeof window !== 'undefined') window.speechSynthesis?.cancel(); }, []);
  if (!spec) return null;
  const play = () => {
    if (typeof window === 'undefined') return;
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    if (spec.kind === 'TTS') {
      const u = new SpeechSynthesisUtterance(spec.text);
      u.lang = spec.lang;
      window.speechSynthesis?.speak(u);
      return;
    }
    let src = spec.kind === 'URL' ? spec.url : '';
    if (spec.kind === 'NOTES') {
      const wav = encodeWav(renderSequence(spec.sequence));
      src = URL.createObjectURL(new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }));
    }
    audio.current = new Audio(src);
    void audio.current.play();
  };
  return <button onClick={play} className="mt-4 rounded-full bg-blue/15 px-4 py-2 text-sm font-bold text-blue">🔊 Ouvir</button>;
}

const chip = (on: boolean) => cx('rounded-2xl border px-4 py-3 text-left font-bold transition', on ? 'border-amber bg-amber/15 text-ink' : 'border-line bg-bg-2 text-muted hover:border-amber/50');

function QuestionInput({ q, a, set }: { q: PublicQuestion; a: Draft | undefined; set: (d: Draft) => void }) {
  switch (q.type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE':
    case 'MULTIPLE_CHOICE': {
      const multi = q.type === 'MULTIPLE_CHOICE';
      const sel = new Set(a?.optionIds ?? []);
      return (
        <div className={cx('grid gap-2', q.type === 'TRUE_FALSE' && 'grid-cols-2')}>
          {q.options.map((o) => (
            <button key={o.id} className={chip(sel.has(o.id))} aria-pressed={sel.has(o.id)}
              onClick={() => set({ optionIds: multi ? (sel.has(o.id) ? [...sel].filter((x) => x !== o.id) : [...sel, o.id]) : [o.id] })}>
              {o.text}
            </button>
          ))}
        </div>
      );
    }
    case 'NUMBER':
      return (
        <input type="number" inputMode="decimal" autoFocus aria-label="Sua resposta" value={a?.value ?? ''}
          onChange={(e) => set({ value: e.target.value === '' ? undefined : Number(e.target.value) })}
          className="w-full rounded-2xl border border-line bg-bg-2 px-4 py-3 text-2xl font-extrabold outline-none focus:border-amber" />
      );
    case 'ORDER':
    case 'BUILD_SENTENCE': {
      const seq = a?.sequence ?? [];
      // peças podem repetir: controla pelo índice
      const usedIdx = usedIndexes(q.pieces, seq);
      return (
        <div>
          <div className="min-h-16 rounded-2xl border border-dashed border-line p-3">
            {seq.length === 0 && <span className="text-sm text-dim">{q.type === 'ORDER' ? 'Toque nos passos na ordem certa' : 'Toque nas palavras para montar a frase'}</span>}
            <div className={cx('flex gap-2', q.type === 'ORDER' ? 'flex-col' : 'flex-wrap')}>
              {seq.map((p, k) => (
                <button key={k} className="rounded-xl bg-amber/20 px-3 py-2 text-left font-bold text-ink" onClick={() => set({ sequence: seq.filter((_, j) => j !== k) })} title="Tirar">
                  {q.type === 'ORDER' && <span className="mr-2 text-amber">{k + 1}.</span>}{p}
                </button>
              ))}
            </div>
          </div>
          <div className={cx('mt-3 flex gap-2', q.type === 'ORDER' ? 'flex-col' : 'flex-wrap')}>
            {q.pieces.map((p, k) => (
              <button key={k} disabled={usedIdx.has(k)} onClick={() => set({ sequence: [...seq, p] })} className={cx(chip(false), 'disabled:opacity-30')}>{p}</button>
            ))}
          </div>
        </div>
      );
    }
    case 'MATCH_PAIRS':
      return <MatchPairs q={q} a={a} set={set} />;
    case 'CLASSIFY': {
      const asg = new Map((a?.assignments ?? []).map((x) => [x.item, x.group]));
      return (
        <div className="flex flex-col gap-3">
          {q.items.map((it) => (
            <div key={it} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-bg-2 p-3">
              <span className="font-bold">{it}</span>
              <div className="flex gap-1.5">
                {q.groups.map((g, gi) => (
                  <button key={g} aria-pressed={asg.get(it) === gi} className={cx('rounded-xl border px-3 py-1.5 text-sm font-bold', asg.get(it) === gi ? 'border-amber bg-amber/15' : 'border-line text-muted')}
                    onClick={() => { asg.set(it, gi); set({ assignments: [...asg].map(([item, group]) => ({ item, group })) }); }}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'SIMULATOR':
      return (
        <div>
          <p className="rounded-2xl bg-bg-2 p-4 text-sm text-muted">O simulador “{q.simulator.id}” roda no app. Fez o desafio lá? Informe o resultado.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className={chip(a?.simulator?.correct === true)} onClick={() => set({ simulator: { correct: true } })}>Atingi a meta</button>
            <button className={chip(a?.simulator?.correct === false)} onClick={() => set({ simulator: { correct: false } })}>Não consegui</button>
          </div>
        </div>
      );
  }
}

function usedIndexes(pieces: string[], seq: string[]) {
  const used = new Set<number>();
  for (const p of seq) {
    const k = pieces.findIndex((x, j) => x === p && !used.has(j));
    if (k >= 0) used.add(k);
  }
  return used;
}

function MatchPairs({ q, a, set }: { q: Extract<PublicQuestion, { type: 'MATCH_PAIRS' }>; a: Draft | undefined; set: (d: Draft) => void }) {
  const [left, setLeft] = useState<string | null>(null);
  const pairs = a?.pairs ?? [];
  const pairOf = new Map(pairs.map((p) => [p.left, p.right]));
  const rightUsed = pairs.map((p) => p.right);
  const usedCount = (r: string) => rightUsed.filter((x) => x === r).length;
  const available = (r: string, idx: number) => q.right.slice(0, idx + 1).filter((x) => x === r).length > usedCount(r);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-2">
        {q.left.map((l) => (
          <button key={l} className={chip(left === l || pairOf.has(l))} onClick={() => setLeft(l)}>
            {l}{pairOf.has(l) && <span className="block text-xs text-amber">→ {pairOf.get(l)}</span>}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {q.right.map((r, idx) => (
          <button key={`${r}-${idx}`} disabled={!left || !available(r, idx)} className={cx(chip(false), 'disabled:opacity-40')}
            onClick={() => { if (!left) return; set({ pairs: [...pairs.filter((p) => p.left !== left), { left, right: r }] }); setLeft(null); }}>
            {r}
          </button>
        ))}
        {pairs.length > 0 && <button className="text-xs font-bold text-dim underline" onClick={() => set({ pairs: [] })}>Recomeçar</button>}
      </div>
    </div>
  );
}

function CorrectAnswer({ q, item }: { q: PublicQuestion; item?: Item }) {
  if (!item) return null;
  if ('options' in q && Array.isArray(item.correctOptionIds)) {
    const ids = item.correctOptionIds;
    const t = q.options.filter((o) => ids.includes(o.id)).map((o) => o.text).join(', ');
    return <p className="mt-1 text-sm">Resposta: <b>{t}</b>{item.feedback?.[0]?.feedback ? <span className="block text-muted">{item.feedback[0].feedback}</span> : null}</p>;
  }
  if (item.answer !== undefined) return <p className="mt-1 text-sm">Resposta: <b>{Array.isArray(item.answer) ? item.answer.join(q.type === 'ORDER' ? ' → ' : ' ') : String(item.answer)}</b></p>;
  if (Array.isArray(item.pairs)) return <p className="mt-1 text-sm">Pares: <b>{item.pairs.map((p) => `${p.left} = ${p.right}`).join(' · ')}</b></p>;
  if (Array.isArray(item.wrong) && q.type === 'CLASSIFY') return <ul className="mt-1 text-sm">{item.wrong.map((w) => <li key={w.text}><b>{w.text}</b> → {q.groups[w.group]}{w.feedback ? <span className="text-muted"> · {w.feedback}</span> : null}</li>)}</ul>;
  return null;
}
