import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { VideoProgressResult } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, Screen, Text } from '@/components/ui';
import { PracticePlayer } from '@/components/practice-player';
import { SlidesPlayer } from '@/components/slides-player';
import { VideoPlayer } from '@/components/video-player';
import { GeneratedPractice } from '@/components/sound/generated-practice';
import { Astronaut } from '@/components/space/astronaut';
import { Guide } from '@/components/space/guide';

/** Uma etapa da trilha: vídeo, aula em telas ou prática. */
export default function Etapa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['lesson', id], queryFn: () => api.learning.lesson(id), staleTime: 0 });
  const [done, setDone] = useState<VideoProgressResult | null>(null);
  const l = q.data;
  // figurino do astronauta vem do planeta (a trilha já está em cache quando se abre a etapa)
  const trail = useQuery({ queryKey: ['trail', l?.courseId], queryFn: () => api.learning.trail(l!.courseId), enabled: !!l?.courseId });
  const look = trail.data?.planet.visual?.look;

  async function refreshTrail() {
    if (l) await qc.invalidateQueries({ queryKey: ['trail', l.courseId] });
  }
  async function completed(r: unknown) {
    await refreshTrail();
    setDone((r ?? { completed: true }) as VideoProgressResult);
  }
  function goNext() {
    if (done?.next?.lessonId) router.replace(`/etapa/${done.next.lessonId}`);
    else router.back();
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar à trilha"><Text tone="muted" weight="bold">← Voltar à trilha</Text></Pressable>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : l && (
        <View style={{ marginTop: 8 }}>
          {l.type === 'VIDEO' && <Text tone="amber" weight="black" size={11} style={{ letterSpacing: 1 }}>AULA EM VÍDEO · FASTLEARNING</Text>}
          {l.type === 'LESSON' && l.content?.slides?.some((x) => x.audioDemos?.length) && <Text tone="amber" weight="black" size={11} style={{ letterSpacing: 1 }}>🎧 AULA DE SOM · USE FONE OU AUMENTE O VOLUME</Text>}
          {l.type === 'PRACTICE' && l.questionSource === 'GENERATED' && <Text tone="amber" weight="black" size={11} style={{ letterSpacing: 1 }}>{practiceEyebrow(l.generators ?? [])}</Text>}
          <Text weight="black" size={24} style={{ marginBottom: 16 }}>{l.title}</Text>
          {l.type === 'VIDEO' && l.video ? (
            <>
              <VideoPlayer lessonId={l.id} video={l.video} onCompleted={completed} />
              {!done && <View style={{ marginTop: 14 }}><Guide mood="wave" look={look} text="Vídeo curto e direto ao ponto. Depois, a prática fixa o que você viu." /></View>}
            </>
          ) : l.type === 'LESSON' && l.content?.slides?.length ? (
            done ? null : <SlidesPlayer lessonId={l.id} slides={l.content.slides} onCompleted={completed} look={look} />
          ) : l.type === 'PRACTICE' && l.questionSource === 'GENERATED' && l.generators?.length ? (
            <GeneratedPractice lessonId={l.id} generators={l.generators} count={l.questionCount ?? 8} look={look}
              onFinished={async () => { await refreshTrail(); router.back(); }}
              onNext={async (next) => { await refreshTrail(); router.replace(`/etapa/${next}`); }} />
          ) : l.type === 'PRACTICE' && l.questions?.length ? (
            <PracticePlayer lessonId={l.id} questions={l.questions} look={look} onFinished={async () => { await refreshTrail(); router.back(); }} />
          ) : (
            <Card><Text tone="muted">{l.type === 'VIDEO' ? 'O vídeo desta etapa ainda não foi definido.' : l.type === 'PRACTICE' ? 'Esta prática é gerada no aparelho e ainda não está disponível.' : 'Este conteúdo ainda não está disponível.'}</Text></Card>
          )}
          {done && (
            <Card style={{ marginTop: 16, gap: 12, alignItems: 'center' }}>
              <Astronaut mood="celebrate" look={look} width={110} />
              <Text weight="black" size={18} style={{ textAlign: 'center' }}>{l.type === 'VIDEO' ? 'Vídeo concluído!' : 'Aula concluída!'}{!done.alreadyCompleted && done.gamification?.xpEarned ? <Text tone="amber" weight="black" size={18}>{`  +${done.gamification.xpEarned} XP`}</Text> : null}</Text>
              <Button title={done.next?.lessonId ? 'Próxima etapa' : 'Voltar à trilha'} onPress={goNext} style={{ alignSelf: 'stretch' }} />
            </Card>
          )}
        </View>
      )}
    </Screen>
  );
}

const MIC_GENERATORS = ['tune', 'sing', 'sing_steps', 'voice', 'guitar'];
/** Título da prática gerada: ouvido, microfone ou os dois. */
function practiceEyebrow(gens: string[]) {
  const mic = gens.some((g) => MIC_GENERATORS.includes(g));
  const ear = gens.some((g) => !MIC_GENERATORS.includes(g));
  return mic && ear ? '🎧🎤 PRÁTICA DE OUVIDO E MICROFONE' : mic ? '🎤 PRÁTICA COM MICROFONE' : '🎧 PRÁTICA DE OUVIDO';
}
