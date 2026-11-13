'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { TrailLesson } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Loading, PageTitle, Progress, cx } from '@/components/ui';

const TYPE: Record<string, { icon: string; label: string }> = {
  LESSON: { icon: '📖', label: 'Aula' },
  VIDEO: { icon: '🎬', label: 'Vídeo' },
  PRACTICE: { icon: '🎯', label: 'Prática' },
  INTERACTIVE: { icon: '🧩', label: 'Interativo' },
};

export default function CursoPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useSession();
  const q = useQuery({ queryKey: ['trail', id], queryFn: () => api.learning.trail(id) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const t = q.data!;
  return (
    <>
      <PageTitle back={{ href: `/estudar/planeta/${t.planet.slug}`, label: t.planet.name }} title={t.course.title}
        subtitle={`${t.completedLessons} de ${t.totalLessons} etapas concluídas`} />
      <Progress value={t.progressPct} className="mb-8 h-3" />
      <div className="flex flex-col gap-6">
        {t.units.map((u) => (
          <section key={u.id}>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl text-sm font-extrabold text-bg" style={{ background: u.themeColor ?? '#ffb020' }}>{u.number}</span>
              <div>
                <h2 className="font-extrabold">{u.title}</h2>
                <div className="text-xs text-dim">{u.locked ? (u.lockReason === 'PREMIUM_REQUIRED' ? `🔒 ${t.requiredPlan ?? 'Premium'}` : '🔒 Bloqueada') : u.accessTier === 'FREE' ? 'Grátis' : 'Premium'}</div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {u.lessons.map((l) => <Step key={l.id} l={l} locked={u.locked} color={u.themeColor ?? '#ffb020'} current={t.currentLessonId === l.id} />)}
            </div>
          </section>
        ))}
        {t.exam && (
          <Card className="border-purple/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-extrabold">🏆 {t.exam.title}</h2>
                <p className="text-sm text-muted">{t.exam.questionCount} questões · nota mínima {t.exam.passingScore}%{t.exam.passed ? ' · aprovado ✓' : ''}</p>
              </div>
              <span className="text-sm text-dim">{t.exam.state === 'LOCKED' ? (t.exam.lockReason === 'PREMIUM_REQUIRED' ? `🔒 ${t.requiredPlan ?? 'Premium'}` : 'Conclua a trilha') : 'Em breve'}</span>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function Step({ l, locked, color, current }: { l: TrailLesson; locked: boolean; color: string; current: boolean }) {
  const off = locked || l.state === 'LOCKED';
  const t = TYPE[l.type] ?? TYPE.LESSON;
  const inner = (
    <Card className={cx('flex items-center gap-3 p-4', off ? 'opacity-50' : 'transition hover:border-amber/50', current && 'border-amber/70')}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg" style={{ background: l.state === 'COMPLETED' ? '#45d48333' : `${color}22` }} aria-hidden>
        {l.state === 'COMPLETED' ? '✓' : off ? '🔒' : t.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{l.title}</span>
        <span className="block text-xs text-dim">{t.label} · {l.xpReward} XP{l.bestScorePct != null ? ` · melhor ${Math.round(l.bestScorePct)}%` : ''}</span>
      </span>
      {current && !off && <span className="text-xs font-extrabold text-amber">CONTINUAR</span>}
    </Card>
  );
  return off ? <div>{inner}</div> : <Link href={`/estudar/aula/${l.id}`}>{inner}</Link>;
}
