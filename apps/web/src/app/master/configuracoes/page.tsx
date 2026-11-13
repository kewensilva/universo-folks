'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { NumberInput, SectionTitle, TextInput, Toggle, useAction } from '@/components/admin';

type Settings = Record<string, number | boolean | string>;

/** Parâmetros gerais da plataforma, agrupados por assunto (rótulos em pt-BR). */
const GROUPS: Array<{ title: string; fields: Array<{ key: string; label: string; hint?: string }> }> = [
  { title: 'Padrões para novas empresas', fields: [
    { key: 'default_tenant_max_collaborators', label: 'Limite de colaboradores' },
    { key: 'default_tenant_max_admins', label: 'Limite de administradores' },
    { key: 'default_passing_score', label: 'Nota mínima na prova (%)' },
    { key: 'default_max_exam_attempts', label: 'Tentativas na prova', hint: '0 = sem limite' },
    { key: 'default_exam_cooldown_hours', label: 'Espera entre tentativas (horas)' },
  ] },
  { title: 'Plano grátis', fields: [
    { key: 'free_units_per_course', label: 'Unidades grátis por curso' },
    { key: 'free_infinite_rounds_per_day', label: 'Rodadas de prática infinita por dia' },
    { key: 'free_infinite_questions', label: 'Exercícios por rodada' },
    { key: 'free_jam_per_day', label: 'Jams por dia' },
    { key: 'b2c_premium_trial_days', label: 'Dias de teste do Premium' },
    { key: 'adult_age', label: 'Idade adulta (anúncios só para adultos)' },
  ] },
  { title: 'XP e gamificação', fields: [
    { key: 'xp_per_level', label: 'XP por nível' },
    { key: 'xp_lesson', label: 'XP por aula' },
    { key: 'xp_video', label: 'XP por vídeo' },
    { key: 'xp_practice_correct', label: 'XP por acerto na prática' },
    { key: 'xp_practice_fast_bonus', label: 'Bônus por acerto rápido' },
    { key: 'xp_exam_passed', label: 'XP ao passar na prova' },
    { key: 'xp_streak_bonus', label: 'Bônus de sequência' },
    { key: 'infinite_practice_size', label: 'Tamanho da rodada infinita (Premium/empresa)' },
  ] },
];

export default function ConfiguracoesPage() {
  const { api } = useSession();
  const q = useQuery({ queryKey: ['master', 'settings'], queryFn: () => api.http.get<Settings>('/master/settings') });
  const [f, setF] = useState<Settings | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- preenche o formulário quando os dados chegam
  useEffect(() => { if (q.data && !f) setF(q.data); }, [q.data, f]);
  const save = useAction(() => {
    const changed = Object.fromEntries(Object.entries(f!).filter(([k, v]) => q.data![k] !== v));
    return api.http.patch<Settings>('/master/settings', changed);
  }, { success: 'Configurações salvas', invalidate: [['master', 'settings']] });
  if (q.isLoading || !f) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const known = new Set(GROUPS.flatMap((g) => g.fields.map((x) => x.key)).concat(['video_anti_skip', 'support_email']));
  const others = Object.keys(f).filter((k) => !known.has(k));
  const num = (k: string) => (v: number | '') => setF({ ...f, [k]: v === '' ? 0 : v });
  return (
    <>
      <PageTitle title="Configurações" subtitle="Parâmetros que valem para toda a plataforma. Empresas podem ter regras próprias (Empresas → Cotas e regras)." />
      <div className="grid gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <Card key={g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">{g.fields.filter((x) => x.key in f).map((x) => <NumberInput key={x.key} label={x.label} hint={x.hint} min={0} value={f[x.key] as number} onChange={num(x.key)} />)}</div>
          </Card>
        ))}
        <Card>
          <SectionTitle>Geral</SectionTitle>
          <div className="flex flex-col gap-4">
            {'video_anti_skip' in f && <Toggle label="Anti-pulo nos vídeos" hint="O tempo assistido só avança no ritmo do relógio (até 2x)." checked={!!f.video_anti_skip} onChange={(v) => setF({ ...f, video_anti_skip: v })} />}
            {'support_email' in f && <TextInput label="E-mail de suporte" type="email" value={String(f.support_email)} onChange={(v) => setF({ ...f, support_email: v })} />}
            {others.map((k) => typeof f[k] === 'number' ? <NumberInput key={k} label={k} value={f[k] as number} onChange={num(k)} /> : typeof f[k] === 'boolean' ? <Toggle key={k} label={k} checked={!!f[k]} onChange={(v) => setF({ ...f, [k]: v })} /> : <TextInput key={k} label={k} value={String(f[k])} onChange={(v) => setF({ ...f, [k]: v })} />)}
          </div>
        </Card>
      </div>
      <div className="mt-4 flex justify-end"><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Salvar configurações</Button></div>
    </>
  );
}
