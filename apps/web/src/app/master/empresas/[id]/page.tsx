'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { FormGrid, SectionTitle, SelectInput, StatusPill, Tabs, TextInput, opt, useAction, useConfirm } from '@/components/admin';

const clear = (v: string) => opt(v) ?? null;
import { CompanyDashboard } from '@/components/company/dashboard';
import { CompanyPeople } from '@/components/company/people';
import { CompanyDepartments } from '@/components/company/departments';
import { CompanyPlanets } from '@/components/company/planets';
import { CompanyAssignments } from '@/components/company/assignments';
import { CompanyEngagement } from '@/components/company/engagement';
import { CompanySettings } from '@/components/company/settings';
import { AsaasContractModal, GrantModal, PaymentsTable, RecordPaymentModal, SubscriptionsTable, type Subscription } from '@/components/master/billing';

interface TenantDetail {
  id: string; type: 'B2B' | 'B2G'; legalName: string; tradeName: string; document?: string | null; joinCode: string; status: string;
  contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; initials?: string | null; color?: string | null; planLabel?: string | null; asaasCustomerId?: string | null;
  subscriptions: Subscription[]; _count?: { memberships: number };
}

type Tab = 'painel' | 'pessoas' | 'departamentos' | 'planetas' | 'trilhas' | 'engajamento' | 'regras' | 'financeiro' | 'dados';

/** Gestão completa de uma empresa pelo MASTER (inclui tudo que o ADMIN dela faz, mais cotas, contrato e financeiro). */
export default function EmpresaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { api } = useSession();
  const [tab, setTab] = useState<Tab>('painel');
  const q = useQuery({ queryKey: ['master', 'tenant', id], queryFn: () => api.http.get<TenantDetail>(`/master/tenants/${id}`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const t = q.data!;
  return (
    <>
      <PageTitle back={{ href: '/master/empresas', label: 'Empresas' }} title={t.tradeName}
        subtitle={<span className="flex flex-wrap items-center gap-2">{t.legalName} · {t.type} · <StatusPill status={t.status} label={t.status === 'ACTIVE' ? 'Ativa' : undefined} /> · código <b className="font-mono text-amber">{t.joinCode}</b></span>} />
      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'painel', label: 'Painel' }, { key: 'pessoas', label: 'Pessoas', count: t._count?.memberships }, { key: 'departamentos', label: 'Departamentos' },
        { key: 'planetas', label: 'Planetas' }, { key: 'trilhas', label: 'Trilhas' }, { key: 'engajamento', label: 'Engajamento' },
        { key: 'regras', label: 'Cotas e regras' }, { key: 'financeiro', label: 'Financeiro' }, { key: 'dados', label: 'Dados da empresa' },
      ]} />
      {tab === 'painel' && <CompanyDashboard tenantId={id} title="Painel da empresa" />}
      {tab === 'pessoas' && <CompanyPeople tenantId={id} />}
      {tab === 'departamentos' && <CompanyDepartments tenantId={id} />}
      {tab === 'planetas' && <CompanyPlanets tenantId={id} />}
      {tab === 'trilhas' && <CompanyAssignments tenantId={id} />}
      {tab === 'engajamento' && <CompanyEngagement tenantId={id} />}
      {tab === 'regras' && <CompanySettings tenantId={id} variant="master" />}
      {tab === 'financeiro' && <Financeiro t={t} />}
      {tab === 'dados' && <Dados t={t} />}
    </>
  );
}

function Financeiro({ t }: { t: TenantDetail }) {
  const [grant, setGrant] = useState(false);
  const [pay, setPay] = useState(false);
  const [asaas, setAsaas] = useState(false);
  const key = [['master', 'tenant', t.id], ['master', 'payments'], ['master', 'tenants'], ['company', t.id]];
  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle actions={<div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => setAsaas(true)}>Contrato no Asaas</Button><Button onClick={() => setGrant(true)}>Conceder assinatura</Button></div>}>Assinaturas e contrato</SectionTitle>
        <SubscriptionsTable subscriptions={t.subscriptions} invalidate={key} />
        {t.asaasCustomerId && <p className="mt-2 text-xs text-dim">Cliente no Asaas: {t.asaasCustomerId}</p>}
      </section>
      <section>
        <SectionTitle actions={<Button variant="ghost" onClick={() => setPay(true)}>Lançar pagamento</Button>}>Pagamentos</SectionTitle>
        <PaymentsTable tenantId={t.id} />
      </section>
      <GrantModal open={grant} onClose={() => setGrant(false)} target={{ tenantId: t.id, label: t.tradeName }} invalidate={key} />
      <RecordPaymentModal open={pay} onClose={() => setPay(false)} target={{ tenantId: t.id, label: t.tradeName }} invalidate={key} />
      <AsaasContractModal open={asaas} onClose={() => setAsaas(false)} tenantId={t.id} label={t.tradeName} invalidate={key} />
    </div>
  );
}

function Dados({ t }: { t: TenantDetail }) {
  const { api } = useSession();
  const router = useRouter();
  const [ask, node] = useConfirm();
  const [f, setF] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preenche o formulário com os dados atuais
    setF({ tradeName: t.tradeName, legalName: t.legalName, type: t.type, document: t.document ?? '', contactName: t.contactName ?? '', contactEmail: t.contactEmail ?? '', contactPhone: t.contactPhone ?? '', planLabel: t.planLabel ?? '', initials: t.initials ?? '', color: t.color ?? '#9b7bff', joinCode: t.joinCode });
  }, [t]);
  const key = [['master', 'tenant', t.id], ['master', 'tenants']];
  const save = useAction(() => api.http.patch(`/master/tenants/${t.id}`, {
    // campo apagado vai como null para limpar no banco (undefined manteria o valor antigo)
    tradeName: f!.tradeName.trim(), legalName: f!.legalName.trim(), type: f!.type, document: clear(f!.document), contactName: clear(f!.contactName), contactEmail: clear(f!.contactEmail),
    contactPhone: clear(f!.contactPhone), planLabel: clear(f!.planLabel), initials: clear(f!.initials), color: f!.color, joinCode: f!.joinCode !== t.joinCode ? f!.joinCode.toUpperCase() : undefined,
  }), { success: 'Dados salvos', invalidate: key });
  const status = useAction((s: string) => api.http.patch(`/master/tenants/${t.id}`, { status: s }), { success: 'Situação atualizada', invalidate: key });
  const newCode = useAction(() => api.http.post<{ joinCode: string }>(`/master/tenants/${t.id}/join-code`), { success: (r) => `Novo código: ${r.joinCode}`, invalidate: key });
  const remove = useAction(() => api.http.del(`/master/tenants/${t.id}`), { success: 'Empresa encerrada', invalidate: [['master', 'tenants'], ['dash']], onDone: () => router.replace('/master/empresas') });
  if (!f) return <Loading />;
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <SectionTitle>Dados cadastrais</SectionTitle>
        <FormGrid>
          <TextInput label="Nome fantasia" required value={f.tradeName} onChange={set('tradeName')} />
          <TextInput label="Razão social" required value={f.legalName} onChange={set('legalName')} />
          <SelectInput label="Tipo" value={f.type} onChange={set('type')} options={[{ value: 'B2B', label: 'Empresa (B2B)' }, { value: 'B2G', label: 'Órgão público (B2G)' }]} />
          <TextInput label="CNPJ" value={f.document} onChange={set('document')} />
          <TextInput label="Contato" value={f.contactName} onChange={set('contactName')} />
          <TextInput label="E-mail do contato" type="email" value={f.contactEmail} onChange={set('contactEmail')} />
          <TextInput label="Telefone" value={f.contactPhone} onChange={set('contactPhone')} />
          <TextInput label="Plano (rótulo)" value={f.planLabel} onChange={set('planLabel')} />
          <TextInput label="Sigla" value={f.initials} onChange={set('initials')} />
          <TextInput label="Cor" type="color" value={f.color} onChange={set('color')} />
          <TextInput label="Código para entrar" value={f.joinCode} onChange={(v) => set('joinCode')(v.toUpperCase())} hint="Letras maiúsculas, números e hífen" />
        </FormGrid>
        <div className="mt-5 flex justify-end"><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Salvar dados</Button></div>
      </Card>
      <Card className="flex flex-col gap-3 self-start">
        <SectionTitle>Ações</SectionTitle>
        <Button variant="ghost" loading={newCode.isPending} onClick={async () => { if (await ask({ title: 'Gerar novo código?', text: 'O código atual deixa de funcionar para novas entradas.', confirm: 'Gerar' })) newCode.mutate(undefined); }}>Gerar novo código de entrada</Button>
        {t.status === 'ACTIVE'
          ? <Button variant="ghost" className="text-red" loading={status.isPending} onClick={async () => { if (await ask({ title: 'Suspender empresa?', text: 'Ninguém da empresa consegue entrar até reativar. Nada é apagado.', confirm: 'Suspender', danger: true })) status.mutate('SUSPENDED'); }}>Suspender acesso</Button>
          : <Button variant="ghost" loading={status.isPending} onClick={() => status.mutate('ACTIVE')}>Reativar empresa</Button>}
        <Button variant="danger" loading={remove.isPending} onClick={async () => { if (await ask({ title: 'Encerrar empresa?', text: <>A empresa <b>{t.tradeName}</b> é encerrada, todos os vínculos ficam desativados e as licenças são liberadas. O histórico de aprendizagem e o financeiro ficam guardados.</>, confirm: 'Encerrar empresa', danger: true })) remove.mutate(undefined); }}>Encerrar empresa</Button>
      </Card>
      {node}
    </div>
  );
}
