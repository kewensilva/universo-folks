'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { fmt, type Page } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { DataTable, Modal, Pagination, SelectInput, StatusPill, TextArea, TextInput, Tabs, useAction, useToast } from '@/components/admin';

interface ImportRow { id: string; label?: string | null; filename?: string | null; format: string; status: string; stats?: { planets?: number; courses?: number; questions?: number; videosPending?: number } | null; errorCount: number; warningCount: number; via: string; createdAt: string; appliedAt?: string | null }

/** Conteúdo criado no Claude (JSON ou texto do chat) entra por aqui: prévia, correção e gravação (ADR 0010). */
export default function ImportacoesPage() {
  const { api } = useSession();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const q = useQuery({ queryKey: ['master', 'imports', page], queryFn: () => api.http.get<Page<ImportRow>>('/master/content/imports', { page, pageSize: 20 }) });
  return (
    <>
      <PageTitle title="Importações" subtitle="Traga planetas, cursos e trilhas criados no Claude. Nada vai para o banco sem você revisar a prévia."
        actions={<div className="flex gap-2"><Button variant="ghost" onClick={() => setPrompt(true)}>Prompt para o Claude</Button><Button onClick={() => setOpen(true)}>+ Nova importação</Button></div>} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <DataTable rows={q.data!.items} rowKey={(i) => i.id} onRowClick={(i) => router.push(`/master/importacoes/${i.id}`)} empty="Nenhuma importação ainda."
            columns={[
              { key: 'n', label: 'Lote', render: (i) => <div><div className="font-bold">{i.label || i.filename || 'Sem nome'}</div><div className="text-xs text-dim">{i.filename ?? ''} · {i.format} · via {i.via === 'mcp' ? 'Claude (conector)' : 'painel/API'}</div></div> },
              { key: 'c', label: 'Conteúdo', render: (i) => <span className="text-muted">{i.stats ? `${i.stats.planets ?? 0} planetas · ${i.stats.courses ?? 0} cursos · ${i.stats.questions ?? 0} questões` : '—'}</span> },
              { key: 'e', label: 'Problemas', render: (i) => <span>{i.errorCount ? <b className="text-red">{i.errorCount} erros</b> : <span className="text-green">sem erros</span>}{i.warningCount ? <span className="text-amber"> · {i.warningCount} avisos</span> : ''}</span> },
              { key: 's', label: 'Situação', render: (i) => <StatusPill status={i.status} /> },
              { key: 'd', label: 'Enviada', render: (i) => <span className="text-muted">{fmt.date(i.createdAt)}</span> },
              { key: 'a', label: 'Gravada', render: (i) => <span className="text-muted">{fmt.date(i.appliedAt)}</span> },
            ]} />
          <Pagination page={q.data!.page} totalPages={q.data!.totalPages} total={q.data!.total} onPage={setPage} />
        </>
      )}
      <NewImport open={open} onClose={() => setOpen(false)} onCreated={(id) => router.push(`/master/importacoes/${id}`)} />
      <PromptModal open={prompt} onClose={() => setPrompt(false)} />
    </>
  );
}

function NewImport({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { api } = useSession();
  const [mode, setMode] = useState<'colar' | 'arquivo'>('arquivo');
  const [content, setContent] = useState('');
  const [label, setLabel] = useState('');
  const [strategy, setStrategy] = useState<'upsert' | 'create_only'>('upsert');
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const create = useAction(async () => {
    if (mode === 'colar') return [await api.http.post<{ id: string }>('/master/content/imports', { content, label: label || undefined, strategy })];
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    const r = await api.http.upload<Array<{ id: string }> | { id: string }>(`/master/content/imports/upload?strategy=${strategy}`, form);
    return Array.isArray(r) ? r : [r];
  }, { success: (r) => `${r.length} lote(s) recebido(s)`, invalidate: [['master', 'imports']], onDone: (r) => { onClose(); setContent(''); setFiles([]); setLabel(''); if (r[0]) onCreated(r[0].id); } });
  return (
    <Modal open={open} title="Nova importação" onClose={onClose} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={create.isPending} disabled={mode === 'colar' ? content.trim().length < 10 : !files.length} onClick={() => create.mutate(undefined)}>Validar e ver prévia</Button></>}>
      <Tabs active={mode} onChange={setMode} tabs={[{ key: 'arquivo', label: 'Enviar arquivos' }, { key: 'colar', label: 'Colar JSON ou texto do chat' }]} />
      <div className="flex flex-col gap-4">
        {mode === 'arquivo' ? (
          <div>
            <input ref={input} type="file" multiple accept=".json,.md,.txt" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <button onClick={() => input.current?.click()} className="w-full rounded-2xl border-2 border-dashed border-line p-8 text-center hover:border-amber/60">
              <div className="text-3xl">📄</div>
              <div className="mt-2 font-bold">{files.length ? `${files.length} arquivo(s) escolhido(s)` : 'Escolher arquivos .json, .md ou .txt'}</div>
              <div className="text-xs text-dim">Até 30 arquivos, 20 MB cada. Cada arquivo vira um lote.</div>
            </button>
            {files.length > 0 && <ul className="mt-2 text-sm text-muted">{files.map((f) => <li key={f.name}>{f.name} · {f.size < 1024 ? `${f.size} bytes` : `${(f.size / 1024).toFixed(0)} KB`}</li>)}</ul>}
          </div>
        ) : (
          <>
            <TextInput label="Nome do lote" value={label} onChange={setLabel} placeholder="Ex.: Planetas de dezembro" />
            <TextArea label="Conteúdo" rows={12} mono value={content} onChange={setContent} placeholder='{ "schemaVersion": "folks.content/v1", "planets": [ ... ] }  ou o texto do chat' />
          </>
        )}
        <SelectInput label="Se o planeta já existir" value={strategy} onChange={setStrategy} options={[{ value: 'upsert', label: 'Atualizar (cria o que falta, troca trilhas sem progresso)' }, { value: 'create_only', label: 'Só criar novos (não mexe no que existe)' }]} />
      </div>
    </Modal>
  );
}

function PromptModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { api } = useSession();
  const toast = useToast();
  const q = useQuery({ queryKey: ['master', 'import-schema'], queryFn: () => api.http.get<{ conversionPrompt: string }>('/master/content/imports/schema'), enabled: open });
  return (
    <Modal open={open} title="Prompt de conversão para o Claude" onClose={onClose} wide
      footer={<Button onClick={async () => { await navigator.clipboard.writeText(q.data?.conversionPrompt ?? ''); toast('Prompt copiado'); }} disabled={!q.data}>Copiar prompt</Button>}>
      <p className="mb-3 text-sm text-muted">Cole este texto na mesma conversa do Claude em que os planetas foram criados. Ele devolve o JSON no formato que a importação lê sem adivinhar nada.</p>
      {q.isLoading ? <Loading /> : <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl bg-bg p-4 text-xs text-muted">{q.data?.conversionPrompt}</pre>}
    </Modal>
  );
}
