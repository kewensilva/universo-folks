import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { QUESTION_TYPE_LABEL, colors, errorMessage, isAnswered, micChallengeOf, radius, soundOf, type AnswerPayload, type PublicQuestion } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, Progress, Text, s as ui } from './ui';
import { QuestionVisual } from './question-visual';
import type { AstroLook } from './space/astro-art';
import { Astronaut } from './space/astronaut';
import { QuestionSound } from './sound/question-sound';
import { MicChallengeView } from './sound/mic-challenge';

type Draft = Partial<AnswerPayload>;
/** O que a API devolve por questão depois da correção (ver gradeQuestion). */
type Item = {
  questionId: string; correct: boolean; selfReported?: boolean; explanation?: string | null;
  correctOptionIds?: string[]; feedback?: { optionId: string; feedback: string }[];
  answer?: number | string[]; pairs?: { left: string; right: string }[];
  wrong?: { text: string; group: number; feedback?: string | null }[];
};
type Result = { correct: number; total: number; scorePct: number; xpEarned: number; items: Item[] };

/** Prática do banco: uma questão por vez; a correção é feita no servidor ao final (ADR 0011). */
export function PracticePlayer({ lessonId, questions, onFinished, look }: { lessonId: string; questions: PublicQuestion[]; onFinished: () => void; look?: AstroLook | null }) {
  const { api } = useSession();
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const started = useRef(0);
  useEffect(() => { started.current = Date.now(); }, [i]);

  const q = questions[i];
  const a = answers[q?.id];
  const set = (d: Draft) => setAnswers((st) => ({ ...st, [q.id]: { ...st[q.id], ...d } }));

  async function next() {
    const timed = { ...answers, [q.id]: { ...answers[q.id], timeMs: Date.now() - started.current } };
    setAnswers(timed);
    if (i < questions.length - 1) return setI(i + 1);
    setBusy(true);
    setErr(null);
    try {
      const r = await api.learning.submitPractice(lessonId, questions.map((x) => ({ questionId: x.id, ...timed[x.id] }) as AnswerPayload));
      setResult((r.result ?? r) as Result);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  if (result) {
    const byId = new Map(result.items.map((it) => [it.questionId, it]));
    return (
      <View style={{ gap: 12 }}>
        <Card style={{ alignItems: 'center' }}>
          <Astronaut mood={result.scorePct >= 70 ? 'celebrate' : 'wave'} look={look} width={110} />
          <Text weight="black" size={22} style={{ marginTop: 4 }}>{result.correct} de {result.total} certas</Text>
          <Text tone="muted">{result.scorePct >= 70 ? 'Mandou bem!' : 'Bora revisar e tentar de novo?'}  ·  <Text tone="amber" weight="black">+{result.xpEarned} XP</Text></Text>
        </Card>
        {questions.map((x, k) => {
          const it = byId.get(x.id);
          return (
            <Card key={x.id} style={{ borderColor: it?.correct ? `${colors.green}66` : `${colors.red}66` }}>
              <Text weight="bold" size={14}>{k + 1}. {x.prompt}</Text>
              <QuestionVisual visual={x.visual} />
              <Text weight="bold" size={13} style={{ marginTop: 4, color: it?.correct ? colors.green : colors.red }}>{it?.correct ? 'Certa' : 'Errada'}</Text>
              {!it?.correct && <CorrectAnswer q={x} item={it} />}
              {!!it?.explanation && <Text tone="muted" size={13} style={{ marginTop: 6 }}>{it.explanation}</Text>}
            </Card>
          );
        })}
        <Button title="Voltar à trilha" onPress={onFinished} style={{ marginTop: 6 }} />
      </View>
    );
  }

  return (
    <View>
      <Progress value={(i / questions.length) * 100} />
      <Card style={{ marginTop: 16, padding: 20 }}>
        <Text tone="amber" weight="black" size={11} style={{ letterSpacing: 0.6 }}>{QUESTION_TYPE_LABEL[q.type].toUpperCase()} · {i + 1}/{questions.length}</Text>
        <Text weight="black" size={19} style={{ marginTop: 6 }}>{q.prompt}</Text>
        <QuestionVisual visual={q.visual} />
        <QuestionSound key={q.id} spec={soundOf(q.audio)} />
        <View style={{ marginTop: 18 }}><QuestionInput key={q.id} q={q} a={a} set={set} /></View>
      </Card>
      {err && <Text tone="red" weight="bold" style={{ marginTop: 10 }}>{err}</Text>}
      <Button title={i < questions.length - 1 ? 'Próxima' : 'Ver resultado'} onPress={next} loading={busy} disabled={!isAnswered(q, a)} style={{ marginTop: 18 }} />
    </View>
  );
}

function Chip({ label, on, onPress, disabled, prefix }: { label: string; on?: boolean; onPress: () => void; disabled?: boolean; prefix?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on, disabled: !!disabled }} onPress={onPress} disabled={disabled}
      style={({ pressed }) => ({ borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, borderColor: on ? colors.amber : colors.cardBorder, backgroundColor: on ? `${colors.amber}26` : colors.bgElevated, opacity: disabled ? 0.35 : pressed ? 0.8 : 1 })}>
      <Text weight="bold" style={{ color: on ? colors.ink : colors.muted }}>{prefix && <Text tone="amber" weight="black">{prefix} </Text>}{label}</Text>
    </Pressable>
  );
}

function QuestionInput({ q, a, set }: { q: PublicQuestion; a: Draft | undefined; set: (d: Draft) => void }) {
  switch (q.type) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE':
    case 'MULTIPLE_CHOICE': {
      const multi = q.type === 'MULTIPLE_CHOICE';
      const sel = new Set(a?.optionIds ?? []);
      return (
        <View style={{ gap: 8, flexDirection: q.type === 'TRUE_FALSE' ? 'row' : 'column' }}>
          {q.options.map((o) => (
            <View key={o.id} style={q.type === 'TRUE_FALSE' ? { flex: 1 } : undefined}>
              <Chip label={o.text} on={sel.has(o.id)} onPress={() => set({ optionIds: multi ? (sel.has(o.id) ? [...sel].filter((x) => x !== o.id) : [...sel, o.id]) : [o.id] })} />
            </View>
          ))}
        </View>
      );
    }
    case 'NUMBER':
      return (
        <TextInput keyboardType="decimal-pad" accessibilityLabel="Sua resposta" value={a?.value === undefined ? '' : String(a.value)} placeholderTextColor={colors.dim} placeholder="Sua resposta"
          onChangeText={(t) => { const n = Number(t.replace(',', '.')); set({ value: t.trim() === '' || Number.isNaN(n) ? undefined : n }); }}
          style={[ui.input, { fontSize: 24 }]} />
      );
    case 'ORDER':
    case 'BUILD_SENTENCE': {
      const seq = a?.sequence ?? [];
      const used = usedIndexes(q.pieces, seq);
      const col = q.type === 'ORDER';
      return (
        <View>
          <View style={{ minHeight: 56, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.cardBorder, padding: 10, gap: 8, flexDirection: col ? 'column' : 'row', flexWrap: 'wrap' }}>
            {seq.length === 0 && <Text tone="dim" size={13}>{col ? 'Toque nos passos na ordem certa' : 'Toque nas palavras para montar a frase'}</Text>}
            {seq.map((p, k) => <Chip key={k} label={p} on prefix={col ? `${k + 1}.` : undefined} onPress={() => set({ sequence: seq.filter((_, j) => j !== k) })} />)}
          </View>
          <View style={{ marginTop: 10, gap: 8, flexDirection: col ? 'column' : 'row', flexWrap: 'wrap' }}>
            {q.pieces.map((p, k) => <Chip key={k} label={p} disabled={used.has(k)} onPress={() => set({ sequence: [...seq, p] })} />)}
          </View>
        </View>
      );
    }
    case 'MATCH_PAIRS':
      return <MatchPairs q={q} a={a} set={set} />;
    case 'CLASSIFY': {
      const asg = new Map((a?.assignments ?? []).map((x) => [x.item, x.group]));
      return (
        <View style={{ gap: 10 }}>
          {q.items.map((it) => (
            <View key={it} style={{ borderRadius: radius.md, backgroundColor: colors.bgElevated, padding: 12, gap: 8 }}>
              <Text weight="bold">{it}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {q.groups.map((g, gi) => <Chip key={g} label={g} on={asg.get(it) === gi} onPress={() => { asg.set(it, gi); set({ assignments: [...asg].map(([item, group]) => ({ item, group })) }); }} />)}
              </View>
            </View>
          ))}
        </View>
      );
    }
    case 'SIMULATOR': {
      const mic = micChallengeOf(q.simulator);
      if (mic) return <MicAnswer challenge={mic} answer={a?.simulator} set={set} />;
      return (
        <View style={{ gap: 10 }}>
          <Text tone="muted" size={13}>O simulador “{q.simulator.id}” ainda não está disponível aqui. Fez o desafio? Informe o resultado.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Chip label="Atingi a meta" on={a?.simulator?.correct === true} onPress={() => set({ simulator: { correct: true } })} /></View>
            <View style={{ flex: 1 }}><Chip label="Não consegui" on={a?.simulator?.correct === false} onPress={() => set({ simulator: { correct: false } })} /></View>
          </View>
        </View>
      );
    }
  }
}

/** Questão de microfone (simulator mic_pitch): o app ouve e informa se a pessoa acertou a nota. */
function MicAnswer({ challenge, answer, set }: { challenge: NonNullable<ReturnType<typeof micChallengeOf>>; answer: Draft['simulator']; set: (d: Draft) => void }) {
  const [round, setRound] = useState(0);
  if (answer) {
    return (
      <View style={{ gap: 10, alignItems: 'center' }}>
        <Text weight="black" size={18} style={{ color: answer.correct ? colors.green : colors.red }}>{answer.correct ? 'Afinado! Conseguiu ✓' : 'Não foi dessa vez'}</Text>
        <Button title="Tentar de novo" variant="ghost" onPress={() => { set({ simulator: undefined }); setRound(round + 1); }} />
      </View>
    );
  }
  return <MicChallengeView key={round} challenge={challenge} onResult={(correct, values) => set({ simulator: { correct, values } })} />;
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
  const usedCount = (r: string) => pairs.filter((p) => p.right === r).length;
  const available = (r: string, idx: number) => q.right.slice(0, idx + 1).filter((x) => x === r).length > usedCount(r);
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1, gap: 8 }}>
        {q.left.map((l) => <Chip key={l} label={pairOf.has(l) ? `${l} → ${pairOf.get(l)}` : l} on={left === l || pairOf.has(l)} onPress={() => setLeft(l)} />)}
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        {q.right.map((r, idx) => (
          <Chip key={`${r}-${idx}`} label={r} disabled={!left || !available(r, idx)}
            onPress={() => { if (!left) return; set({ pairs: [...pairs.filter((p) => p.left !== left), { left, right: r }] }); setLeft(null); }} />
        ))}
        {pairs.length > 0 && <Pressable onPress={() => set({ pairs: [] })}><Text tone="dim" weight="bold" size={12} style={{ textDecorationLine: 'underline' }}>Recomeçar</Text></Pressable>}
      </View>
    </View>
  );
}

function CorrectAnswer({ q, item }: { q: PublicQuestion; item?: Item }) {
  if (!item) return null;
  if ('options' in q && Array.isArray(item.correctOptionIds)) {
    const ids = item.correctOptionIds;
    return <Text size={13} style={{ marginTop: 4 }}>Resposta: <Text weight="black" size={13}>{q.options.filter((o) => ids.includes(o.id)).map((o) => o.text).join(', ')}</Text>{item.feedback?.[0]?.feedback ? `\n${item.feedback[0].feedback}` : ''}</Text>;
  }
  if (item.answer !== undefined) return <Text size={13} style={{ marginTop: 4 }}>Resposta: <Text weight="black" size={13}>{Array.isArray(item.answer) ? item.answer.join(q.type === 'ORDER' ? ' → ' : ' ') : String(item.answer)}</Text></Text>;
  if (Array.isArray(item.pairs)) return <Text size={13} style={{ marginTop: 4 }}>Pares: <Text weight="black" size={13}>{item.pairs.map((p) => `${p.left} = ${p.right}`).join(' · ')}</Text></Text>;
  if (Array.isArray(item.wrong) && q.type === 'CLASSIFY') return <Text size={13} style={{ marginTop: 4 }}>{item.wrong.map((w) => `${w.text} → ${q.groups[w.group]}${w.feedback ? ` · ${w.feedback}` : ''}`).join('\n')}</Text>;
  return null;
}
