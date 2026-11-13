'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading } from '../ui';
import { FormGrid, NumberInput, SectionTitle, TextInput, Toggle, optNum, useAction } from '../admin';
import type { CompanyOverview } from './types';

export function useCompanyOverview(tenantId: string) {
  const { api } = useSession();
  return useQuery({ queryKey: ['company', tenantId, 'overview'], queryFn: () => api.http.get<CompanyOverview>(`/companies/${tenantId}`) });
}

/**
 * Regras da empresa. O ADMIN ajusta nota mínima, tentativas, espera e fluxo sequencial.
 * Cotas de licença, Premium incluído e contrato são do MASTER (variant="master", via /master/tenants/:id/settings).
 */
export function CompanySettings({ tenantId, variant }: { tenantId: string; variant: 'admin' | 'master' }) {
  const { api } = useSession();
  const q = useCompanyOverview(tenantId);
  const [f, setF] = useState<Record<string, number | '' | boolean | string> | null>(null);
  useEffect(() => {
    if (!q.data || f) return;
    const s = q.data.settings;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preenche o formulário uma vez quando os dados chegam
    setF({ maxCollaborators: s.maxCollaborators, maxAdmins: s.maxAdmins, passingScore: s.passingScore, maxExamAttempts: s.maxExamAttempts, examRetryCooldownHrs: s.examRetryCooldownHrs, enforceSequentialFlow: s.enforceSequentialFlow, grantsPremiumAccess: s.grantsPremiumAccess, contractStart: s.contractStart?.slice(0, 10) ?? '', contractEnd: s.contractEnd?.slice(0, 10) ?? '' });
  }, [q.data, f]);
  const save = useAction(() => {
    const v = f!;
    const common = { passingScore: optNum(v.passingScore as number | ''), maxExamAttempts: optNum(v.maxExamAttempts as number | ''), examRetryCooldownHrs: optNum(v.examRetryCooldownHrs as number | ''), enforceSequentialFlow: v.enforceSequentialFlow as boolean };
    if (variant === 'admin') return api.http.patch(`/companies/${tenantId}/settings`, common);
    return api.http.patch(`/master/tenants/${tenantId}/settings`, {
      ...common,
      maxCollaborators: optNum(v.maxCollaborators as number | ''), maxAdmins: optNum(v.maxAdmins as number | ''), grantsPremiumAccess: v.grantsPremiumAccess as boolean,
      // data apagada vai como null para limpar no banco
      contractStart: fmt.dayToIso(v.contractStart as string) ?? null,
      contractEnd: fmt.dayToIso(v.contractEnd as string) ?? null,
    });
  }, { success: 'Regras salvas', invalidate: [['company', tenantId], ['master', 'tenants'], ['master', 'tenant', tenantId], ['dash']] });

  if (q.isLoading || !f) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data!;
  const set = (k: string) => (v: number | '' | boolean | string) => setF({ ...f, [k]: v });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <SectionTitle>Licenças</SectionTitle>
        {variant === 'master' ? (
          <FormGrid>
            <NumberInput label="Limite de colaboradores" min={0} value={f.maxCollaborators as number} onChange={set('maxCollaborators')} hint={`Em uso: ${o.seats.collaborators.used}`} />
            <NumberInput label="Limite de administradores" min={0} value={f.maxAdmins as number} onChange={set('maxAdmins')} hint={`Em uso: ${o.seats.admins.used}`} />
          </FormGrid>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-muted">Colaboradores</div><div className="text-2xl font-extrabold">{o.seats.collaborators.used}<span className="text-base text-dim">/{o.seats.collaborators.max}</span></div></div>
            <div><div className="text-muted">Administradores</div><div className="text-2xl font-extrabold">{o.seats.admins.used}<span className="text-base text-dim">/{o.seats.admins.max}</span></div></div>
            <p className="col-span-2 text-xs text-dim">As cotas são definidas pela Folks. Para mais licenças, fale com o seu contato comercial.</p>
          </div>
        )}
        <div className="mt-4 rounded-xl bg-bg px-4 py-3 text-sm">Código para entrar na empresa: <b className="font-mono text-amber">{o.joinCode}</b></div>
      </Card>
      <Card>
        <SectionTitle>Certificação e trilha</SectionTitle>
        <div className="flex flex-col gap-4">
          <FormGrid>
            <NumberInput label="Nota mínima na prova (%)" min={0} max={100} value={f.passingScore as number} onChange={set('passingScore')} />
            <NumberInput label="Tentativas na prova" min={0} value={f.maxExamAttempts as number} onChange={set('maxExamAttempts')} hint="0 = sem limite" />
            <NumberInput label="Espera entre tentativas (horas)" min={0} value={f.examRetryCooldownHrs as number} onChange={set('examRetryCooldownHrs')} />
          </FormGrid>
          <Toggle label="Fluxo sequencial" hint="A próxima etapa só abre depois de concluir a anterior." checked={f.enforceSequentialFlow as boolean} onChange={set('enforceSequentialFlow')} />
        </div>
      </Card>
      {variant === 'master' && (
        <Card className="lg:col-span-2">
          <SectionTitle>Contrato</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Início do contrato" type="date" value={f.contractStart as string} onChange={set('contractStart')} />
            <TextInput label="Fim do contrato" type="date" value={f.contractEnd as string} onChange={set('contractEnd')} />
            <div className="pt-7"><Toggle label="Inclui conteúdo Premium" hint="Colaboradores acessam também o que é Premium." checked={f.grantsPremiumAccess as boolean} onChange={set('grantsPremiumAccess')} /></div>
          </div>
        </Card>
      )}
      <div className="flex justify-end lg:col-span-2"><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Salvar regras</Button></div>
    </div>
  );
}
