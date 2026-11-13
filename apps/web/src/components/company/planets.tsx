'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PlanetBadge, cx } from '../ui';
import { Modal, Toggle, useAction } from '../admin';
import { useDepartments } from './departments';
import type { CompanyPlanet } from './types';

/** Liberação de planetas para a empresa inteira ou só para alguns departamentos. */
export function CompanyPlanets({ tenantId }: { tenantId: string }) {
  const { api } = useSession();
  const q = useQuery({ queryKey: ['company', tenantId, 'planets'], queryFn: () => api.http.get<CompanyPlanet[]>(`/companies/${tenantId}/planets`) });
  const departments = useDepartments(tenantId);
  const [edit, setEdit] = useState<{ p: CompanyPlanet; enabled: boolean; all: boolean; ids: string[] } | null>(null);
  const save = useAction((v: { planetId: string; enabled: boolean; allDepartments: boolean; departmentIds: string[] }) =>
    api.http.put(`/companies/${tenantId}/planets/${v.planetId}`, { enabled: v.enabled, allDepartments: v.allDepartments, departmentIds: v.allDepartments ? [] : v.departmentIds }),
    { success: 'Liberação atualizada', invalidate: [['company', tenantId], ['dash', 'company', tenantId]], onDone: () => setEdit(null) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <p className="mb-4 text-sm text-muted">Só os planetas liberados aparecem para os colaboradores. Libere para a empresa toda ou só para alguns setores.</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {q.data!.map((x) => (
          <Card key={x.planet.id} className={cx('flex flex-col gap-3', !x.enabled && 'opacity-70')}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: x.planet.themeColor ?? '#ffb020' }} /><span className="font-extrabold">{x.planet.name}</span></div>
                <div className="mt-0.5 text-xs text-dim">{x.planet.category.name} · {x.planet.courseCount} cursos{x.planet.status !== 'PUBLISHED' ? ' · ainda não publicado' : ''}</div>
              </div>
              <PlanetBadge code={x.planet.accessTier === 'FREE' ? 'GRATIS' : 'PREMIUM'} />
            </div>
            <div className="text-sm">{!x.enabled ? <span className="text-dim">Não liberado</span> : x.allDepartments ? <span className="font-bold text-green">Liberado para todos</span> : <span className="font-bold text-amber">Liberado para: {x.departments.map((d) => d.name).join(', ') || 'nenhum setor'}</span>}</div>
            <div className="mt-auto flex gap-2">
              <Button variant="ghost" className="flex-1 py-2" onClick={() => setEdit({ p: x, enabled: x.enabled || true, all: x.enabled ? x.allDepartments : true, ids: x.departments.map((d) => d.id) })}>Configurar</Button>
              {x.enabled && <Button variant="ghost" className="py-2 text-red" loading={save.isPending && save.variables?.planetId === x.planet.id} onClick={() => save.mutate({ planetId: x.planet.id, enabled: false, allDepartments: true, departmentIds: [] })}>Bloquear</Button>}
            </div>
          </Card>
        ))}
      </div>
      <Modal open={!!edit} title={`Liberar ${edit?.p.planet.name ?? ''}`} onClose={() => setEdit(null)}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button loading={save.isPending} onClick={() => edit && save.mutate({ planetId: edit.p.planet.id, enabled: edit.enabled, allDepartments: edit.all, departmentIds: edit.ids })}>Salvar</Button></>}>
        {edit && (
          <div className="flex flex-col gap-4">
            <Toggle label="Planeta liberado para a empresa" checked={edit.enabled} onChange={(v) => setEdit({ ...edit, enabled: v })} />
            {edit.enabled && <Toggle label="Todos os departamentos" hint="Desligue para escolher os setores" checked={edit.all} onChange={(v) => setEdit({ ...edit, all: v })} />}
            {edit.enabled && !edit.all && (
              <div className="flex flex-wrap gap-2">
                {(departments.data ?? []).map((d) => {
                  const on = edit.ids.includes(d.id);
                  return <button key={d.id} type="button" aria-pressed={on} onClick={() => setEdit({ ...edit, ids: on ? edit.ids.filter((i) => i !== d.id) : [...edit.ids, d.id] })} className={cx('rounded-full border px-3 py-1 text-sm font-bold', on ? 'border-amber bg-amber/15' : 'border-line text-muted')}>{d.name}</button>;
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
