'use client';

import Link from 'next/link';
import type { PlanetCard as Planet } from '@folks/shared';
import { PlanetOrb } from './planet';
import { Card, PlanetBadge, Progress } from './ui';

export function PlanetCard({ p }: { p: Planet }) {
  const body = (
    <Card className={`flex h-full flex-col items-center text-center transition ${p.comingSoon ? 'opacity-60' : 'hover:-translate-y-0.5 hover:border-amber/50'}`}>
      <PlanetOrb visual={p.visual} themeColor={p.themeColor} size={78} label={p.name} />
      <h3 className="mt-1 text-lg font-extrabold">{p.name}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">{p.badges.map((b) => <PlanetBadge key={b} code={b} />)}</div>
      <div className="mt-auto w-full pt-4">
        {p.inProgress || p.progressPct > 0 ? (
          <>
            <Progress value={p.progressPct} />
            <div className="mt-1 text-xs text-dim">{Math.round(p.progressPct)}% · {p.courseCount} {p.courseCount === 1 ? 'curso' : 'cursos'}</div>
          </>
        ) : (
          <div className="text-xs text-dim">{p.comingSoon ? 'Em breve' : `${p.courseCount} ${p.courseCount === 1 ? 'curso' : 'cursos'}`}{p.locked ? ` · 🔒 ${p.requiredPlan ?? 'Premium'}` : ''}</div>
        )}
      </div>
    </Card>
  );
  return p.comingSoon ? <div aria-disabled>{body}</div> : <Link href={`/estudar/planeta/${p.slug}`}>{body}</Link>;
}
