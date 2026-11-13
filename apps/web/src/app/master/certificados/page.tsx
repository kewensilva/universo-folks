'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { DataTable, Modal, SectionTitle, SelectInput, StatusPill, TextArea, TextInput, Toggle, useAction, useConfirm, useToast } from '@/components/admin';

interface Template { id: string; name: string; type: 'COURSE' | 'PLANET'; html: string; isDefault: boolean; tenantId?: string | null; updatedAt: string }

/** Modelos de certificado (curso e planeta), pré-visualização, validação pública e revogação. */
export default function CertificadosPage() {
  const { api } = useSession();
  const toast = useToast();
  const [ask, node] = useConfirm();
  const [f, setF] = useState<Partial<Template> | null>(null);
  const [code, setCode] = useState('');
  const q = useQuery({ queryKey: ['master', 'cert-templates'], queryFn: () => api.http.get<Template[]>('/master/certificate-templates') });
  const key = [['master', 'cert-templates']];
  const save = useAction(() => {
    const body = { name: f!.name?.trim(), type: f!.type ?? 'COURSE', html: f!.html ?? '', isDefault: !!f!.isDefault, tenantId: null };
    return f!.id ? api.http.put(`/master/certificate-templates/${f!.id}`, body) : api.http.post('/master/certificate-templates', body);
  }, { success: 'Modelo salvo', invalidate: key, onDone: () => setF(null) });
  const remove = useAction((id: string) => api.http.del(`/master/certificate-templates/${id}`), { success: 'Modelo removido', invalidate: key });
  const revoke = useAction(() => api.http.post(`/master/certificates/${encodeURIComponent(code.trim())}/revoke`), { success: 'Certificado revogado', onDone: () => setCode('') });
  async function preview(id: string) {
    try {
      const blob = await api.download(`/master/certificate-templates/${id}/preview`);
      window.open(URL.createObjectURL(new Blob([await blob.text()], { type: 'text/html' })), '_blank', 'noopener');
    } catch { toast('Não foi possível abrir a prévia', 'error'); }
  }
  return (
    <>
      <PageTitle title="Certificados" subtitle="Modelos usados ao concluir um curso e ao fechar um planeta. Campos: {{studentName}}, {{courseTitle}}, {{planetName}}, {{tenantName}}, {{code}}…"
        actions={<Button onClick={() => setF({ type: 'COURSE', name: '', html: '', isDefault: false })}>+ Novo modelo</Button>} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <DataTable rows={q.data!} rowKey={(t) => t.id} minWidth={640}
          columns={[
            { key: 'n', label: 'Modelo', render: (t) => <div className="font-bold">{t.name}</div> },
            { key: 't', label: 'Tipo', render: (t) => t.type === 'COURSE' ? 'Curso' : 'Planeta' },
            { key: 'd', label: 'Padrão', render: (t) => t.isDefault ? <StatusPill status="ACTIVE" label="Padrão" /> : '—' },
            { key: 'u', label: 'Atualizado', render: (t) => fmt.date(t.updatedAt) },
            { key: 'a', label: '', className: 'text-right', render: (t) => <div className="flex justify-end gap-3"><button className="text-sm font-bold text-muted" onClick={() => preview(t.id)}>Prévia</button><button className="text-sm font-bold text-amber" onClick={() => setF(t)}>Editar</button>{!t.isDefault && <button className="text-sm font-bold text-red" onClick={async () => { if (await ask({ title: 'Remover modelo?', text: `"${t.name}" será removido.`, confirm: 'Remover', danger: true })) remove.mutate(t.id); }}>Remover</button>}</div> },
          ]} />
      )}
      <Card className="mt-6 max-w-xl">
        <SectionTitle>Revogar um certificado</SectionTitle>
        <p className="mb-3 text-sm text-muted">Use em caso de fraude ou erro. A validação pública passa a mostrar “revogado”.</p>
        <div className="flex gap-2"><div className="flex-1"><TextInput label="Código do certificado" value={code} onChange={setCode} /></div><div className="pt-7"><Button variant="danger" disabled={code.trim().length < 4} loading={revoke.isPending} onClick={async () => { if (await ask({ title: 'Revogar certificado?', text: `O certificado ${code} deixa de ser válido.`, confirm: 'Revogar', danger: true })) revoke.mutate(undefined); }}>Revogar</Button></div></div>
      </Card>
      <Modal open={!!f} title={f?.id ? 'Editar modelo' : 'Novo modelo'} onClose={() => setF(null)} wide
        footer={<><Button variant="ghost" onClick={() => setF(null)}>Cancelar</Button><Button loading={save.isPending} disabled={!f?.name || f.name.trim().length < 2 || (f.html ?? '').length < 20} onClick={() => save.mutate(undefined)}>Salvar</Button></>}>
        {f && <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Nome" required value={f.name ?? ''} onChange={(v) => setF({ ...f, name: v })} />
            <SelectInput label="Tipo" value={f.type ?? 'COURSE'} onChange={(v) => setF({ ...f, type: v })} options={[{ value: 'COURSE', label: 'Curso' }, { value: 'PLANET', label: 'Planeta' }]} />
          </div>
          <TextArea label="HTML do certificado" rows={16} mono value={f.html ?? ''} onChange={(v) => setF({ ...f, html: v })} />
          <Toggle label="Modelo padrão deste tipo" checked={!!f.isDefault} onChange={(v) => setF({ ...f, isDefault: v })} />
        </div>}
      </Modal>
      {node}
    </>
  );
}
