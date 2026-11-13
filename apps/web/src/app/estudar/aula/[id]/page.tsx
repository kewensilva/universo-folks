'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, type Slide } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle, Progress } from '@/components/ui';
import { PracticePlayer } from '@/components/practice-player';
import { VideoPlayer } from '@/components/video-player';

export default function AulaPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useSession();
  const q = useQuery({ queryKey: ['lesson', id], queryFn: () => api.learning.lesson(id), staleTime: 0 });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const l = q.data!;
  const back = { href: `/estudar/curso/${l.courseId}`, label: 'Voltar à trilha' };
  if (l.type === 'LESSON' && l.content?.slides?.length) return <><PageTitle back={back} title={l.title} /><SlidesPlayer lessonId={l.id} courseId={l.courseId} slides={l.content.slides} /></>;
  if (l.type === 'VIDEO' && l.video) return <><PageTitle back={back} title={l.title} /><VideoPlayer lessonId={l.id} courseId={l.courseId} video={l.video} /></>;
  if (l.type === 'PRACTICE' && l.questions?.length) return <><PageTitle back={back} title={l.title} /><PracticePlayer lessonId={l.id} courseId={l.courseId} questions={l.questions} /></>;
  return (
    <>
      <PageTitle back={back} title={l.title} />
      <Card><p className="text-muted">{l.type === 'VIDEO' ? 'O vídeo desta etapa ainda não foi definido.' : l.type === 'PRACTICE' ? 'Esta prática é gerada no aparelho e ainda não está disponível.' : 'Este conteúdo interativo ainda não está disponível.'}</p></Card>
    </>
  );
}

/** Aula em telas: o texto aparece em partes (nunca tudo de uma vez), como no protótipo. */
function SlidesPlayer({ lessonId, courseId, slides }: { lessonId: string; courseId: string; slides: Slide[] }) {
  const { api } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [i, setI] = useState(0);
  const [part, setPart] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = slides[i];
  const parts = s.textParts?.length ? s.textParts : [s.text];
  const lastPart = part >= parts.length - 1;
  const lastSlide = i >= slides.length - 1;

  async function next() {
    if (!lastPart) return setPart(part + 1);
    if (!lastSlide) { setI(i + 1); setPart(0); return; }
    setBusy(true);
    try {
      await api.learning.completeLesson(lessonId);
      await qc.invalidateQueries({ queryKey: ['trail', courseId] });
      router.push(`/estudar/curso/${courseId}`);
    } catch (e) { setErr(errorMessage(e)); setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-2xl">
      <Progress value={((i + (part + 1) / parts.length) / slides.length) * 100} className="mb-6" />
      <Card className="min-h-72 p-8">
        <h2 className="text-2xl font-extrabold">{s.heading}</h2>
        <div className="mt-4 space-y-3 text-lg leading-relaxed">{parts.slice(0, part + 1).map((t, k) => <p key={k}>{t}</p>)}</div>
        {s.widget && lastPart && (
          <div className="mt-6 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
            Atividade interativa desta tela ({s.widget.type}) chega em breve.
          </div>
        )}
      </Card>
      {err && <p role="alert" className="mt-3 text-sm font-bold text-red">{err}</p>}
      <div className="mt-6 flex justify-end">
        <Button onClick={next} loading={busy}>{lastPart && lastSlide ? 'Concluir aula' : 'Continuar'}</Button>
      </div>
    </div>
  );
}
