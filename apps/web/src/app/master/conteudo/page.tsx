'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Loading, PageTitle, PlanetBadge } from '@/components/ui';
import { DataTable, Modal, NumberInput, SearchBox, StatusPill, Tabs, TextArea, TextInput, Toggle, optEdit, useAction, useConfirm } from '@/components/admin';
import { STATUS_OPTIONS, type Category, type PlanetRow } from '@/components/master/content-types';
import { PlanetForm, useCategories } from '@/components/master/content';

/** Conteúdo global (criado pelo MASTER ou pelo Claude): categorias, planetas e a árvore de cada planeta. */
export default function ConteudoPage() {
  const [tab, setTab] = useState<'planetas' | 'categorias'>('planetas');
  return (
    <>
      <PageTitle title="Conteúdo" subtitle="Planetas, cursos e trilhas. Crie pelo Claude ou pela importação; aqui você revisa, edita e publica."
        actions={<Link href="/master/importacoes"><Button variant="ghost">Importar conteúdo</Button></Link>} />
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'planetas', label: 'Planetas' }, { key: 'categorias', label: 'Categorias (galáxias)' }]} />
      {tab === 'planetas' ? <Planetas /> : <Categorias />}
    </>
  );
}

function Planetas() {
  const { api } = useSession();
  const router = useRouter();
  const cats = useCategories();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ['master', 'planets', search, status, categoryId], queryFn: () => api.http.get<PlanetRow[]>('/master/content/planets', { search, status, categoryId }) });
  const setPlanetStatus = useAction((v: { id: string; status: string }) => api.http.patch(`/master/content/planets/${v.id}`, { status: v.status }), { success: 'Situação do planeta atualizada', invalidate: [['master', 'planets'], ['catalog']] });
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar planeta…" />
        <select aria-label="Categoria" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm"><option value="">Todas as categorias</option>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm"><option value="">Todas as situações</option>{STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        <div className="ml-auto"><Button onClick={() => setCreating(true)}>+ Novo planeta</Button></div>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <DataTable rows={q.data!} rowKey={(p) => p.id} onRowClick={(p) => router.push(`/master/conteudo/${p.slug}`)} empty="Nenhum planeta encontrado."
          columns={[
            { key: 'n', label: 'Planeta', render: (p) => <div className="flex items-center gap-3"><span className="h-8 w-8 rounded-full" style={{ background: `radial-gradient(circle at 30% 30%, #fff8, ${p.visual?.colors?.[0] ?? p.themeColor ?? '#ffb020'})` }} /><div><div className="font-bold">{p.name}</div><div className="text-xs text-dim">{p.category.name} · {p._count?.courses ?? 0} cursos</div></div></div> },
            { key: 't', label: 'Acesso', render: (p) => <PlanetBadge code={p.accessTier === 'FREE' ? 'GRATIS' : 'PREMIUM'} /> },
            { key: 'a', label: 'Disponível', render: (p) => <span className="text-muted">{[p.availableB2C && 'B2C', p.availableB2B && 'Empresas'].filter(Boolean).join(' · ') || '—'}</span> },
            { key: 's', label: 'Situação', render: (p) => (
              <select aria-label={`Situação de ${p.name}`} value={p.status} onClick={(e) => e.stopPropagation()} onChange={(e) => setPlanetStatus.mutate({ id: p.id, status: e.target.value })} className="rounded-lg border border-line bg-bg px-2 py-1 text-xs font-bold">
                {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            ) },
            { key: 'o', label: 'Origem', render: (p) => <span className="text-xs text-dim">{p.sourceImportId ? 'Importado do Claude' : 'Catálogo'}</span> },
            { key: 'u', label: 'Atualizado', render: (p) => <span className="text-muted">{fmt.date(p.updatedAt)}</span> },
          ]} />
      )}
      <PlanetForm open={creating} onClose={() => setCreating(false)} onSaved={(slug) => router.push(`/master/conteudo/${slug}`)} />
    </>
  );
}

function Categorias() {
  const { api } = useSession();
  const q = useCategories();
  const [ask, node] = useConfirm();
  const [f, setF] = useState<Partial<Category> | null>(null);
  const save = useAction(() => {
    const body = { name: f!.name?.trim(), description: optEdit(f!.description ?? '', !!f!.id), sortOrder: f!.sortOrder ?? undefined, isActive: f!.isActive ?? true };
    return f!.id ? api.http.patch(`/master/content/categories/${f!.id}`, body) : api.http.post('/master/content/categories', body);
  }, { success: 'Categoria salva', invalidate: [['master', 'categories'], ['catalog']], onDone: () => setF(null) });
  const remove = useAction((id: string) => api.http.del(`/master/content/categories/${id}`), { success: 'Categoria removida', invalidate: [['master', 'categories']] });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <div className="mb-4 flex justify-end"><Button onClick={() => setF({ name: '', isActive: true })}>+ Nova categoria</Button></div>
      <DataTable rows={q.data!} rowKey={(c) => c.id} minWidth={560}
        columns={[
          { key: 'n', label: 'Categoria', render: (c) => <div><div className="font-bold">{c.name}</div><div className="text-xs text-dim">{c.description}</div></div> },
          { key: 'p', label: 'Planetas', render: (c) => c._count?.planets ?? 0 },
          { key: 's', label: 'Situação', render: (c) => <StatusPill status={c.isActive ? 'ACTIVE' : 'DISABLED'} label={c.isActive ? 'Ativa' : 'Inativa'} /> },
          { key: 'a', label: '', className: 'text-right', render: (c) => <div className="flex justify-end gap-3"><button className="text-sm font-bold text-amber" onClick={() => setF(c)}>Editar</button>{!c._count?.planets && <button className="text-sm font-bold text-red" onClick={async () => { if (await ask({ title: 'Remover categoria?', text: `"${c.name}" será removida.`, confirm: 'Remover', danger: true })) remove.mutate(c.id); }}>Remover</button>}</div> },
        ]} />
      <Modal open={!!f} title={f?.id ? 'Editar categoria' : 'Nova categoria'} onClose={() => setF(null)}
        footer={<><Button variant="ghost" onClick={() => setF(null)}>Cancelar</Button><Button loading={save.isPending} disabled={!f?.name || f.name.trim().length < 2} onClick={() => save.mutate(undefined)}>Salvar</Button></>}>
        {f && <div className="flex flex-col gap-4">
          <TextInput label="Nome" required value={f.name ?? ''} onChange={(v) => setF({ ...f, name: v })} />
          <TextArea label="Descrição" rows={2} value={f.description ?? ''} onChange={(v) => setF({ ...f, description: v })} />
          <NumberInput label="Ordem" value={f.sortOrder ?? ''} onChange={(v) => setF({ ...f, sortOrder: v === '' ? undefined : v })} />
          <Toggle label="Ativa" checked={f.isActive ?? true} onChange={(v) => setF({ ...f, isActive: v })} />
        </div>}
      </Modal>
      {node}
    </>
  );
}
