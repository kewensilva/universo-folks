'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createWatchTracker, errorMessage, type LessonVideo, type VideoProgressResult } from '@folks/shared';
import type { VimeoUrl } from '@vimeo/player';
import { useSession } from '@/lib/session';
import { Button, Card, Progress } from './ui';

/**
 * Etapa de vídeo (Vimeo). O tempo assistido em reprodução contínua vai para a API a cada 10 s;
 * a API aplica o anti-pulo e conclui a etapa ao atingir a % mínima (padrão 90%).
 */
export function VideoPlayer({ lessonId, courseId, video }: { lessonId: string; courseId: string; video: LessonVideo }) {
  const { api } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const frame = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState<VideoProgressResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tracker = useRef(createWatchTracker(video));

  useEffect(() => {
    if (!frame.current || !video.embedUrl) return;
    let alive = true;
    let completed = false;
    let player: import('@vimeo/player').default | null = null;
    const t = tracker.current;
    const send = async (ended = false) => {
      if (completed) return;
      try {
        const r = await api.learning.videoProgress(lessonId, t.watched, ended);
        if (r.completed && alive) {
          completed = true;
          setDone(r);
          await qc.invalidateQueries({ queryKey: ['trail', courseId] });
        }
      } catch (e) { if (alive) setErr(errorMessage(e)); }
    };
    // o SDK mexe em window: carrega só no navegador
    import('@vimeo/player').then(({ default: Player }) => {
      if (!alive || !frame.current) return;
      player = new Player(frame.current, { url: video.embedUrl as VimeoUrl, responsive: true, dnt: true, title: false, byline: false, portrait: false });
      player.on('timeupdate', ({ seconds }: { seconds: number }) => {
        t.tick(seconds);
        setPct(t.pctWatched);
        if (t.shouldReport()) void send();
      });
      player.on('ended', () => { t.end(); setPct(t.pctWatched); void send(true); });
      player.on('pause', () => void send());
    });
    return () => { alive = false; void player?.destroy(); };
  }, [api, courseId, lessonId, qc, video]);

  if (!video.embedUrl) return <Card><p className="text-muted">O vídeo desta etapa ainda não foi definido.</p></Card>;
  const required = !!video.durationSeconds;
  return (
    <div className="mx-auto max-w-3xl">
      <div ref={frame} className="overflow-hidden rounded-3xl border border-line bg-black" />
      <div className="mt-4 flex items-center gap-3">
        <Progress value={done ? 100 : pct} className="flex-1" />
        <span className="text-xs font-bold text-dim">{done ? 'Concluído' : `${Math.round(pct)}% assistido`}</span>
      </div>
      {!done && required && <p className="mt-2 text-sm text-muted">Assista pelo menos {video.minWatchPct ?? 90}% do vídeo para concluir a etapa. Pular a barra não conta.</p>}
      {err && <p role="alert" className="mt-3 text-sm font-bold text-red">{err}</p>}
      {done && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div><b>Vídeo concluído!</b>{!done.alreadyCompleted && done.gamification?.xpEarned ? <span className="text-amber"> +{done.gamification.xpEarned} XP</span> : null}</div>
          <Button onClick={() => router.push(done.next?.lessonId ? `/estudar/aula/${done.next.lessonId}` : `/estudar/curso/${courseId}`)}>{done.next?.lessonId ? 'Próxima etapa' : 'Voltar à trilha'}</Button>
        </Card>
      )}
    </div>
  );
}
