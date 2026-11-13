'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { PlanetCard } from '@/components/planet-card';
import { Empty, ErrorBox, Loading, PageTitle, cx } from '@/components/ui';

const FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'free', label: 'Grátis' },
  { id: 'premium', label: 'Premium' },
];

export default function PlanetasPage() {
  const { api } = useSession();
  const [filter, setFilter] = useState('');
  const q = useQuery({ queryKey: ['catalog', 'planets', filter], queryFn: () => api.catalog.planets({ filter: filter || undefined }) });
  return (
    <>
      <PageTitle title="Cursos" subtitle="Cada planeta é um tema. Toque para ver os cursos." />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cx('rounded-full border px-4 py-1.5 text-sm font-bold', filter === f.id ? 'border-amber bg-amber/15 text-amber' : 'border-line text-muted')}>
            {f.label}{q.data && f.id ? ` (${(q.data.counters as Record<string, unknown>)[f.id] ?? 0})` : ''}
          </button>
        ))}
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data!.items.length === 0 ? <Empty title="Nenhum planeta aqui ainda" /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{q.data!.items.map((p) => <PlanetCard key={p.id} p={p} />)}</div>
      )}
    </>
  );
}
