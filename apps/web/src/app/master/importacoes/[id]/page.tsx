'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle, Stat, cx } from '@/components/ui';
import { DataTable, SectionTitle, StatusPill, Tabs, TextArea, Toggle, useAction, useConfirm } from '@/components/admin';

interface Issue { code: string; path: string; message: string; severity: 'error' | 'warning' | 'info' }
interface PlanRow { key: string; name: string; slug: string; action: string; reason?: string; courses: Array<{ key: string; title: string; action: string; reason?: string }> }
interface ImportView {
  id: string; label?: string | null; filename?: string | null; status: string; strategy: string; via: string; createdAt: string; appliedAt?: string | null;
  stats?: { planets?: number; courses?: number; units?: number; questions?: number; videosPending?: number; lessons?: Record<string, number>; questionTypes?: Record<string, number> } | null;
  errors: number; warnings: number; issues: Issue[]; notes?: Issue[]; plan?: { planets: PlanRow[]; summary?: Record<string, number>; hasChanges?: boolean } | null;
  result?: { planets?: Array<{ slug: string; name: string; action: string; error?: string; videosPending?: number }>; error?: string } | null;
}

const ACTION: Record<string, [string, string]> = {
  CREATE: ['Criar', 'text-green'], UPDATE: ['Atualizar', 'text-blue'], REPLACE: ['Substituir trilha', 'text-blue'], UNCHANGED: ['Sem mudança', 'text-dim'],
  SKIP: ['Pular', 'text-dim'], BLOCKED: ['Bloqueado', 'text-red'], CONFLICT: ['Conflito', 'text-red'], FAILED: ['Falhou', 'text-red'],
};

export default function ImportacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { api } = useSession();
  const router = useRouter();
  const [ask, node] = useConfirm();
  const [tab, setTab] = useState<'previa' | 'problemas' | 'json'>('previa');
  const [publish, setPublish] = useState(false);
  const [onlyValid, setOnlyValid] = useState(true);
  const q = useQuery({ queryKey: ['master', 'import', id], queryFn: () => api.http.get<ImportView>(`/master/content/imports/${id}`) });
  const key = [['master', 'import', id], ['master', 'imports'], ['master', 'planets'], ['master', 'tree'], ['catalog']];
  const plan = useAction(() => api.http.post<ImportView>(`/master/content/imports/${id}/plan`, {}), { success: 'Prévia atualizada com o banco de agora', invalidate: key });
  const apply = useAction(() => api.http.post<ImportView>(`/master/content/imports/${id}/apply`, { publish, onlyValid }), { success: (r) => r.status === 'APPLIED' ? 'Conteúdo gravado' : `Gravação ${r.status === 'PARTIAL' ? 'parcial' : 'com falha'}: veja o resultado`, invalidate: key });
  const discard = useAction(() => api.http.del(`/master/content/imports/${id}`), { success: 'Importação descartada', invalidate: [['master', 'imports']], onDone: () => router.replace('/master/importacoes') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const v = q.data!;
  const canApply = ['VALIDATED', 'INVALID', 'PARTIAL', 'FAILED'].includes(v.status) && !!v.plan?.hasChanges;
  return (
    <>
      <PageTitle back={{ href: '/master/importacoes', label: 'Importações' }} title={v.label || v.filename || 'Importação'}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusPill status={v.status} /> enviada em {fmt.date(v.createdAt)}{v.appliedAt ? ` · gravada em ${fmt.date(v.appliedAt)}` : ''}</span>}
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="ghost" loading={plan.isPending} onClick={() => plan.mutate(undefined)}>Atualizar prévia</Button>
          {v.status !== 'APPLIED' && <Button variant="ghost" className="text-red" onClick={async () => { if (await ask({ title: 'Descartar importação?', text: 'O lote é descartado. Nada foi gravado no catálogo ainda.', confirm: 'Descartar', danger: true })) discard.mutate(undefined); }}>Descartar</Button>}
        </div>} />
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Planetas" value={v.stats?.planets ?? 0} />
        <Stat label="Cursos" value={v.stats?.courses ?? 0} tone="blue" />
        <Stat label="Questões" value={v.stats?.questions ?? 0} tone="purple" />
        <Stat label="Erros" value={v.errors} tone={v.errors ? 'red' : 'green'} />
        <Stat label="Vídeos sem link" value={v.stats?.videosPending ?? 0} tone="amber" />
      </section>
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'previa', label: 'Prévia da gravação' }, { key: 'problemas', label: 'Problemas', count: v.issues.length }, { key: 'json', label: 'JSON normalizado' }]} />
      {tab === 'previa' && (
        <div className="flex flex-col gap-4">
          {!v.plan ? <Card className="text-muted">Sem prévia. Clique em “Atualizar prévia”.</Card> : v.plan.planets.length === 0 && v.errors === 0 ? <Card className="text-muted">Nenhum planeta neste lote.</Card> : v.plan.planets.map((p) => (
            <Card key={p.key}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-extrabold">{p.name}</h3><span className={cx('text-sm font-bold', ACTION[p.action]?.[1])}>{ACTION[p.action]?.[0] ?? p.action}</span></div>
              {p.reason && <p className="text-sm text-red">{p.reason}</p>}
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {p.courses.map((c) => <li key={c.key} className="flex flex-wrap justify-between gap-2"><span>{c.title}</span><span className={cx('font-bold', ACTION[c.action]?.[1])}>{ACTION[c.action]?.[0] ?? c.action}{c.reason ? <span className="block text-right text-xs font-medium text-dim">{c.reason}</span> : null}</span></li>)}
              </ul>
            </Card>
          ))}
          {v.result?.planets && (
            <Card className="border-green/30"><SectionTitle>Resultado da última gravação</SectionTitle>
              <ul className="text-sm">{v.result.planets.map((r) => <li key={r.slug}><b>{r.name}</b>: <span className={ACTION[r.action]?.[1]}>{ACTION[r.action]?.[0] ?? r.action}</span>{r.error ? <span className="text-red"> · {r.error}</span> : ''}</li>)}</ul>
            </Card>
          )}
          {canApply ? (
            <Card className="flex flex-wrap items-center justify-between gap-4 border-amber/40">
              <div className="flex flex-col gap-3">
                <Toggle label="Publicar ao gravar" hint="Desligado: entra como rascunho para revisar no Conteúdo." checked={publish} onChange={setPublish} />
                {v.errors > 0 && <Toggle label="Gravar só os planetas sem erro" checked={onlyValid} onChange={setOnlyValid} />}
              </div>
              <Button loading={apply.isPending} disabled={v.errors > 0 && !onlyValid} onClick={async () => { if (await ask({ title: 'Gravar no catálogo?', text: <>Os itens marcados como <b>Criar</b>, <b>Atualizar</b> e <b>Substituir trilha</b> serão gravados{publish ? ' e publicados' : ' como rascunho'}. Cursos com progresso de alunos nunca são sobrescritos.</>, confirm: 'Gravar' })) apply.mutate(undefined); }}>Gravar no catálogo</Button>
            </Card>
          ) : v.errors > 0 && !v.plan?.planets.length ? (
            <Card className="border-red/40 text-sm"><b className="text-red">{v.errors} erro(s) impedem a gravação.</b> <span className="text-muted">Veja a aba Problemas e corrija na aba JSON normalizado (ou reenvie o arquivo corrigido).</span></Card>
          ) : v.plan && !v.plan.hasChanges && <Card className="text-sm text-muted">Nada a gravar: o banco já está igual a este lote.</Card>}
        </div>
      )}
      {tab === 'problemas' && (
        <DataTable rows={[...v.issues, ...(v.notes ?? [])]} rowKey={(i) => `${i.severity}-${i.path}-${i.code}-${i.message}`} empty="Nenhum problema encontrado." minWidth={700}
          columns={[
            { key: 's', label: 'Tipo', render: (i) => <span className={cx('text-xs font-extrabold uppercase', i.severity === 'error' ? 'text-red' : i.severity === 'warning' ? 'text-amber' : 'text-dim')}>{i.severity === 'error' ? 'Erro' : i.severity === 'warning' ? 'Aviso' : 'Info'}</span> },
            { key: 'm', label: 'Mensagem', render: (i) => i.message },
            { key: 'p', label: 'Onde', render: (i) => <span className="font-mono text-xs text-dim">{i.path}</span> },
          ]} />
      )}
      {tab === 'json' && <NormalizedEditor id={id} invalidate={key} />}
      {node}
    </>
  );
}

/** Corrigir o conteúdo normalizado (formato canônico) direto aqui e revalidar. */
function NormalizedEditor({ id, invalidate }: { id: string; invalidate: unknown[][] }) {
  const { api } = useSession();
  const q = useQuery({ queryKey: ['master', 'import', id, 'normalized'], queryFn: () => api.http.get<unknown>(`/master/content/imports/${id}/normalized`) });
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = useAction((body: unknown) => api.http.put(`/master/content/imports/${id}/normalized`, body), { success: 'Conteúdo revalidado', invalidate });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const value = text ?? JSON.stringify((q.data as { bundle?: unknown })?.bundle ?? q.data, null, 2);
  return (
    <Card>
      <p className="mb-3 text-sm text-muted">Este é o conteúdo já convertido para o formato canônico. Corrija o que a validação apontou e salve para revalidar.</p>
      <TextArea label="JSON" rows={22} mono value={value} onChange={(t) => { setText(t); setErr(null); }} />
      {err && <p className="mt-2 text-sm font-bold text-red">{err}</p>}
      <div className="mt-3 flex justify-end"><Button loading={save.isPending} disabled={text === null} onClick={() => { try { save.mutate(JSON.parse(value)); } catch { setErr('JSON inválido: confira vírgulas e chaves.'); } }}>Salvar e revalidar</Button></div>
    </Card>
  );
}
