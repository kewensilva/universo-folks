'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Loading } from '../ui';
import { DataTable, FormGrid, Modal, NumberInput, SelectInput, StatusPill, TextInput, opt, optNum, useAction, useConfirm } from '../admin';

/** Formatos das rotas /master/billing/* (respostas reais). */
export interface Plan { id: string; code: string; name: string; description?: string | null; audience: 'B2C' | 'B2B' | 'B2G'; interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME'; priceCents: number; currency: string; trialDays: number; isActive: boolean; appleProductId?: string | null; googleProductId?: string | null; webPriceId?: string | null; tierId?: string | null; tier?: { id: string; code: string; name: string } | null; _count?: { subscriptions: number } }
/** Plano de acesso do aluno (menu Planos): Básico, Premium, Premium Plus. */
export interface PlanTier {
  id: string; code: string; name: string; description?: string | null; isDefault: boolean; includesAllCategories: boolean; isActive: boolean; sortOrder: number;
  categories: Array<{ id: string; slug: string; name: string }>;
  plans: Array<Pick<Plan, 'id' | 'code' | 'name' | 'audience' | 'interval' | 'priceCents' | 'currency' | 'isActive'>>;
  activeSubscriptions: number;
}
export interface Payment { id: string; amountCents: number; currency: string; status: string; provider: string; description?: string | null; paidAt?: string | null; createdAt: string; tenant?: { tradeName?: string; name?: string } | null; user?: { name: string; email: string } | null }
export interface Subscription { id: string; status: string; provider: string; seats?: number | null; amountCents?: number | null; currentPeriodEnd: string; cancelAtPeriodEnd?: boolean; plan?: { name: string; audience?: string } }

export const INTERVAL_LABEL: Record<string, string> = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', YEARLY: 'Anual', ONE_TIME: 'Único' };
export const PROVIDER_LABEL: Record<string, string> = { ASAAS: 'Asaas', REVENUECAT: 'Lojas (RevenueCat)', MANUAL: 'Manual', APPLE: 'Apple', GOOGLE: 'Google', WEB: 'Web' };

export const PER_INTERVAL: Record<string, string> = { MONTHLY: '/mês', QUARTERLY: '/trimestre', YEARLY: '/ano', ONE_TIME: '' };

export function usePlanTiers() {
  const { api } = useSession();
  return useQuery({ queryKey: ['master', 'plan-tiers'], queryFn: () => api.http.get<PlanTier[]>('/master/plan-tiers') });
}

export function usePlans() {
  const { api } = useSession();
  return useQuery({ queryKey: ['master', 'plans'], queryFn: () => api.http.get<Plan[]>('/master/billing/plans') });
}

export function PaymentsTable({ tenantId, userId }: { tenantId?: string; userId?: string }) {
  const { api } = useSession();
  const q = useQuery({ queryKey: ['master', 'payments', tenantId, userId], queryFn: () => api.http.get<Payment[]>('/master/billing/payments', { tenantId, userId }) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  return (
    <DataTable rows={q.data!} rowKey={(p) => p.id} empty="Nenhum pagamento registrado." minWidth={640}
      columns={[
        { key: 'd', label: 'Data', render: (p) => fmt.date(p.paidAt ?? p.createdAt) },
        { key: 'c', label: 'Cliente', render: (p) => <span>{p.tenant?.tradeName ?? p.tenant?.name ?? p.user?.name ?? '—'}{p.user?.email ? <span className="block text-xs text-dim">{p.user.email}</span> : null}</span> },
        { key: 'x', label: 'Descrição', render: (p) => <span className="text-muted">{p.description ?? '—'}</span> },
        { key: 'o', label: 'Origem', render: (p) => PROVIDER_LABEL[p.provider] ?? p.provider },
        { key: 'v', label: 'Valor', className: 'text-right', render: (p) => <b>{fmt.money(p.amountCents, p.currency)}</b> },
        { key: 's', label: 'Situação', render: (p) => <StatusPill status={p.status} /> },
      ]} />
  );
}

export function SubscriptionsTable({ subscriptions, invalidate }: { subscriptions: Subscription[]; invalidate: unknown[][] }) {
  const { api } = useSession();
  const [ask, node] = useConfirm();
  const cancel = useAction((id: string) => api.http.post(`/master/billing/subscriptions/${id}/cancel`), { success: 'Assinatura cancelada ao fim do período', invalidate });
  return (
    <>
      <DataTable rows={subscriptions} rowKey={(s) => s.id} empty="Nenhuma assinatura ativa." minWidth={600}
        columns={[
          { key: 'p', label: 'Preço', render: (s) => <b>{s.plan?.name ?? '—'}</b> },
          { key: 'o', label: 'Origem', render: (s) => PROVIDER_LABEL[s.provider] ?? s.provider },
          { key: 's', label: 'Situação', render: (s) => <StatusPill status={s.status} /> },
          { key: 'f', label: 'Vale até', render: (s) => <span>{fmt.date(s.currentPeriodEnd)}{s.cancelAtPeriodEnd ? <span className="block text-xs text-red">não renova</span> : null}</span> },
          { key: 'v', label: 'Valor', render: (s) => s.amountCents != null ? fmt.money(s.amountCents) : '—' },
          { key: 'a', label: '', className: 'text-right', render: (s) => !s.cancelAtPeriodEnd && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(s.status) ? <button className="text-sm font-bold text-red" onClick={async () => { if (await ask({ title: 'Cancelar assinatura?', text: 'Ela não renova e termina no fim do período atual.', confirm: 'Cancelar assinatura', danger: true })) cancel.mutate(s.id); }}>Cancelar</button> : null },
        ]} />
      {node}
    </>
  );
}

/** Conceder assinatura manual (Premium para aluno, contrato para empresa). */
export function GrantModal({ open, onClose, target, invalidate }: { open: boolean; onClose: () => void; target: { userId?: string; tenantId?: string; label: string }; invalidate: unknown[][] }) {
  const { api } = useSession();
  const plans = usePlans();
  const audience = target.tenantId ? ['B2B', 'B2G'] : ['B2C'];
  const [f, setF] = useState({ planId: '', periodEnd: '', seats: '' as number | '', adminSeats: '' as number | '', amount: '' });
  const save = useAction(() => api.http.post('/master/billing/subscriptions', {
    userId: target.userId, tenantId: target.tenantId, planId: f.planId,
    periodEnd: f.periodEnd ? new Date(`${f.periodEnd}T23:59:59-03:00`).toISOString() : undefined,
    seats: optNum(f.seats), adminSeats: optNum(f.adminSeats),
    amountCents: f.amount ? Math.round(Number(f.amount.replace(/\./g, '').replace(',', '.')) * 100) : undefined,
  }), { success: 'Assinatura concedida', invalidate, onDone: () => { setF({ planId: '', periodEnd: '', seats: '', adminSeats: '', amount: '' }); onClose(); } });
  return (
    <Modal open={open} title={`Conceder assinatura · ${target.label}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!f.planId} onClick={() => save.mutate(undefined)}>Conceder</Button></>}>
      <div className="flex flex-col gap-4">
        <SelectInput label="Plano" value={f.planId} placeholder="Escolha o plano" onChange={(v) => setF({ ...f, planId: v })}
          options={(plans.data ?? []).filter((p) => audience.includes(p.audience)).map((p) => ({ value: p.id, label: `${p.name} · ${fmt.money(p.priceCents)} ${INTERVAL_LABEL[p.interval].toLowerCase()}${p.isActive ? '' : ' (fora de venda)'}` }))}
          hint="Concessão manual pode usar plano fora de venda (ex.: cortesia, contrato negociado)." />
        <TextInput label="Vale até" type="date" value={f.periodEnd} onChange={(v) => setF({ ...f, periodEnd: v })} hint="Vazio = um ciclo do plano a partir de hoje" />
        {target.tenantId && (
          <FormGrid>
            <NumberInput label="Licenças de colaborador" min={1} value={f.seats} onChange={(v) => setF({ ...f, seats: v })} hint="Atualiza a cota da empresa" />
            <NumberInput label="Licenças de administrador" min={1} value={f.adminSeats} onChange={(v) => setF({ ...f, adminSeats: v })} />
            <TextInput label="Valor do contrato por ciclo (R$)" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} hint="Quando difere do preço do plano" />
          </FormGrid>
        )}
      </div>
    </Modal>
  );
}

/** Lançar pagamento recebido fora do Asaas/lojas (transferência, NF...). */
export function RecordPaymentModal({ open, onClose, target, invalidate }: { open: boolean; onClose: () => void; target: { userId?: string; tenantId?: string; label: string }; invalidate: unknown[][] }) {
  const { api } = useSession();
  const [f, setF] = useState({ amount: '', description: '', paidAt: new Date().toISOString().slice(0, 10), status: 'PAID' });
  const cents = Math.round(Number(f.amount.replace(/\./g, '').replace(',', '.')) * 100);
  const save = useAction(() => api.http.post('/master/billing/payments', { userId: target.userId, tenantId: target.tenantId, amountCents: cents, description: opt(f.description), paidAt: new Date(`${f.paidAt}T12:00:00-03:00`).toISOString(), status: f.status }),
    { success: 'Pagamento lançado', invalidate, onDone: () => { setF({ amount: '', description: '', paidAt: new Date().toISOString().slice(0, 10), status: 'PAID' }); onClose(); } });
  return (
    <Modal open={open} title={`Lançar pagamento · ${target.label}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!(cents > 0)} onClick={() => save.mutate(undefined)}>Lançar</Button></>}>
      <div className="flex flex-col gap-4">
        <FormGrid>
          <TextInput label="Valor (R$)" required value={f.amount} onChange={(v) => setF({ ...f, amount: v })} placeholder="1.500,00" />
          <TextInput label="Data" type="date" value={f.paidAt} onChange={(v) => setF({ ...f, paidAt: v })} />
        </FormGrid>
        <SelectInput label="Situação" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: 'PAID', label: 'Pago' }, { value: 'PENDING', label: 'Pendente' }]} />
        <TextInput label="Descrição" value={f.description} onChange={(v) => setF({ ...f, description: v })} placeholder="Ex.: Mensalidade de novembro (NF 123)" />
      </div>
    </Modal>
  );
}

/** Contrato recorrente no Asaas (boleto/Pix/cartão) para a empresa. */
export function AsaasContractModal({ open, onClose, tenantId, label, invalidate }: { open: boolean; onClose: () => void; tenantId: string; label: string; invalidate: unknown[][] }) {
  const { api } = useSession();
  const plans = usePlans();
  const [f, setF] = useState({ planId: '', value: '', seats: '' as number | '', adminSeats: '' as number | '', billingType: 'BOLETO', nextDueDate: '', description: '' });
  const save = useAction(() => api.http.post(`/master/billing/tenants/${tenantId}/asaas-contract`, {
    planId: f.planId, valueCents: f.value ? Math.round(Number(f.value.replace(/\./g, '').replace(',', '.')) * 100) : undefined,
    seats: optNum(f.seats), adminSeats: optNum(f.adminSeats), billingType: f.billingType, nextDueDate: opt(f.nextDueDate), description: opt(f.description),
  }), { success: 'Contrato criado no Asaas', invalidate, onDone: onClose });
  return (
    <Modal open={open} title={`Contrato no Asaas · ${label}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!f.planId} onClick={() => save.mutate(undefined)}>Criar contrato</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">Cria a assinatura recorrente no Asaas. Exige a chave do Asaas configurada no servidor; sem ela, a API avisa.</p>
        <SelectInput label="Plano" value={f.planId} placeholder="Escolha" onChange={(v) => setF({ ...f, planId: v })} options={(plans.data ?? []).filter((p) => p.audience !== 'B2C').map((p) => ({ value: p.id, label: `${p.name} · ${fmt.money(p.priceCents)}${p.isActive ? '' : ' (fora de venda)'}` }))} />
        <FormGrid>
          <TextInput label="Valor por ciclo (R$)" value={f.value} onChange={(v) => setF({ ...f, value: v })} hint="Vazio = preço do plano" />
          <SelectInput label="Forma de cobrança" value={f.billingType} onChange={(v) => setF({ ...f, billingType: v })} options={[{ value: 'BOLETO', label: 'Boleto' }, { value: 'PIX', label: 'Pix' }, { value: 'CREDIT_CARD', label: 'Cartão' }, { value: 'UNDEFINED', label: 'O cliente escolhe' }]} />
          <NumberInput label="Licenças de colaborador" min={1} value={f.seats} onChange={(v) => setF({ ...f, seats: v })} />
          <NumberInput label="Licenças de administrador" min={1} value={f.adminSeats} onChange={(v) => setF({ ...f, adminSeats: v })} />
          <TextInput label="Primeiro vencimento" type="date" value={f.nextDueDate} onChange={(v) => setF({ ...f, nextDueDate: v })} />
          <TextInput label="Descrição" value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        </FormGrid>
      </div>
    </Modal>
  );
}
