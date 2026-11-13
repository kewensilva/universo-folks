'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { fmt, type Seats } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Loading, PageTitle, Stat } from '@/components/ui';
import { DataTable, FormGrid, Modal, NumberInput, SelectInput, StatusPill, Tabs, TextInput, Toggle, opt, optEdit, useAction } from '@/components/admin';
import { INTERVAL_LABEL, PaymentsTable, usePlanTiers, usePlans, type Plan } from '@/components/master/billing';
import { Seat } from '@/components/seat';

interface ClientFin { tenantId: string; name: string; type: string; status: string; seats: { collaborators: Seats; admins: Seats }; contractEnd?: string | null; mrrCents: number; totalPaidCents: number; pendingCents: number; lastPaymentAt?: string | null }
type Tab = 'clientes' | 'pagamentos' | 'planos';

/** Financeiro de todos os clientes: MRR por empresa, pagamentos (Asaas, lojas e manuais) e planos. */
export default function FinanceiroPage() {
  const [tab, setTab] = useState<Tab>('clientes');
  return (
    <>
      <PageTitle title="Financeiro" subtitle="Receita por cliente, pagamentos e preços (o que cada plano libera fica no menu Planos). Premium nas lojas via RevenueCat; web e empresas via Asaas." />
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'clientes', label: 'Por empresa' }, { key: 'pagamentos', label: 'Pagamentos' }, { key: 'planos', label: 'Preços' }]} />
      {tab === 'clientes' && <Clientes />}
      {tab === 'pagamentos' && <PaymentsTable />}
      {tab === 'planos' && <Planos />}
    </>
  );
}

function Clientes() {
  const { api } = useSession();
  const q = useQuery({ queryKey: ['master', 'fin-by-client'], queryFn: () => api.http.get<ClientFin[]>('/dashboards/master/financial-by-client') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data!;
  const sum = (k: 'mrrCents' | 'totalPaidCents' | 'pendingCents') => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="MRR das empresas" value={fmt.money(sum('mrrCents'))} tone="purple" />
        <Stat label="Recebido (total)" value={fmt.money(sum('totalPaidCents'))} tone="green" />
        <Stat label="Pendente" value={fmt.money(sum('pendingCents'))} tone="red" />
      </div>
      <DataTable rows={rows} rowKey={(r) => r.tenantId} empty="Nenhuma empresa ainda."
        columns={[
          { key: 'n', label: 'Empresa', render: (r) => <Link href={`/master/empresas/${r.tenantId}`} className="font-bold hover:text-amber">{r.name}</Link> },
          { key: 's', label: 'Situação', render: (r) => <StatusPill status={r.status} label={r.status === 'ACTIVE' ? 'Ativa' : undefined} /> },
          { key: 'l', label: 'Licenças', className: 'w-36', render: (r) => <Seat used={r.seats.collaborators.used} max={r.seats.collaborators.max} /> },
          { key: 'm', label: 'MRR', className: 'text-right', render: (r) => <b>{fmt.money(r.mrrCents)}</b> },
          { key: 'p', label: 'Recebido', className: 'text-right', render: (r) => fmt.money(r.totalPaidCents) },
          { key: 'x', label: 'Pendente', className: 'text-right', render: (r) => r.pendingCents ? <span className="font-bold text-red">{fmt.money(r.pendingCents)}</span> : '—' },
          { key: 'u', label: 'Último pagamento', render: (r) => fmt.date(r.lastPaymentAt) },
          { key: 'c', label: 'Fim do contrato', render: (r) => fmt.dateOnly(r.contractEnd) },
        ]} />
    </>
  );
}

const blank = { code: '', name: '', description: '', audience: 'B2C', interval: 'MONTHLY', price: '', trialDays: 0 as number | '', isActive: true, appleProductId: '', googleProductId: '', webPriceId: '', tierId: '' };
function Planos() {
  const { api } = useSession();
  const q = usePlans();
  const tiers = usePlanTiers();
  const [f, setF] = useState<(typeof blank & { id?: string }) | null>(null);
  const save = useAction(() => {
    const body = { code: f!.code.trim(), name: f!.name.trim(), description: optEdit(f!.description, !!f!.id), audience: f!.audience, interval: f!.interval, priceCents: Math.round(Number(f!.price.replace(/\./g, '').replace(',', '.')) * 100), currency: 'BRL', trialDays: f!.trialDays === '' ? 0 : f!.trialDays, isActive: f!.isActive, appleProductId: opt(f!.appleProductId) ?? null, googleProductId: opt(f!.googleProductId) ?? null, webPriceId: opt(f!.webPriceId) ?? null, tierId: f!.audience === 'B2C' ? f!.tierId || null : null };
    return f!.id ? api.http.put(`/master/billing/plans/${f!.id}`, body) : api.http.post('/master/billing/plans', body);
  }, { success: 'Preço salvo', invalidate: [['master', 'plans'], ['master', 'plan-tiers']], onDone: () => setF(null) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const valid = f && f.code.trim().length >= 2 && f.name.trim().length >= 2 && Number(f.price.replace(/\./g, '').replace(',', '.')) >= 0 && f.price !== '';
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setF({ ...blank })}>+ Novo preço</Button></div>
      <DataTable rows={q.data!} rowKey={(p) => p.id} onRowClick={(p: Plan) => setF({ id: p.id, code: p.code, name: p.name, description: p.description ?? '', audience: p.audience, interval: p.interval, price: (p.priceCents / 100).toFixed(2).replace('.', ','), trialDays: p.trialDays, isActive: p.isActive, appleProductId: p.appleProductId ?? '', googleProductId: p.googleProductId ?? '', webPriceId: p.webPriceId ?? '', tierId: p.tierId ?? '' })}
        columns={[
          { key: 'n', label: 'Preço', render: (p) => <div><div className="font-bold">{p.name}</div><div className="font-mono text-xs text-dim">{p.code}</div></div> },
          { key: 'a', label: 'Público', render: (p) => p.audience },
          { key: 'l', label: 'Libera', render: (p) => p.audience !== 'B2C' ? <span className="text-dim">—</span> : p.tier ? <b>{p.tier.name}</b> : <span className="text-amber" title="Sem plano de acesso: libera todas as galáxias">⚠ Tudo (sem plano)</span> },
          { key: 'i', label: 'Ciclo', render: (p) => INTERVAL_LABEL[p.interval] },
          { key: 'v', label: 'Preço', className: 'text-right', render: (p) => <b>{fmt.money(p.priceCents, p.currency)}</b> },
          { key: 't', label: 'Teste grátis', render: (p) => p.trialDays ? `${p.trialDays} dias` : '—' },
          { key: 's', label: 'Assinaturas', render: (p) => p._count?.subscriptions ?? 0 },
          { key: 'x', label: 'Situação', render: (p) => <StatusPill status={p.isActive ? 'ACTIVE' : 'DISABLED'} label={p.isActive ? 'À venda' : 'Fora de venda'} /> },
        ]} />
      <Modal open={!!f} title={f?.id ? 'Editar preço' : 'Novo preço'} onClose={() => setF(null)} wide
        footer={<><Button variant="ghost" onClick={() => setF(null)}>Cancelar</Button><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>Salvar</Button></>}>
        {f && (
          <div className="flex flex-col gap-4">
            <FormGrid>
              <TextInput label="Nome" required value={f.name} onChange={(v) => setF({ ...f, name: v })} />
              <TextInput label="Código" required value={f.code} onChange={(v) => setF({ ...f, code: v })} hint="Ex.: b2c-premium-monthly" />
              <SelectInput label="Público" value={f.audience} onChange={(v) => setF({ ...f, audience: v })} options={[{ value: 'B2C', label: 'Aluno (B2C)' }, { value: 'B2B', label: 'Empresa (B2B)' }, { value: 'B2G', label: 'Governo (B2G)' }]} />
              <SelectInput label="Ciclo" value={f.interval} onChange={(v) => setF({ ...f, interval: v })} options={Object.entries(INTERVAL_LABEL).map(([value, label]) => ({ value, label }))} />
              {f.audience === 'B2C' && (
                <SelectInput label="Plano que este preço libera" value={f.tierId} onChange={(v) => setF({ ...f, tierId: v })}
                  options={[{ value: '', label: 'Nenhum (libera todas as galáxias)' }, ...(tiers.data ?? []).filter((t) => !t.isDefault).map((t) => ({ value: t.id, label: t.name }))]}
                  hint="Galáxias de cada plano: menu Planos." />
              )}
              <TextInput label="Preço (R$)" required value={f.price} onChange={(v) => setF({ ...f, price: v })} placeholder="29,90" />
              <NumberInput label="Dias de teste grátis" min={0} value={f.trialDays} onChange={(v) => setF({ ...f, trialDays: v })} />
              <TextInput label="Produto na App Store" value={f.appleProductId} onChange={(v) => setF({ ...f, appleProductId: v })} />
              <TextInput label="Produto no Google Play" value={f.googleProductId} onChange={(v) => setF({ ...f, googleProductId: v })} />
            </FormGrid>
            <TextInput label="Descrição" value={f.description} onChange={(v) => setF({ ...f, description: v })} />
            <Toggle label="À venda" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
          </div>
        )}
      </Modal>
    </>
  );
}
