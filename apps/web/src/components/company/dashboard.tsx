'use client';

import { useQuery } from '@tanstack/react-query';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Loading, PageTitle, Progress, Stat } from '../ui';

export function CompanyDashboard({ tenantId, title }: { tenantId: string; title?: string }) {
  const { api, user } = useSession();
  const q = useQuery({ queryKey: ['dash', 'company', tenantId], queryFn: () => api.dashboards.company(tenantId) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  return (
    <>
      <PageTitle title={title ?? `${fmt.greeting()}, ${fmt.firstName(user?.name)}`} subtitle={`Engajamento e aprendizagem da equipe · ${fmt.date(d.period.from)} a ${fmt.date(d.period.to)}`} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Licenças de colaborador" value={`${d.seats.collaborators.used}/${d.seats.collaborators.max}`} hint={`${d.seats.collaborators.available} disponíveis`} />
        <Stat label="Ativos em 7 dias" value={fmt.pct(d.engagement.active7dPct)} hint={`${d.engagement.active7d} de ${d.engagement.members} pessoas`} tone="green" />
        <Stat label="Nunca acessaram" value={fmt.num(d.engagement.neverAccessed)} hint={fmt.pct(d.engagement.neverAccessedPct)} tone="red" />
        <Stat label="Trilhas obrigatórias" value={fmt.pct(d.compliance.mandatoryCompletionPct)} hint={`${d.compliance.overdue} atrasadas · ${d.compliance.dueNext7Days} vencem em 7 dias`} tone="purple" />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-extrabold">Por departamento</h2>
          <ul className="mt-3 space-y-4">
            {d.byDepartment.map((x) => (
              <li key={x.departmentId}>
                <div className="flex justify-between text-sm"><span className="font-bold">{x.name}</span><span className="text-muted">{x.members} pessoas · ativos {fmt.pct(x.active7dPct)}</span></div>
                <Progress value={x.avgProgressPct} className="mt-1" />
                <div className="mt-1 text-xs text-dim">Progresso médio {fmt.pct(x.avgProgressPct)} · {x.certificates} certificados</div>
              </li>
            ))}
            {d.byDepartment.length === 0 && <li className="text-sm text-muted">Nenhum departamento ainda.</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="font-extrabold">Cursos liberados</h2>
          <ul className="mt-3 space-y-4">
            {d.byCourse.slice(0, 8).map((c) => (
              <li key={c.courseId}>
                <div className="flex justify-between gap-2 text-sm"><span className="font-bold">{c.course} <span className="font-medium text-dim">· {c.planet}</span></span><span className="shrink-0 text-muted">{c.completed}/{c.eligible}</span></div>
                <Progress value={c.completionPct} className="mt-1" color="var(--color-green)" />
              </li>
            ))}
            {d.byCourse.length === 0 && <li className="text-sm text-muted">Nenhum curso liberado para a empresa.</li>}
          </ul>
        </Card>
      </section>

      <Card className="mt-6">
        <h2 className="font-extrabold">Ranking de XP</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {d.ranking.slice(0, 10).map((r, i) => (
            <li key={r.userId} className="flex items-center gap-3 rounded-xl bg-bg-2 px-3 py-2 text-sm">
              <span className="w-6 text-center font-extrabold text-amber">{i + 1}</span>
              <span className="flex-1 font-bold">{r.name}</span>
              <span className="text-muted">nível {r.level} · {fmt.num(r.xp)} XP</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
