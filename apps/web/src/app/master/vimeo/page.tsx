'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { DataTable, SectionTitle, SelectInput, Toggle, useAction } from '@/components/admin';
import type { PlanetRow, PlanetTree } from '@/components/master/content-types';

interface VimeoStatus { connected: boolean; reason?: string; account?: { name: string; plan?: string; link?: string }; scopes?: string[]; missingScopes?: string[]; canEditPrivacy?: boolean; embedDomains?: string[] }
interface Folder { id: string; name: string; videos: number | null }
interface LinkResult { course: string; dryRun: boolean; linked: number; unmatchedLessons: Array<{ id?: string; title?: string } | string>; unusedVideos: Array<{ id: string; name: string }>; matches: Array<{ action: string; lesson?: { title?: string } | string; video?: { name?: string } | null }> }

/** Vídeos no Vimeo: pastas da conta, ligar uma pasta às aulas de vídeo de um curso e sincronizar duração/miniatura. */
export default function VimeoPage() {
  const { api } = useSession();
  const status = useQuery({ queryKey: ['master', 'vimeo', 'status'], queryFn: () => api.http.get<VimeoStatus>('/master/content/vimeo/status') });
  const folders = useQuery({ queryKey: ['master', 'vimeo', 'folders'], queryFn: () => api.http.get<Folder[]>('/master/content/vimeo/folders'), enabled: !!status.data?.connected });
  const planets = useQuery({ queryKey: ['master', 'planets', 'all'], queryFn: () => api.http.get<PlanetRow[]>('/master/content/planets') });
  const [folderId, setFolderId] = useState('');
  const [planet, setPlanet] = useState('');
  const [courseId, setCourseId] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [result, setResult] = useState<LinkResult | null>(null);
  const tree = useQuery({ queryKey: ['master', 'tree', planet], queryFn: () => api.http.get<PlanetTree>(`/master/content/planets/${planet}/tree`), enabled: !!planet });
  const link = useAction((dryRun: boolean) => api.http.post<LinkResult>(`/master/content/courses/${courseId}/vimeo/link-folder`, { folderId, dryRun, overwrite }),
    { success: (r) => r.dryRun ? `Prévia: ${r.linked} vídeo(s) seriam ligados` : `${r.linked} vídeo(s) ligados`, invalidate: [['master', 'tree']], onDone: setResult });
  const sync = useAction(() => api.http.post<Record<string, unknown>>('/master/content/vimeo/sync'), { success: 'Duração e miniaturas sincronizadas' });

  if (status.isLoading) return <Loading />;
  if (status.error) return <ErrorBox error={status.error} onRetry={() => status.refetch()} />;
  const s = status.data!;
  return (
    <>
      <PageTitle title="Vídeos (Vimeo)" subtitle="Ligue as pastas do Vimeo às aulas de vídeo pelo título e mantenha duração e miniatura em dia."
        actions={s.connected ? <Button variant="ghost" loading={sync.isPending} onClick={() => sync.mutate(undefined)}>Sincronizar todos os vídeos</Button> : undefined} />
      <Card className="mb-6">
        <SectionTitle>Conexão</SectionTitle>
        {s.connected ? (
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><div className="text-dim">Conta</div><div className="font-bold">{s.account?.name} {s.account?.plan ? `(${s.account.plan})` : ''}</div></div>
            <div><div className="text-dim">Permissões</div><div className="font-bold">{s.scopes?.join(', ')}</div>{!!s.missingScopes?.length && <div className="text-red">Faltam: {s.missingScopes.join(', ')}</div>}</div>
            <div><div className="text-dim">Domínios do player</div><div className="font-bold">{s.embedDomains?.join(', ') || 'nenhum domínio configurado'}</div><div className="text-xs text-dim">{s.canEditPrivacy ? 'Dá para restringir o player a estes domínios ao ligar uma pasta.' : 'Sem permissão "edit": a plataforma não altera a privacidade dos vídeos.'}</div></div>
          </div>
        ) : (
          <div className="text-sm"><p className="font-bold text-amber">Vimeo ainda não conectado.</p><p className="mt-1 text-muted">{s.reason}. Gere um token em developer.vimeo.com com os escopos <b>public private edit</b> e configure <code>VIMEO_ACCESS_TOKEN</code> no servidor. Enquanto isso, dá para colar o link de cada vídeo direto na aula (Conteúdo → planeta → etapa de vídeo).</p></div>
        )}
      </Card>
      {s.connected && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionTitle>Ligar pasta a um curso</SectionTitle>
            <div className="flex flex-col gap-4">
              <SelectInput label="Pasta no Vimeo" value={folderId} placeholder={folders.isLoading ? 'Carregando…' : 'Escolha'} onChange={setFolderId} options={(folders.data ?? []).map((f) => ({ value: f.id, label: `${f.name}${f.videos != null ? ` (${f.videos} vídeos)` : ''}` }))} />
              <SelectInput label="Planeta" value={planet} placeholder="Escolha" onChange={(v) => { setPlanet(v); setCourseId(''); }} options={(planets.data ?? []).map((p) => ({ value: p.slug, label: p.name }))} />
              <SelectInput label="Curso" value={courseId} placeholder={tree.isLoading ? 'Carregando…' : 'Escolha'} onChange={setCourseId} options={(tree.data?.courses ?? []).map((c) => ({ value: c.id, label: c.title }))} />
              <Toggle label="Substituir vídeos já ligados" checked={overwrite} onChange={setOverwrite} />
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" disabled={!folderId || !courseId} loading={link.isPending && link.variables === true} onClick={() => link.mutate(true)}>Ver prévia</Button>
                <Button disabled={!folderId || !courseId || !result?.dryRun} loading={link.isPending && link.variables === false} onClick={() => link.mutate(false)}>Ligar vídeos</Button>
              </div>
            </div>
          </Card>
          <Card>
            <SectionTitle>{result ? `${result.dryRun ? 'Prévia' : 'Resultado'} · ${result.course}` : 'Resultado'}</SectionTitle>
            {!result ? <p className="text-sm text-muted">Escolha a pasta e o curso e veja a prévia antes de ligar. O nome do vídeo é comparado com o título da aula de vídeo.</p> : (
              <div className="flex flex-col gap-3 text-sm">
                <p><b className="text-green">{result.linked}</b> vídeo(s) {result.dryRun ? 'seriam ligados' : 'ligados'}.</p>
                <DataTable rows={result.matches} rowKey={(m) => JSON.stringify(m).slice(0, 80)} minWidth={360}
                  columns={[
                    { key: 'l', label: 'Aula', render: (m) => typeof m.lesson === 'string' ? m.lesson : m.lesson?.title },
                    { key: 'v', label: 'Vídeo', render: (m) => m.video?.name ?? <span className="text-amber">sem vídeo com esse nome</span> },
                    { key: 'a', label: '', render: (m) => <span className="text-xs font-bold text-dim">{m.action}</span> },
                  ]} />
                {result.unusedVideos.length > 0 && <p className="text-xs text-dim">Vídeos da pasta sem aula: {result.unusedVideos.map((v) => v.name).join(', ')}</p>}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
