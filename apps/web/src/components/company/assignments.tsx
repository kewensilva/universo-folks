'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fmt, type Page, type PlanetDetail } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Loading } from '../ui';
import { DataTable, Modal, NumberInput, SelectInput, TextInput, Toggle, useAction, useConfirm } from '../admin';
import { useDepartments } from './departments';
import type { Assignment, CompanyPlanet, Member } from './types';

type Form = { id?: string; targetType: 'COURSE' | 'PLANET'; planetSlug: string; planetId: string; courseId: string; scope: 'all' | 'department' | 'member'; departmentId: string; membershipId: string; mandatory: boolean; priority: number | ''; dueDate: string; startsAt: string };
const empty: Form = { targetType: 'COURSE', planetSlug: '', planetId: '', courseId: '', scope: 'all', departmentId: '', membershipId: '', mandatory: true, priority: '', dueDate: '', startsAt: '' };

/** Trilhas obrigatórias/recomendadas com prazo e prioridade (empresa inteira, setor ou pessoa). */
export function CompanyAssignments({ tenantId }: { tenantId: string }) {
  const { api } = useSession();
  const [ask, confirmNode] = useConfirm();
  const q = useQuery({ queryKey: ['company', tenantId, 'assignments'], queryFn: () => api.http.get<Assignment[]>(`/companies/${tenantId}/assignments`) });
  const planets = useQuery({ queryKey: ['company', tenantId, 'planets'], queryFn: () => api.http.get<CompanyPlanet[]>(`/companies/${tenantId}/planets`) });
  const members = useQuery({ queryKey: ['company', tenantId, 'members'], queryFn: () => api.http.get<Page<Member>>(`/companies/${tenantId}/members`, { pageSize: 200 }) });
  const departments = useDepartments(tenantId);
  const [f, setF] = useState<Form | null>(null);
  const planetSlugOf = (id?: string | null) => planets.data?.find((p) => p.planet.id === id)?.planet.slug ?? '';
  // cursos do planeta escolhido (catálogo)
  const courses = useQuery({ queryKey: ['catalog', 'planet', f?.planetSlug], queryFn: () => api.http.get<PlanetDetail>(`/catalog/planets/${f!.planetSlug}`), enabled: !!f?.planetSlug });
  const key = [['company', tenantId], ['dash', 'company', tenantId]];

  const save = useAction((v: Form) => {
    const body = {
      targetType: v.targetType,
      planetId: v.targetType === 'PLANET' ? v.planetId : undefined,
      courseId: v.targetType === 'COURSE' ? v.courseId : undefined,
      departmentId: v.scope === 'department' ? v.departmentId : undefined,
      membershipId: v.scope === 'member' ? v.membershipId : undefined,
      mandatory: v.mandatory,
      priority: v.priority === '' ? undefined : v.priority,
      dueDate: fmt.dayToIso(v.dueDate),
      startsAt: fmt.dayToIso(v.startsAt),
    };
    return v.id ? api.http.patch(`/companies/${tenantId}/assignments/${v.id}`, body) : api.http.post(`/companies/${tenantId}/assignments`, body);
  }, { success: 'Trilha salva', invalidate: key, onDone: () => setF(null) });
  const remove = useAction((id: string) => api.http.del(`/companies/${tenantId}/assignments/${id}`), { success: 'Trilha removida', invalidate: key });
  const reorder = useAction((ids: string[]) => api.http.put(`/companies/${tenantId}/assignments/order`, { orderedIds: ids }), { invalidate: key });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const list = [...q.data!].sort((a, b) => a.priority - b.priority);
  const move = (i: number, d: -1 | 1) => { const ids = list.map((a) => a.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; reorder.mutate(ids); };
  const enabledPlanets = (planets.data ?? []).filter((p) => p.enabled);
  const valid = f && (f.targetType === 'PLANET' ? !!f.planetId : !!f.courseId) && (f.scope !== 'department' || !!f.departmentId) && (f.scope !== 'member' || !!f.membershipId);

  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setF({ ...empty })}>+ Nova trilha</Button></div>
      <DataTable rows={list} rowKey={(a) => a.id} empty="Nenhuma trilha definida. Crie trilhas obrigatórias com prazo para a equipe."
        columns={[
          { key: 'o', label: 'Ordem', className: 'w-20', render: (a) => { const i = list.indexOf(a); return <div className="flex gap-1"><button aria-label="Subir" disabled={i === 0} className="rounded-lg border border-line px-2 disabled:opacity-30" onClick={() => move(i, -1)}>↑</button><button aria-label="Descer" disabled={i === list.length - 1} className="rounded-lg border border-line px-2 disabled:opacity-30" onClick={() => move(i, 1)}>↓</button></div>; } },
          { key: 't', label: 'Trilha', render: (a) => <div><div className="font-bold">{a.course?.title ?? a.planet?.name ?? '—'}</div><div className="text-xs text-dim">{a.targetType === 'COURSE' ? 'Curso' : 'Planeta inteiro'}</div></div> },
          { key: 'p', label: 'Para quem', render: (a) => <span className="text-muted">{a.department?.name ? `Setor ${a.department.name}` : a.membership ? (a.membership.user?.name ?? 'Uma pessoa') : 'Empresa inteira'}</span> },
          { key: 'm', label: 'Tipo', render: (a) => a.mandatory ? <span className="font-bold text-red">Obrigatória</span> : <span className="text-muted">Recomendada</span> },
          { key: 'd', label: 'Prazo', render: (a) => fmt.dateOnly(a.dueDate) },
          { key: 'a', label: '', className: 'text-right', render: (a) => (
            <div className="flex justify-end gap-3">
              <button className="text-sm font-bold text-amber" onClick={() => setF({ id: a.id, targetType: a.targetType, planetSlug: a.targetType === 'COURSE' ? '' : planetSlugOf(a.planetId), planetId: a.planetId ?? '', courseId: a.courseId ?? '', scope: a.departmentId ? 'department' : a.membershipId ? 'member' : 'all', departmentId: a.departmentId ?? '', membershipId: a.membershipId ?? '', mandatory: a.mandatory, priority: a.priority, dueDate: a.dueDate?.slice(0, 10) ?? '', startsAt: a.startsAt?.slice(0, 10) ?? '' })}>Editar</button>
              <button className="text-sm font-bold text-red" onClick={async () => { if (await ask({ title: 'Remover trilha?', text: 'A trilha sai da lista da equipe. O progresso nos cursos continua guardado.', confirm: 'Remover', danger: true })) remove.mutate(a.id); }}>Remover</button>
            </div>
          ) },
        ]} />
      <Modal open={!!f} title={f?.id ? 'Editar trilha' : 'Nova trilha'} onClose={() => setF(null)}
        footer={<><Button variant="ghost" onClick={() => setF(null)}>Cancelar</Button><Button loading={save.isPending} disabled={!valid} onClick={() => f && save.mutate(f)}>Salvar</Button></>}>
        {f && (
          <div className="flex flex-col gap-4">
            <SelectInput label="O que estudar" value={f.targetType} onChange={(v) => setF({ ...f, targetType: v, courseId: '', planetId: '' })} options={[{ value: 'COURSE', label: 'Um curso' }, { value: 'PLANET', label: 'Um planeta inteiro' }]} />
            <SelectInput label="Planeta" value={f.planetSlug} placeholder="Escolha um planeta liberado" onChange={(v) => setF({ ...f, planetSlug: v, planetId: enabledPlanets.find((p) => p.planet.slug === v)?.planet.id ?? '', courseId: '' })}
              options={enabledPlanets.map((p) => ({ value: p.planet.slug, label: p.planet.name }))} hint={enabledPlanets.length ? undefined : 'Libere planetas para a empresa primeiro.'} />
            {f.targetType === 'COURSE' && f.planetSlug && (
              <SelectInput label="Curso" value={f.courseId} placeholder={courses.isLoading ? 'Carregando…' : 'Escolha o curso'} onChange={(v) => setF({ ...f, courseId: v })}
                options={(courses.data?.courses ?? []).filter((c) => c.status !== 'COMING_SOON').map((c) => ({ value: c.id, label: c.title }))} />
            )}
            <SelectInput label="Para quem" value={f.scope} onChange={(v) => setF({ ...f, scope: v })} options={[{ value: 'all', label: 'Empresa inteira' }, { value: 'department', label: 'Um setor' }, { value: 'member', label: 'Uma pessoa' }]} />
            {f.scope === 'department' && <SelectInput label="Setor" value={f.departmentId} placeholder="Escolha" onChange={(v) => setF({ ...f, departmentId: v })} options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />}
            {f.scope === 'member' && <SelectInput label="Pessoa" value={f.membershipId} placeholder="Escolha" onChange={(v) => setF({ ...f, membershipId: v })} options={(members.data?.items ?? []).map((m) => ({ value: m.membershipId, label: `${m.user.name} (${m.user.email})` }))} />}
            <Toggle label="Obrigatória" hint="Obrigatórias entram no indicador de conformidade e nos lembretes." checked={f.mandatory} onChange={(v) => setF({ ...f, mandatory: v })} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextInput label="Começa em" type="date" value={f.startsAt} onChange={(v) => setF({ ...f, startsAt: v })} />
              <TextInput label="Prazo" type="date" value={f.dueDate} onChange={(v) => setF({ ...f, dueDate: v })} />
              <NumberInput label="Prioridade" min={0} value={f.priority} onChange={(v) => setF({ ...f, priority: v })} hint="Menor vem primeiro" />
            </div>
          </div>
        )}
      </Modal>
      {confirmNode}
    </>
  );
}
