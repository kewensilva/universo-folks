import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { canGenerate, colors, errorMessage, generateRound, radius, type GeneratedQuestion } from '@folks/shared';
import { useSession } from '@/lib/session';
import { sfx } from '@/lib/sound';
import { Button, Card, Progress, Text } from '@/components/ui';
import type { AstroLook } from '@/components/space/astro-art';
import { Astronaut } from '@/components/space/astronaut';
import { Guide } from '@/components/space/guide';
import { QuestionSound } from './question-sound';
import { MicChallengeView } from './mic-challenge';

type Done = { correct: number; total: number; scorePct: number; xpEarned: number; passed: boolean; passingPct: number; next?: string | null };

/**
 * Prática gerada no aparelho (questionSource GENERATED): treino de ouvido (grave/agudo, maior/menor,
 * graus, progressões) e desafios no microfone (afinar a corda, cantar a nota). Cada rodada é nova.
 * O app corrige e manda só acertos/total para a API (POST /practice-result).
 */
export function GeneratedPractice({ lessonId, generators, count, look, onFinished, onNext }: { lessonId: string; generators: string[]; count: number; look?: AstroLook | null; onFinished: () => void; onNext?: (lessonId: string) => void }) {
  const { api } = useSession();
  const prefs = useQuery({ queryKey: ['me', 'preferences'], queryFn: () => api.me.preferences(), staleTime: 5 * 60_000 });
  const supported = canGenerate(generators);
  const [seed, setSeed] = useState(0);
  const round = useMemo<GeneratedQuestion[]>(() => (supported ? generateRound(generators, Math.max(1, Math.min(count || 8, 30))) : []), [supported, generators, count, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  if (!supported) {
    return <Card><Text tone="muted">Esta prática usa exercícios que o app ainda não gera ({generators.join(', ')}). Chega numa próxima versão.</Text></Card>;
  }

  const q = round[i];
  const answered = q.type === 'choice' ? picked !== null : micOk !== null;
  const right = q.type === 'choice' ? picked !== null && q.options[picked].correct : micOk === true;

  function answer(ok: boolean) {
    if (ok) setScore((s) => s + 1);
    if (prefs.data?.soundEffects !== false) sfx(ok);
  }

  async function next() {
    if (i < round.length - 1) { setI(i + 1); setPicked(null); setMicOk(null); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await api.learning.practiceResult(lessonId, { correct: score, total: round.length });
      setDone({ correct: r.correct, total: r.total, scorePct: r.scorePct, xpEarned: r.xpEarned, passed: r.passed, passingPct: r.passingPct, next: r.completion?.next?.lessonId ?? null });
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  function again() { setSeed(seed + 1); setI(0); setPicked(null); setMicOk(null); setScore(0); setDone(null); }

  if (done) {
    return (
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <Astronaut mood={done.passed ? 'celebrate' : 'wave'} look={look} width={110} />
        <Text weight="black" size={22}>{done.correct} de {done.total} certas</Text>
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {done.passed ? 'Mandou bem!' : `Precisa de ${done.passingPct}% para concluir. Bora de novo?`}
          {done.xpEarned ? <Text tone="amber" weight="black">{`  +${done.xpEarned} XP`}</Text> : null}
        </Text>
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 6 }}>
          {done.passed && done.next && onNext ? <Button title="Próxima etapa" onPress={() => onNext(done.next!)} /> : null}
          <Button title="Treinar de novo" variant={done.passed ? 'ghost' : 'primary'} onPress={again} />
          <Button title="Voltar à trilha" variant="ghost" onPress={onFinished} />
        </View>
      </Card>
    );
  }

  return (
    <View>
      <Progress value={(i / round.length) * 100} />
      <Card style={{ marginTop: 16, padding: 20 }}>
        <Text tone="amber" weight="black" size={11} style={{ letterSpacing: 0.6 }}>{q.type === 'mic' ? 'MICROFONE' : 'TREINO DE OUVIDO'} · {i + 1}/{round.length}</Text>
        <Text weight="black" size={19} style={{ marginTop: 6 }}>{q.prompt}</Text>
        {q.type === 'choice' ? (
          <>
            {q.sound && <QuestionSound key={`${seed}-${i}`} spec={{ kind: 'NOTES', sequence: q.sound }} />}
            <View style={{ marginTop: 18, gap: 8, flexDirection: q.row ? 'row' : 'column', flexWrap: 'wrap' }}>
              {q.options.map((o, k) => {
                const show = picked !== null;
                const color = show && o.correct ? colors.green : show && k === picked ? colors.red : picked === k ? colors.amber : colors.cardBorder;
                return (
                  <Pressable key={k} disabled={show} onPress={() => { setPicked(k); answer(o.correct); }} accessibilityRole="button" accessibilityState={{ selected: picked === k, disabled: show }}
                    style={({ pressed }) => [{ flexGrow: 1, flexBasis: q.row ? 0 : undefined, minWidth: q.row ? 80 : undefined, borderRadius: radius.md, borderWidth: 2, borderColor: color, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: show && o.correct ? `${colors.green}22` : show && k === picked ? `${colors.red}22` : colors.bgElevated, alignItems: 'center' }, pressed && { opacity: 0.8 }]}>
                    <Text weight="black" style={{ textAlign: 'center' }}>{o.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <View style={{ marginTop: 14 }}>
            {micOk === null
              ? <MicChallengeView key={`${seed}-${i}`} challenge={q.mic} onResult={(ok) => { setMicOk(ok); answer(ok); }} />
              : null}
          </View>
        )}
        {answered && (
          <View style={{ marginTop: 16, padding: 14, borderRadius: radius.md, backgroundColor: right ? `${colors.green}1a` : `${colors.red}1a`, gap: 4 }}>
            <Text weight="black" style={{ color: right ? colors.green : colors.red }}>{right ? 'Isso!' : q.type === 'mic' ? 'Não foi dessa vez' : 'Quase!'}</Text>
            <Text tone="muted" size={14}>{q.explanation}</Text>
          </View>
        )}
      </Card>
      {!answered && i === 0 && q.type === 'choice' && (
        <View style={{ marginTop: 12 }}><Guide look={look} size={72} text="Escute com atenção. Pode ouvir de novo quantas vezes quiser." /></View>
      )}
      {err && <Text tone="red" weight="bold" style={{ marginTop: 10 }}>{err}</Text>}
      {answered && <Button title={i < round.length - 1 ? 'Continuar' : 'Ver resultado'} onPress={next} loading={busy} style={{ marginTop: 18 }} />}
    </View>
  );
}
