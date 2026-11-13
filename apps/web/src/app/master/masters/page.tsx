'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fmt, type Page } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { DataTable, Modal, StatusPill, TextInput, useAction, useConfirm } from '@/components/admin';

interface MasterRow { id: string; name: string; email: string; status: string; lastLoginAt?: string | null; createdAt: string }

/** Outros acessos MASTER. Um MASTER não pode excluir o próprio acesso (regra do cliente). */
export default function MastersPage() {
  const { api, user } = useSession();
  const [ask, node] = useConfirm();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const q = useQuery({ queryKey: ['master', 'masters'], queryFn: () => api.http.get<Page<MasterRow>>('/master/masters', { pageSize: 100 }) });
  const create = useAction(() => api.http.post('/master/masters', { name: f.name.trim(), email: f.email.trim(), password: f.password || undefined }), { success: 'Master criado', invalidate: [['master', 'masters']], onDone: () => { setF({ name: '', email: '', password: '' }); setOpen(false); } });
  const remove = useAction((id: string) => api.http.del(`/master/masters/${id}`), { success: 'Acesso Master removido', invalidate: [['master', 'masters']] });
  return (
    <>
      <PageTitle title="Masters" subtitle="Quem administra a plataforma inteira. Você não pode excluir o seu próprio acesso." actions={<Button onClick={() => setOpen(true)}>+ Novo Master</Button>} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <DataTable rows={q.data!.items} rowKey={(m) => m.id} minWidth={600}
          columns={[
            { key: 'n', label: 'Nome', render: (m) => <div><div className="font-bold">{m.name}{m.id === user?.id && <span className="ml-2 text-xs text-amber">(você)</span>}</div><div className="text-xs text-dim">{m.email}</div></div> },
            { key: 's', label: 'Acesso', render: (m) => <StatusPill status={m.status} /> },
            { key: 'l', label: 'Último acesso', render: (m) => fmt.relativeDays(m.lastLoginAt) },
            { key: 'c', label: 'Desde', render: (m) => fmt.date(m.createdAt) },
            { key: 'a', label: '', className: 'text-right', render: (m) => m.id === user?.id ? null : <button className="text-sm font-bold text-red" onClick={async () => { if (await ask({ title: 'Remover acesso Master?', text: `${m.name} deixa de ser Master. A conta continua existindo como usuário comum.`, confirm: 'Remover', danger: true })) remove.mutate(m.id); }}>Remover</button> },
          ]} />
      )}
      <Modal open={open} title="Novo Master" onClose={() => setOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={create.isPending} disabled={f.name.trim().length < 2 || !/.+@.+\..+/.test(f.email)} onClick={() => create.mutate(undefined)}>Criar</Button></>}>
        <div className="flex flex-col gap-4">
          <TextInput label="Nome" required autoFocus value={f.name} onChange={(v) => setF({ ...f, name: v })} />
          <TextInput label="E-mail" type="email" required value={f.email} onChange={(v) => setF({ ...f, email: v })} />
          <TextInput label="Senha inicial" type="password" value={f.password} onChange={(v) => setF({ ...f, password: v })} hint="Obrigatória para quem ainda não tem conta (mín. 8, com letra e número). Peça para trocar no primeiro acesso." />
        </div>
      </Modal>
      {node}
    </>
  );
}
