'use client';

import { useQuery } from '@tanstack/react-query';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { useState } from 'react';
import { Button, Card, ErrorBox, Loading, PageTitle, Progress, Stat } from '@/components/ui';
import { saveBlob } from '@/components/admin';

export default function MasterHome() {
  const { api, user } = useSession();
  const q = useQuery({ queryKey: ['dash', 'master'], queryFn: () => api.dashboards.master() });
  const [busy, setBusy] = useState(false);
  async function csv() { setBusy(true); try { saveBlob(await api.download('/dashboards/master/report.csv'), `relatorio-geral-folks-${new Date().toISOString().slice(0, 10)}.csv`); } finally { setBusy(false); } }
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const months = d.financial.monthlyRevenue.slice(-6);
  const maxMonth = Math.max(1, ...months.map((m) => m.cents));
  return (
    <>
      <PageTitle title={`${fmt.greeting()}, ${fmt.firstName(user?.name)}`} subtitle={`Todo o ecossistema · ${fmt.date(d.period.from)} a ${fmt.date(d.period.to)}`} actions={<Button variant="ghost" loading={busy} onClick={csv}>Baixar relatório geral (CSV)</Button>} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Empresas ativas" value={fmt.num(d.clients.activeTenants)} hint={Object.entries(d.clients.byType).map(([k, v]) => `${k}: ${v}`).join(' · ')} />
        <Stat label="Pessoas" value={fmt.num(d.users.total)} hint={`${fmt.num(d.users.newInPeriod)} novas no período`} tone="blue" />
        <Stat label="Ativas em 7 dias" value={fmt.pct(d.users.engagement7dPct)} hint={`${fmt.num(d.users.active7d)} pessoas`} tone="green" />
        <Stat label="MRR" value={fmt.money(d.financial.mrrCents)} hint={`ARR ${fmt.money(d.financial.arrCents)}`} tone="purple" />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="font-extrabold">Receita por mês</h2>
          <div className="mt-4 flex h-40 items-end gap-3">
            {months.length === 0 && <p className="text-sm text-muted">Sem pagamentos ainda.</p>}
            {months.map((m) => (
              <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-t-lg bg-amber/80" style={{ height: `${Math.max(4, (m.cents / maxMonth) * 100)}%` }} title={fmt.money(m.cents)} />
                <span className="text-[11px] text-dim">{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="font-extrabold">Público</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Colaboradores (B2B)</dt><dd className="font-bold">{fmt.num(d.users.collaborators)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Individuais (B2C)</dt><dd className="font-bold">{fmt.num(d.users.b2cOnly)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Premium B2C</dt><dd className="font-bold">{fmt.num(d.users.b2cPremium)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Conversão Premium</dt><dd className="font-bold text-amber">{fmt.pct(d.users.premiumConversionPct)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Assinaturas ativas</dt><dd className="font-bold">{fmt.num(d.financial.activeSubscriptions)}</dd></div>
          </dl>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-extrabold">Aprendizagem</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div><div className="text-muted">Matrículas</div><div className="text-xl font-extrabold">{fmt.num(d.learning.enrollments)}</div></div>
            <div><div className="text-muted">Conclusão</div><div className="text-xl font-extrabold text-green">{fmt.pct(d.learning.completionRatePct)}</div></div>
            <div><div className="text-muted">Certificados</div><div className="text-xl font-extrabold">{fmt.num(d.learning.certificatesTotal)}</div></div>
            <div><div className="text-muted">Aprovação nas provas</div><div className="text-xl font-extrabold">{fmt.pct(d.learning.examPassRatePct)}</div></div>
          </div>
        </Card>
        <Card>
          <h2 className="font-extrabold">Planetas mais estudados</h2>
          <ul className="mt-3 space-y-3">
            {d.rankings.topPlanets.slice(0, 5).map((p) => (
              <li key={p.planetId}>
                <div className="flex justify-between text-sm"><span className="font-bold">{p.name}</span><span className="text-muted">{fmt.num(p.enrollments)} matrículas · {fmt.pct(p.completionPct)}</span></div>
                <Progress value={p.completionPct} className="mt-1" color="var(--color-green)" />
              </li>
            ))}
            {d.rankings.topPlanets.length === 0 && <li className="text-sm text-muted">Nenhuma matrícula ainda.</li>}
          </ul>
          <p className="mt-4 text-xs text-dim">Conteúdo: {fmt.num(d.content.publishedCourses)} cursos publicados.</p>
        </Card>
      </section>
    </>
  );
}
