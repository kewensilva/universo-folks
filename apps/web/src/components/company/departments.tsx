'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Loading } from '../ui';
import { DataTable, Modal, SelectInput, TextArea, TextInput, optEdit, useAction, useConfirm } from '../admin';
import type { Department } from './types';

export function useDepartments(tenantId: string) {
  const { api } = useSession();
  return useQuery({ queryKey: ['company', tenantId, 'departments'], queryFn: () => api.http.get<Department[]>(`/companies/${tenantId}/departments`) });
}

/** Departamentos/setores da empresa (cada colaborador pode estar em um ou mais). */
export function CompanyDepartments({ tenantId }: { tenantId: string }) {
  const { api } = useSession();
  const q = useDepartments(tenantId);
  const [edit, setEdit] = useState<Partial<Department> | null>(null);
  const [ask, confirmNode] = useConfirm();
  const key = [['company', tenantId]];
  const save = useAction((d: Partial<Department>) => {
    const body = { name: d.name?.trim(), description: optEdit(d.description ?? '', !!d.id), parentId: d.parentId || (d.id ? null : undefined) };
    return d.id ? api.http.patch(`/companies/${tenantId}/departments/${d.id}`, body) : api.http.post(`/companies/${tenantId}/departments`, body);
  }, { success: 'Departamento salvo', invalidate: key, onDone: () => setEdit(null) });
  const remove = useAction((id: string) => api.http.del(`/companies/${tenantId}/departments/${id}`), { success: 'Departamento removido', invalidate: key });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const list = q.data!;
  const parentName = (id?: string | null) => list.find((d) => d.id === id)?.name;
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setEdit({ name: '' })}>+ Novo departamento</Button></div>
      <DataTable rows={list} rowKey={(d) => d.id} empty="Nenhum departamento ainda. Crie os setores da empresa para liberar planetas por setor." minWidth={560}
        columns={[
          { key: 'n', label: 'Departamento', render: (d) => <div><div className="font-bold">{d.name}</div>{d.description && <div className="text-xs text-dim">{d.description}</div>}</div> },
          { key: 'p', label: 'Dentro de', render: (d) => <span className="text-muted">{parentName(d.parentId) ?? '—'}</span> },
          { key: 'm', label: 'Pessoas', render: (d) => d.memberCount ?? 0 },
          { key: 'a', label: '', className: 'text-right', render: (d) => (
            <div className="flex justify-end gap-2">
              <button className="text-sm font-bold text-amber" onClick={() => setEdit(d)}>Editar</button>
              <button className="text-sm font-bold text-red" onClick={async () => { if (await ask({ title: 'Remover departamento?', text: `"${d.name}" será removido. As pessoas continuam na empresa, só saem deste setor.`, confirm: 'Remover', danger: true })) remove.mutate(d.id); }}>Remover</button>
            </div>
          ) },
        ]} />
      <Modal open={!!edit} title={edit?.id ? 'Editar departamento' : 'Novo departamento'} onClose={() => setEdit(null)}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button loading={save.isPending} disabled={!edit?.name || edit.name.trim().length < 2} onClick={() => edit && save.mutate(edit)}>Salvar</Button></>}>
        {edit && (
          <div className="flex flex-col gap-4">
            <TextInput label="Nome" required autoFocus value={edit.name ?? ''} onChange={(v) => setEdit({ ...edit, name: v })} />
            <TextArea label="Descrição" rows={2} value={edit.description ?? ''} onChange={(v) => setEdit({ ...edit, description: v })} />
            <SelectInput label="Dentro de (opcional)" value={edit.parentId ?? ''} placeholder="— nenhum —" onChange={(v) => setEdit({ ...edit, parentId: v || null })}
              options={list.filter((d) => d.id !== edit.id).map((d) => ({ value: d.id, label: d.name }))} />
          </div>
        )}
      </Modal>
      {confirmNode}
    </>
  );
}
