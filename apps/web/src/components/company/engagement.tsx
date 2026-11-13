'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading } from '../ui';
import { SectionTitle, Tabs, saveBlob, useToast } from '../admin';
import type { EngagementPoint } from './types';

/** Engajamento = pessoa que fez pelo menos uma atividade no dia (fuso de São Paulo). Visão semanal e mensal. */
export function CompanyEngagement({ tenantId }: { tenantId: string }) {
  const { api } = useSession();
  const toast = useToast();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const q = useQuery({ queryKey: ['company', tenantId, 'engagement', mode], queryFn: () => api.http.get<EngagementPoint[]>(`/companies/${tenantId}/engagement`, { mode }) });
  const [busy, setBusy] = useState(false);
  async function csv() {
    setBusy(true);
    try { saveBlob(await api.download(`/companies/${tenantId}/report.csv`), `relatorio-folks-${new Date().toISOString().slice(0, 10)}.csv`); toast('Relatório baixado'); }
    catch { toast('Não foi possível gerar o relatório', 'error'); } finally { setBusy(false); }
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={[{ key: 'week', label: 'Por semana' }, { key: 'month', label: 'Por mês' }]} active={mode} onChange={setMode} />
        <Button variant="ghost" loading={busy} onClick={csv}>Baixar relatório (CSV para Excel)</Button>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <Card>
          <SectionTitle>Engajamento diário médio</SectionTitle>
          <div className="flex h-56 items-end gap-3">
            {q.data!.map((p) => (
              <div key={p.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${p.label}: ${fmt.pct(p.ratePct)} (${p.daily} de ${p.users} pessoas por dia; ${p.unique} diferentes)`}>
                <span className="text-xs font-bold text-muted">{fmt.pct(p.ratePct)}</span>
                <div className="w-full rounded-t-lg bg-green/80" style={{ height: `${Math.max(3, p.ratePct)}%` }} />
                <span className="text-[11px] text-dim">{p.label}</span>
              </div>
            ))}
          </div>
          <table className="mt-6 w-full text-sm">
            <thead className="text-left text-xs uppercase text-dim"><tr><th className="py-2">Período</th><th>Média por dia</th><th>Pessoas diferentes</th><th>Equipe</th></tr></thead>
            <tbody>{q.data!.map((p) => <tr key={p.start} className="border-t border-line/60"><td className="py-2 font-bold">{p.label}</td><td>{p.daily}</td><td>{p.unique}</td><td>{p.users}</td></tr>)}</tbody>
          </table>
        </Card>
      )}
    </>
  );
}
