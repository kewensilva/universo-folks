'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { Button } from '../ui';
import { FormGrid, Modal, NumberInput, SelectInput, TextArea, TextInput, Toggle, opt, optEdit, useAction } from '../admin';
import { STATUS_OPTIONS, type Category, type PlanetRow } from './content-types';

export function useCategories() {
  const { api } = useSession();
  return useQuery({ queryKey: ['master', 'categories'], queryFn: () => api.http.get<Category[]>('/master/content/categories') });
}


/** Criar/editar planeta (metadados). */
export function PlanetForm({ open, onClose, planet, onSaved }: { open: boolean; onClose: () => void; planet?: PlanetRow; onSaved?: (slug: string) => void }) {
  const { api } = useSession();
  const cats = useCategories();
  const init = () => ({ name: planet?.name ?? '', shortName: planet?.shortName ?? '', description: planet?.description ?? '', categoryId: planet?.categoryId ?? '', themeColor: planet?.themeColor ?? '#ffb020', accessTier: planet?.accessTier ?? 'PREMIUM', status: planet?.status ?? 'DRAFT', availableB2C: planet?.availableB2C ?? true, availableB2B: planet?.availableB2B ?? true, sortOrder: (planet?.sortOrder ?? '') as number | '' });
  const [f, setF] = useState(init);
  const save = useAction(() => {
    const body = { name: f.name.trim(), shortName: opt(f.shortName) ?? null, description: optEdit(f.description, !!planet), categoryId: f.categoryId || undefined, themeColor: f.themeColor, accessTier: f.accessTier, status: f.status, availableB2C: f.availableB2C, availableB2B: f.availableB2B, sortOrder: f.sortOrder === '' ? undefined : f.sortOrder };
    return planet ? api.http.patch<PlanetRow>(`/master/content/planets/${planet.id}`, body) : api.http.post<PlanetRow>('/master/content/planets', body);
  }, { success: 'Planeta salvo', invalidate: [['master', 'planets'], ['master', 'tree'], ['catalog']], onDone: (r) => { onClose(); onSaved?.(r.slug); } });
  return (
    <Modal open={open} title={planet ? `Editar ${planet.name}` : 'Novo planeta'} onClose={onClose} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={f.name.trim().length < 2 || !f.categoryId} onClick={() => save.mutate(undefined)}>Salvar</Button></>}>
      <div className="flex flex-col gap-4">
        <FormGrid>
          <TextInput label="Nome" required value={f.name} onChange={(v) => setF({ ...f, name: v })} />
          <TextInput label="Nome curto" value={f.shortName} onChange={(v) => setF({ ...f, shortName: v })} />
          <SelectInput label="Categoria" value={f.categoryId} placeholder="Escolha" onChange={(v) => setF({ ...f, categoryId: v })} options={(cats.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <SelectInput label="Situação" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={STATUS_OPTIONS.map((s) => ({ ...s }))} />
          <SelectInput label="Acesso" value={f.accessTier} onChange={(v) => setF({ ...f, accessTier: v })} options={[{ value: 'FREE', label: 'Grátis (unidades 1 e 2 no plano grátis)' }, { value: 'PREMIUM', label: 'Premium' }]} />
          <TextInput label="Cor do tema" type="color" value={f.themeColor} onChange={(v) => setF({ ...f, themeColor: v })} />
          <NumberInput label="Ordem" value={f.sortOrder} onChange={(v) => setF({ ...f, sortOrder: v })} />
        </FormGrid>
        <TextArea label="Descrição" rows={2} value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        <div className="flex flex-wrap gap-6">
          <Toggle label="Disponível para alunos (B2C)" checked={f.availableB2C} onChange={(v) => setF({ ...f, availableB2C: v })} />
          <Toggle label="Disponível para empresas (B2B)" checked={f.availableB2B} onChange={(v) => setF({ ...f, availableB2B: v })} />
        </div>
      </div>
    </Modal>
  );
}

