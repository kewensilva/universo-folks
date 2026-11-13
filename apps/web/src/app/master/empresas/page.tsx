'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmt, type Tenant } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { Seat } from '@/components/seat';
import { DataTable, FormGrid, Modal, NumberInput, Pagination, SearchBox, SelectInput, StatusPill, TextInput, opt, optNum, useAction } from '@/components/admin';

export default function EmpresasPage() {
  const { api } = useSession();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['master', 'tenants', search, type, status, page], queryFn: () => api.master.tenants({ search, type: type || undefined, status: status || undefined, page, pageSize: 25 }) });
  return (
    <>
      <PageTitle title="Empresas" subtitle="Clientes B2B e órgãos B2G. O Master define as cotas de colaboradores e de administradores de cada uma."
        actions={<Button onClick={() => setCreating(true)}>+ Nova empresa</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar por nome ou CNPJ…" />
        <select aria-label="Tipo" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm"><option value="">B2B e B2G</option><option value="B2B">B2B</option><option value="B2G">B2G</option></select>
        <select aria-label="Situação" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm"><option value="">Todas as situações</option><option value="ACTIVE">Ativas</option><option value="SUSPENDED">Suspensas</option><option value="CANCELED">Canceladas</option></select>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <DataTable rows={q.data!.items} rowKey={(t) => t.id} onRowClick={(t) => router.push(`/master/empresas/${t.id}`)} empty="Nenhuma empresa encontrada."
            columns={[
              { key: 'n', label: 'Empresa', render: (t: Tenant) => <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl text-xs font-extrabold" style={{ background: `${t.color ?? '#9b7bff'}33`, color: t.color ?? '#9b7bff' }}>{t.initials ?? t.tradeName.slice(0, 2)}</span><div><div className="font-bold">{t.tradeName}</div><div className="text-xs text-dim">{t.legalName}{t.planLabel ? ` · ${t.planLabel}` : ''}</div></div></div> },
              { key: 't', label: 'Tipo', render: (t) => t.type },
              { key: 's', label: 'Situação', render: (t) => <StatusPill status={t.status} label={t.status === 'ACTIVE' ? 'Ativa' : undefined} /> },
              { key: 'c', label: 'Colaboradores', className: 'w-40', render: (t) => <Seat used={t.seats.collaborators.used} max={t.seats.collaborators.max} /> },
              { key: 'a', label: 'Admins', className: 'w-32', render: (t) => <Seat used={t.seats.admins.used} max={t.seats.admins.max} /> },
              { key: 'j', label: 'Código', render: (t) => <span className="font-mono text-xs">{t.joinCode}</span> },
              { key: 'd', label: 'Desde', render: (t) => <span className="text-muted">{fmt.date(t.createdAt)}</span> },
            ]} />
          <Pagination page={q.data!.page} totalPages={q.data!.totalPages} total={q.data!.total} onPage={setPage} />
        </>
      )}
      <CreateTenant open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/master/empresas/${id}`)} />
    </>
  );
}

function CreateTenant({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { api } = useSession();
  const blank = { type: 'B2B', tradeName: '', legalName: '', document: '', contactName: '', contactEmail: '', contactPhone: '', planLabel: '', color: '#9b7bff', joinCode: '', maxCollaborators: 50 as number | '', maxAdmins: 2 as number | '', adminName: '', adminEmail: '' };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank) => (v: string | number | '') => setF({ ...f, [k]: v });
  const save = useAction(() => api.http.post<{ id: string; tenant?: { id: string } }>('/master/tenants', {
    type: f.type, tradeName: f.tradeName.trim(), legalName: f.legalName.trim() || f.tradeName.trim(), document: opt(f.document), contactName: opt(f.contactName), contactEmail: opt(f.contactEmail), contactPhone: opt(f.contactPhone),
    planLabel: opt(f.planLabel), color: f.color, joinCode: opt(f.joinCode.toUpperCase()),
    settings: { maxCollaborators: optNum(f.maxCollaborators), maxAdmins: optNum(f.maxAdmins) },
    admin: f.adminEmail ? { name: f.adminName.trim(), email: f.adminEmail.trim() } : undefined,
  }), { success: 'Empresa criada', invalidate: [['master', 'tenants'], ['dash']], onDone: (r) => { setF(blank); onClose(); onCreated(r.id ?? r.tenant!.id); } });
  const valid = f.tradeName.trim().length >= 2 && (!f.adminEmail || (f.adminName.trim().length >= 2 && /.+@.+\..+/.test(f.adminEmail)));
  return (
    <Modal open={open} title="Nova empresa" onClose={onClose} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>Criar empresa</Button></>}>
      <div className="flex flex-col gap-6">
        <section><h3 className="mb-3 font-extrabold">Dados</h3>
          <FormGrid>
            <TextInput label="Nome fantasia" required autoFocus value={f.tradeName} onChange={set('tradeName')} />
            <TextInput label="Razão social" value={f.legalName} onChange={set('legalName')} hint="Se vazio, usa o nome fantasia" />
            <SelectInput label="Tipo" value={f.type} onChange={set('type')} options={[{ value: 'B2B', label: 'Empresa (B2B)' }, { value: 'B2G', label: 'Órgão público (B2G)' }]} />
            <TextInput label="CNPJ" value={f.document} onChange={set('document')} />
            <TextInput label="Contato" value={f.contactName} onChange={set('contactName')} />
            <TextInput label="E-mail do contato" type="email" value={f.contactEmail} onChange={set('contactEmail')} />
            <TextInput label="Telefone" value={f.contactPhone} onChange={set('contactPhone')} />
            <TextInput label="Plano (rótulo)" value={f.planLabel} onChange={set('planLabel')} placeholder="Ex.: Anual" />
            <TextInput label="Código para entrar" value={f.joinCode} onChange={(v) => set('joinCode')(v.toUpperCase())} hint="Letras maiúsculas, números e hífen. Vazio = gerado." />
            <TextInput label="Cor" type="color" value={f.color} onChange={set('color')} />
          </FormGrid>
        </section>
        <section><h3 className="mb-3 font-extrabold">Cotas de licença</h3>
          <FormGrid>
            <NumberInput label="Limite de colaboradores" min={0} value={f.maxCollaborators} onChange={set('maxCollaborators')} />
            <NumberInput label="Limite de administradores" min={0} value={f.maxAdmins} onChange={set('maxAdmins')} />
          </FormGrid>
        </section>
        <section><h3 className="mb-1 font-extrabold">Primeiro administrador (opcional)</h3><p className="mb-3 text-xs text-dim">Recebe um convite por e-mail para criar a senha.</p>
          <FormGrid>
            <TextInput label="Nome" value={f.adminName} onChange={set('adminName')} />
            <TextInput label="E-mail" type="email" value={f.adminEmail} onChange={set('adminEmail')} />
          </FormGrid>
        </section>
      </div>
    </Modal>
  );
}
