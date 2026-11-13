'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle, cx } from '@/components/ui';
import { SelectInput, useAction, useConfirm, useToast } from '@/components/admin';

/** Formato de GET /master/content/planets/:slug/video-board */
interface BoardVideo { id: string; name: string | null; folderName: string | null; number: number | null; durationSeconds: number | null; thumbnail: string | null }
interface BoardLesson { id: string; type: string; title: string; learners: number; video: BoardVideo | null }
interface BoardUnit { id: string; title: string; lessons: BoardLesson[] }
interface BoardCourse { id: string; title: string; status: string; moduleId: string | null; moduleName: string | null; units: BoardUnit[] }
interface FolderVideo { id: string; name?: string; durationSeconds?: number; thumbnail?: string; number: number | null; usedIn: string[] }
interface Issue { code: string; level: 'error' | 'warning' | 'info'; message: string; lessonIds?: string[]; videoId?: string; courseId?: string }
interface Board {
  planet: { id: string; slug: string; name: string; vimeoFolderId: string | null };
  folder: { id: string; modules: Array<{ id: string; name: string; videos: FolderVideo[] }> } | null;
  folderError: string | null;
  courses: BoardCourse[];
  issues: Issue[];
}
interface Draft { assign: Record<string, string | null>; titles: Record<string, string>; unitOrder: Record<string, string[]>; lessonOrder: Record<string, string[]> }
const EMPTY: Draft = { assign: {}, titles: {}, unitOrder: {}, lessonOrder: {} };

const ISSUE: Record<string, { label: string; tone: string }> = {
  MISSING: { label: 'Sem vídeo', tone: 'red' },
  DUPLICATE: { label: 'Repetido', tone: 'amber' },
  WRONG_MODULE: { label: 'Outro módulo', tone: 'amber' },
  ORDER: { label: 'Fora de ordem', tone: 'amber' },
  NOT_IN_FOLDER: { label: 'Fora da pasta', tone: 'blue' },
  UNUSED: { label: 'Não usado', tone: 'blue' },
};
const toneCls: Record<string, string> = { red: 'bg-red/15 text-red', amber: 'bg-amber/15 text-amber', blue: 'bg-blue/15 text-blue' };
const dur = (s?: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');
const move = <T,>(a: T[], i: number, d: number) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return b; [b[i], b[j]] = [b[j], b[i]]; return b; };

/**
 * Organizar vídeos do planeta: corrige equívocos de quem montou o conteúdo (ex.: o Claude).
 * Troca e permuta vídeos (inclusive entre cursos), reordena unidades e etapas e corrige títulos.
 * As alterações ficam pendentes até "Salvar", que grava tudo numa transação.
 */
export default function OrganizarVideos() {
  const { slug } = useParams<{ slug: string }>();
  const { api } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [ask, confirmNode] = useConfirm();
  const key = ['master', 'video-board', slug];
  const q = useQuery({ queryKey: key, queryFn: () => api.http.get<Board>(`/master/content/planets/${slug}/video-board`) });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [picking, setPicking] = useState<string | null>(null); // etapa esperando um vídeo da pasta
  const [swapFrom, setSwapFrom] = useState<string | null>(null); // etapa escolhida para permutar
  const [editing, setEditing] = useState<string | null>(null);

  const b = q.data;
  // índice de vídeos conhecidos (pasta + os que já estão nas etapas)
  const videos = useMemo(() => {
    const m = new Map<string, BoardVideo>();
    for (const mod of b?.folder?.modules ?? []) for (const v of mod.videos) m.set(v.id, { id: v.id, name: v.name ?? null, folderName: mod.name, number: v.number, durationSeconds: v.durationSeconds ?? null, thumbnail: v.thumbnail ?? null });
    for (const c of b?.courses ?? []) for (const u of c.units) for (const l of u.lessons) if (l.video && !m.has(l.video.id)) m.set(l.video.id, l.video);
    return m;
  }, [b]);
  const original = useMemo(() => new Map((b?.courses ?? []).flatMap((c) => c.units.flatMap((u) => u.lessons.map((l) => [l.id, l] as const)))), [b]);
  const where = useMemo(() => new Map((b?.courses ?? []).flatMap((c) => c.units.flatMap((u) => u.lessons.map((l) => [l.id, `${c.title} › ${u.title}`] as const)))), [b]);

  const videoOf = (l: BoardLesson) => (l.id in draft.assign ? (draft.assign[l.id] ? videos.get(draft.assign[l.id]!) ?? null : null) : l.video);
  const titleOf = (l: BoardLesson) => draft.titles[l.id] ?? l.title;
  const unitsOf = (c: BoardCourse) => (draft.unitOrder[c.id] ?? c.units.map((u) => u.id)).map((id) => c.units.find((u) => u.id === id)!);
  const lessonsOf = (u: BoardUnit) => (draft.lessonOrder[u.id] ?? u.lessons.map((l) => l.id)).map((id) => u.lessons.find((l) => l.id === id)!);
  // onde cada vídeo está, já com as alterações pendentes
  const usage = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of b?.courses ?? []) for (const u of c.units) for (const l of u.lessons) {
      if (l.type !== 'VIDEO') continue;
      const vid = l.id in draft.assign ? draft.assign[l.id] : l.video?.id;
      if (vid) m.set(vid, [...(m.get(vid) ?? []), l.id]);
    }
    return m;
  }, [b, draft.assign]);

  const changes = Object.keys(draft.assign).length + Object.keys(draft.titles).length + Object.keys(draft.unitOrder).length + Object.keys(draft.lessonOrder).length;
  const assign = (lessonId: string, videoId: string | null) => {
    const orig = original.get(lessonId)?.video?.id ?? null;
    setDraft((d) => {
      const a = { ...d.assign };
      if (videoId === orig) delete a[lessonId]; else a[lessonId] = videoId;
      return { ...d, assign: a };
    });
  };
  const swap = (a: BoardLesson, c: BoardLesson) => { const va = videoOf(a)?.id ?? null; const vc = videoOf(c)?.id ?? null; assign(a.id, vc); assign(c.id, va); setSwapFrom(null); };
  const issuesFor = (lessonId: string) => (b?.issues ?? []).filter((i) => i.lessonIds?.includes(lessonId));

  const setFolder = useAction((folderId: string) => api.http.patch(`/master/content/planets/${b!.planet.id}`, { vimeoFolderUri: `/projects/${folderId}` }), { success: 'Pasta do Vimeo ligada ao planeta', invalidate: [key] });
  const save = useAction(async () => {
    const body = {
      assignments: Object.entries(draft.assign).map(([lessonId, videoId]) => ({ lessonId, videoId })),
      titles: Object.entries(draft.titles).map(([lessonId, title]) => ({ lessonId, title })),
      unitOrder: Object.entries(draft.unitOrder).map(([courseId, unitIds]) => ({ courseId, unitIds })),
      lessonOrder: Object.entries(draft.lessonOrder).map(([unitId, lessonIds]) => ({ unitId, lessonIds })),
    };
    return api.http.put<Board>(`/master/content/planets/${slug}/video-board`, body);
  }, { success: 'Vídeos organizados', onDone: (r) => { qc.setQueryData(key, r); qc.invalidateQueries({ queryKey: ['master', 'tree', slug] }); setDraft(EMPTY); setPicking(null); setSwapFrom(null); } });

  async function onSave() {
    const touched = Object.keys(draft.assign).map((id) => original.get(id)).filter((l) => l && l.learners > 0);
    if (touched.length && !(await ask({ title: 'Trocar vídeo de etapa com alunos?', text: `${touched.length === 1 ? '1 etapa já tem' : `${touched.length} etapas já têm`} alunos com progresso (${touched.map((l) => `"${l!.title}"`).join(', ')}). O progresso é mantido; o vídeo novo passa a valer para todos.`, confirm: 'Salvar mesmo assim' }))) return;
    save.mutate(undefined);
  }

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const issues = b!.issues;
  const relevant = issues.filter((i) => i.code !== 'UNUSED' && i.code !== 'NOT_IN_FOLDER');
  const unused = issues.filter((i) => i.code === 'UNUSED').length;

  return (
    <>
      <PageTitle back={{ href: `/master/conteudo/${slug}`, label: b!.planet.name }} title="Organizar vídeos"
        subtitle="Confira se cada vídeo está no curso, na unidade e na ordem certos. Troque, permute ou reordene; nada é gravado até você salvar."
        actions={<>
          {changes > 0 && <Button variant="ghost" onClick={() => { setDraft(EMPTY); setPicking(null); setSwapFrom(null); }}>Descartar</Button>}
          <Button loading={save.isPending} disabled={!changes} onClick={onSave}>{changes ? `Salvar ${changes} alteraç${changes === 1 ? 'ão' : 'ões'}` : 'Nada para salvar'}</Button>
        </>} />

      {!b!.folder && <FolderPicker current={b!.planet.vimeoFolderId} error={b!.folderError} onPick={(id) => setFolder.mutate(id)} busy={setFolder.isPending} />}

      <Card className={cx('mb-4 p-4', relevant.length ? 'border-amber/40' : 'border-green/40')}>
        {relevant.length ? (
          <>
            <div className="mb-2 font-black">⚠ {relevant.length} {relevant.length === 1 ? 'equívoco encontrado' : 'equívocos encontrados'}</div>
            <ul className="flex flex-col gap-1 text-sm">
              {relevant.map((i, k) => (
                <li key={k} className="flex items-start gap-2">
                  <span className={cx('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase', toneCls[ISSUE[i.code]?.tone ?? 'blue'])}>{ISSUE[i.code]?.label ?? i.code}</span>
                  <button type="button" className="text-left hover:underline" onClick={() => i.lessonIds?.[0] && document.getElementById(`l-${i.lessonIds[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{i.message}</button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="font-black text-green">✓ Nenhum equívoco: cada vídeo está no seu módulo, sem repetição e na ordem.</div>
        )}
        {unused > 0 && <div className="mt-2 text-sm text-dim">{unused} {unused === 1 ? 'vídeo da pasta não está' : 'vídeos da pasta não estão'} em nenhuma etapa (veja à direita).</div>}
        {changes > 0 && <div className="mt-2 text-sm font-bold text-amber">Há alterações não salvas: os avisos acima são do que está gravado.</div>}
      </Card>

      {(picking || swapFrom) && (
        <div className="sticky top-2 z-10 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber bg-[#2a1c00] px-4 py-3 text-sm font-bold">
          <span>{picking ? `Escolha à direita o vídeo para "${titleOf(original.get(picking)!)}".` : `Escolha a etapa para permutar com "${titleOf(original.get(swapFrom!)!)}".`}</span>
          <Button variant="ghost" className="!px-3 !py-1.5" onClick={() => { setPicking(null); setSwapFrom(null); }}>Cancelar</Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {b!.courses.map((c) => {
            const units = unitsOf(c);
            const cIssues = relevant.filter((i) => i.courseId === c.id).length;
            return (
              <Card key={c.id} className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-lg font-black">{c.title}</div>
                    <div className="text-xs text-dim">{c.moduleName ? `Vídeos de: ${c.moduleName}` : 'Módulo não identificado'} · {units.length} unidades</div>
                  </div>
                  {cIssues > 0 ? <span className="rounded-full bg-amber/15 px-2.5 py-1 text-xs font-extrabold text-amber">{cIssues} equívoco{cIssues > 1 ? 's' : ''}</span> : <span className="rounded-full bg-green/15 px-2.5 py-1 text-xs font-extrabold text-green">✓ ok</span>}
                </div>
                <div className="flex flex-col gap-3">
                  {units.map((u, ui) => (
                    <div key={u.id} className="rounded-2xl border border-line bg-white/[0.02] p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-extrabold text-dim">UNIDADE {ui + 1}</span>
                        <span className="flex-1 truncate text-sm font-bold">{u.title}</span>
                        <Arrows label={`unidade ${u.title}`} first={ui === 0} last={ui === units.length - 1}
                          onMove={(d) => setDraft((x) => ({ ...x, unitOrder: { ...x.unitOrder, [c.id]: move(units.map((y) => y.id), ui, d) } }))} />
                      </div>
                      <div className="flex flex-col gap-2">
                        {lessonsOf(u).map((l, li, arr) => {
                          const v = videoOf(l);
                          const changed = l.id in draft.assign || l.id in draft.titles;
                          const dup = v && (usage.get(v.id)?.length ?? 0) > 1;
                          return (
                            <div key={l.id} id={`l-${l.id}`} className={cx('flex flex-wrap items-center gap-3 rounded-xl border p-2.5', changed ? 'border-amber/60 bg-amber/5' : 'border-line', (picking === l.id || swapFrom === l.id) && 'ring-2 ring-amber')}>
                              {l.type === 'VIDEO' ? (
                                v?.thumbnail ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={v.thumbnail.includes('?') ? v.thumbnail : `${v.thumbnail}_200x112`} alt="" className="h-[45px] w-20 shrink-0 rounded-lg object-cover" />
                                ) : <div className="grid h-[45px] w-20 shrink-0 place-items-center rounded-lg bg-white/5 text-lg">{v ? '🎬' : '⛔'}</div>
                              ) : <div className="grid h-[45px] w-20 shrink-0 place-items-center rounded-lg bg-white/5 text-lg">🎯</div>}
                              <div className="min-w-0 flex-1">
                                {editing === l.id ? (
                                  <input autoFocus defaultValue={titleOf(l)} aria-label="Título da etapa"
                                    className="w-full rounded-lg border border-line bg-card-2 px-2 py-1 text-sm font-bold"
                                    onBlur={(e) => { const t = e.target.value.trim(); setEditing(null); if (t.length >= 2 && t !== l.title) setDraft((x) => ({ ...x, titles: { ...x.titles, [l.id]: t } })); else setDraft((x) => { const n = { ...x.titles }; delete n[l.id]; return { ...x, titles: n }; }); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }} />
                                ) : (
                                  <button type="button" className="block max-w-full truncate text-left text-sm font-bold hover:underline" title="Editar título" onClick={() => setEditing(l.id)}>{titleOf(l)} <span className="text-dim">✎</span></button>
                                )}
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-dim">
                                  {l.type === 'VIDEO' ? (v ? <span className="truncate">{v.name ?? `Vídeo ${v.id}`} · {dur(v.durationSeconds)}{v.folderName ? ` · ${v.folderName}` : ''}</span> : <span className="font-bold text-red">Sem vídeo</span>) : <span>Prática</span>}
                                  {!changed && issuesFor(l.id).filter((i) => i.code !== 'UNUSED').map((i) => <span key={i.code} className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase', toneCls[ISSUE[i.code]?.tone ?? 'blue'])}>{ISSUE[i.code]?.label}</span>)}
                                  {changed && dup && <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase', toneCls.amber)}>Repetido</span>}
                                  {l.learners > 0 && <span title="Alunos com progresso nesta etapa">👥 {l.learners}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {l.type === 'VIDEO' && (swapFrom && swapFrom !== l.id ? (
                                  <Button className="!px-3 !py-1.5 !text-xs" onClick={() => swap(original.get(swapFrom)!, l)}>Permutar aqui</Button>
                                ) : (
                                  <>
                                    <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={() => { setSwapFrom(null); setPicking(picking === l.id ? null : l.id); }}>{picking === l.id ? 'Escolhendo…' : 'Trocar'}</Button>
                                    <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" disabled={!v} onClick={() => { setPicking(null); setSwapFrom(swapFrom === l.id ? null : l.id); }}>Permutar</Button>
                                  </>
                                ))}
                                {changed && <button type="button" className="px-1 text-xs font-bold text-dim hover:text-ink" title="Desfazer nesta etapa" onClick={() => setDraft((x) => { const a = { ...x.assign }; const t = { ...x.titles }; delete a[l.id]; delete t[l.id]; return { ...x, assign: a, titles: t }; })}>↺</button>}
                                <Arrows label={`etapa ${titleOf(l)}`} first={li === 0} last={li === arr.length - 1}
                                  onMove={(d) => setDraft((x) => ({ ...x, lessonOrder: { ...x.lessonOrder, [u.id]: move(arr.map((y) => y.id), li, d) } }))} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <Card className="max-h-[calc(100vh-2rem)] overflow-auto p-4">
            <div className="mb-1 font-black">Pasta no Vimeo</div>
            {b!.folder ? (
              <>
                <div className="mb-3 text-xs text-dim">{b!.folder.modules.reduce((a, m) => a + m.videos.length, 0)} vídeos em {b!.folder.modules.length} {b!.folder.modules.length === 1 ? 'pasta' : 'subpastas'}</div>
                <div className="flex flex-col gap-3">
                  {b!.folder.modules.map((m) => (
                    <div key={m.id}>
                      <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-muted">{m.name}</div>
                      <div className="flex flex-col gap-1.5">
                        {m.videos.map((v) => {
                          const used = usage.get(v.id) ?? [];
                          return (
                            <div key={v.id} className={cx('flex items-center gap-2 rounded-xl border p-2', picking ? 'border-amber/40' : 'border-line')}>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-bold">{v.name ?? v.id}</div>
                                <div className="truncate text-xs text-dim">{dur(v.durationSeconds)} · {used.length ? used.map((id) => where.get(id)).join(' · ') : <span className="text-blue">não usado</span>}{used.length > 1 && <span className="font-bold text-amber"> (repetido)</span>}</div>
                              </div>
                              {picking && <Button className="!px-3 !py-1.5 !text-xs" onClick={() => { assign(picking, v.id); setPicking(null); toast('Vídeo trocado (falta salvar)'); }}>Usar</Button>}
                              <a href={`https://vimeo.com/${v.id}`} target="_blank" rel="noreferrer" className="px-1 text-xs text-dim hover:text-ink" title="Abrir no Vimeo">↗</a>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-dim">Ligue a pasta do planeta no Vimeo para ver os vídeos disponíveis e os equívocos de módulo e de ordem.</p>}
          </Card>
        </div>
      </div>
      {confirmNode}
    </>
  );
}

function Arrows({ first, last, onMove, label }: { first: boolean; last: boolean; onMove: (d: number) => void; label: string }) {
  return (
    <span className="flex flex-col">
      <button type="button" disabled={first} onClick={() => onMove(-1)} aria-label={`Subir ${label}`} className="px-1.5 leading-none text-dim hover:text-ink disabled:opacity-20">▲</button>
      <button type="button" disabled={last} onClick={() => onMove(1)} aria-label={`Descer ${label}`} className="px-1.5 leading-none text-dim hover:text-ink disabled:opacity-20">▼</button>
    </span>
  );
}

/** Planeta sem pasta do Vimeo ligada: escolher a pasta (a do link .../folder/<id>). */
function FolderPicker({ current, error, onPick, busy }: { current: string | null; error: string | null; onPick: (id: string) => void; busy: boolean }) {
  const { api } = useSession();
  const folders = useQuery({ queryKey: ['master', 'vimeo-folders'], queryFn: () => api.http.get<Array<{ id: string; name: string; videos: number | null }>>('/master/content/vimeo/folders') });
  const [sel, setSel] = useState('');
  return (
    <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="font-black">{current ? 'Não foi possível ler a pasta do Vimeo' : 'Ligue a pasta do Vimeo deste planeta'}</div>
        <div className="text-sm text-dim">{error ?? 'Com a pasta, o quadro mostra os vídeos disponíveis e aponta vídeos de outro módulo, fora de ordem ou não usados.'}</div>
      </div>
      <div className="w-full sm:w-72">
        <SelectInput label="Pasta" value={sel} onChange={setSel} placeholder={folders.isLoading ? 'Carregando…' : 'Escolha a pasta'}
          options={(folders.data ?? []).map((f) => ({ value: f.id, label: `${f.name}${f.videos ? ` (${f.videos} vídeos)` : ''}` }))} />
      </div>
      <Button disabled={!sel} loading={busy} onClick={() => onPick(sel)}>Usar esta pasta</Button>
    </Card>
  );
}
