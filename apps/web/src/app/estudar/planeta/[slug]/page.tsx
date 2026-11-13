'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/session';
import { PlanetOrb } from '@/components/planet';
import { Card, ErrorBox, Loading, PageTitle, Progress } from '@/components/ui';

export default function PlanetaPage() {
  const { slug } = useParams<{ slug: string }>();
  const { api } = useSession();
  const q = useQuery({ queryKey: ['catalog', 'planet', slug], queryFn: () => api.catalog.planet(slug) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data!;
  return (
    <>
      <PageTitle back={{ href: '/estudar', label: 'Início' }} title={p.name} subtitle={p.description} />
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <Card className="flex flex-col items-center self-start text-center">
          <PlanetOrb visual={p.visual} themeColor={p.themeColor} size={130} label={p.name} />
          <div className="mt-2 w-full"><Progress value={p.progressPct} /><div className="mt-1 text-xs text-dim">{Math.round(p.progressPct)}% do planeta</div></div>
        </Card>
        <div className="flex flex-col gap-3">
          {p.courses.map((c) => {
            const soon = c.status === 'COMING_SOON';
            const inner = (
              <Card className={soon ? 'opacity-60' : 'transition hover:border-amber/50'}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold">{c.title}</h2>
                    <p className="text-sm text-muted">{c.meta ?? `${c.units} unidades`}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5 text-[11px] font-extrabold">
                    {soon && <span className="rounded-full bg-dim/20 px-2 py-0.5 text-dim">EM BREVE</span>}
                    {c.locked && c.lockReason !== 'COMING_SOON' && <span className="rounded-full bg-amber/15 px-2 py-0.5 text-amber">🔒 {(c.requiredPlan ?? 'Premium').toUpperCase()}</span>}
                    {!c.locked && c.accessTier === 'FREE' && c.freeUnits > 0 && !soon && <span className="rounded-full bg-green/15 px-2 py-0.5 text-green">{c.freeUnits} GRÁTIS</span>}
                    {c.hasCertificate && <span className="rounded-full bg-purple/15 px-2 py-0.5 text-purple">CERTIFICADO</span>}
                  </div>
                </div>
                {!soon && <><Progress value={c.progressPct} className="mt-4" /><div className="mt-1 text-xs text-dim">{Math.round(c.progressPct)}% concluído{c.badgeEarned ? ' · 🏅 insígnia conquistada' : c.badge ? ` · insígnia: ${c.badge.name}` : ''}</div></>}
              </Card>
            );
            return soon ? <div key={c.id}>{inner}</div> : <Link key={c.id} href={`/estudar/curso/${c.id}`}>{inner}</Link>;
          })}
        </div>
      </div>
    </>
  );
}
