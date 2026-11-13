'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { PlanetCard } from '@/components/planet-card';
import { Card, ErrorBox, Loading, Progress, cx } from '@/components/ui';

export default function EstudarHome() {
  const { api } = useSession();
  const home = useQuery({ queryKey: ['catalog', 'home'], queryFn: () => api.catalog.home() });
  const planets = useQuery({ queryKey: ['catalog', 'planets'], queryFn: () => api.catalog.planets() });
  const [cat, setCat] = useState<string | null>(null);

  if (home.isLoading) return <Loading />;
  if (home.error) return <ErrorBox error={home.error} onRetry={() => home.refetch()} />;
  const h = home.data!;
  const cats = h.categories.filter((c) => (c.planetCount ?? 1) > 0);
  const active = cat ?? cats[0]?.slug ?? null;
  const list = (planets.data?.items ?? []).filter((p) => !active || p.category.slug === active);

  return (
    <>
      <section className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Card className="bg-gradient-to-br from-purple/25 to-card">
          <p className="text-muted">{fmt.greeting()},</p>
          <h1 className="text-3xl font-extrabold">{h.greetingName} 👋</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
            <span className="rounded-full bg-amber/15 px-3 py-1 text-amber">🔥 {h.progress.streakDays} {h.progress.streakDays === 1 ? 'dia' : 'dias'} seguidos</span>
            <span className="rounded-full bg-blue/15 px-3 py-1 text-blue">⭐ Nível {h.progress.level}</span>
            <span className="rounded-full bg-green/15 px-3 py-1 text-green">{fmt.num(h.progress.totalXp)} XP</span>
            {h.premium && <span className="rounded-full bg-gold/15 px-3 py-1 text-gold">👑 Premium</span>}
          </div>
        </Card>
        <Card>
          <div className="flex items-baseline justify-between"><h2 className="font-extrabold">Meta de hoje</h2><span className="text-sm text-muted">{h.progress.todayXp}/{h.progress.dailyGoalXp} XP</span></div>
          <Progress value={h.progress.dailyGoalPct} className="mt-3 h-3" color="var(--color-green)" />
          <div className="mt-4 flex items-end justify-between gap-1">
            {h.progress.last7Days.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-md bg-amber/70" style={{ height: `${Math.max(4, Math.min(48, d.xp / 2))}px` }} title={`${d.xp} XP`} />
                <span className="text-[10px] text-dim">{fmt.shortDate(d.date).slice(0, 2)}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {h.assignments.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold">Trilhas da empresa</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {h.assignments.map((a) => (
              <Link key={a.id} href={a.courseId ? `/estudar/curso/${a.courseId}` : a.planetSlug ? `/estudar/planeta/${a.planetSlug}` : '/estudar/planetas'}>
                <Card className="hover:border-amber/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold">{a.title}</div>
                    {a.mandatory && <span className="rounded-full bg-red/15 px-2 py-0.5 text-[10px] font-extrabold text-red">OBRIGATÓRIA</span>}
                  </div>
                  <Progress value={a.progressPct} className="mt-3" />
                  <div className={cx('mt-1 text-xs', a.overdue ? 'font-bold text-red' : 'text-dim')}>
                    {a.completed ? 'Concluída ✓' : a.overdue ? 'Atrasada' : a.dueDate ? `Prazo ${fmt.dateOnly(a.dueDate)}${a.daysLeft != null ? ` · ${a.daysLeft} dias` : ''}` : 'Sem prazo'}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">Explore os planetas</h2>
          <Link href="/estudar/planetas" className="text-sm font-bold text-amber">Ver lista</Link>
        </div>
        {cats.length > 1 && (
          <div className="mb-4 inline-flex rounded-2xl bg-card p-1">
            {cats.map((c) => (
              <button key={c.slug} onClick={() => setCat(c.slug)} className={cx('rounded-xl px-4 py-2 text-sm font-bold', active === c.slug ? 'bg-card-2 text-ink' : 'text-muted')}>{c.name}</button>
            ))}
          </div>
        )}
        {planets.isLoading ? <Loading /> : planets.error ? <ErrorBox error={planets.error} /> : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{list.map((p) => <PlanetCard key={p.id} p={p} />)}</div>
        )}
      </section>
    </>
  );
}
