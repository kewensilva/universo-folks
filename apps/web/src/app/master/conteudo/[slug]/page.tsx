'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle, PlanetBadge, cx } from '@/components/ui';
import { FormGrid, Modal, NumberInput, SelectInput, StatusPill, TextArea, TextInput, Toggle, opt, useAction, useConfirm } from '@/components/admin';
import { PlanetForm } from '@/components/master/content';
import { STATUS_OPTIONS, TYPE_LABEL, type CourseRow, type LessonRow, type PlanetTree, type UnitRow } from '@/components/master/content-types';
import { useTrailTemplates } from '@/components/master/catalog';

const TIER_OPTIONS = [{ value: '', label: 'Herda' }, { value: 'FREE', label: 'Grátis' }, { value: 'PREMIUM', label: 'Premium' }];

/** Árvore do planeta: cursos → unidades → etapas → questões, e a prova final. Edição de metadados e publicação. */
export default function PlanetaConteudo() {
  const { slug } = useParams<{ slug: string }>();
  const { api } = useSession();
  const router = useRouter();
  const [editPlanet, setEditPlanet] = useState(false);
  const q = useQuery({ queryKey: ['master', 'tree', slug], queryFn: () => api.http.get<PlanetTree>(`/master/content/planets/${slug}/tree`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data!;
  return (
    <>
      <PageTitle back={{ href: '/master/conteudo', label: 'Conteúdo' }} title={p.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{p.category.name} · <StatusPill status={p.status} /> <PlanetBadge code={p.accessTier === 'FREE' ? 'GRATIS' : 'PREMIUM'} /> {p.description}</span>}
        actions={<>
          <Button variant="ghost" onClick={() => router.push(`/master/conteudo/${slug}/videos`)}>🎬 Organizar vídeos</Button>
          <Button variant="ghost" onClick={() => setEditPlanet(true)}>Editar planeta</Button>
        </>} />
      <div className="flex flex-col gap-4">
        {p.courses.map((c) => <CourseCard key={c.id} c={c} slug={slug} />)}
        {p.courses.length === 0 && <Card className="text-muted">Planeta sem cursos. Crie pelo Claude (conector) ou pela importação.</Card>}
      </div>
      <PlanetForm open={editPlanet} onClose={() => setEditPlanet(false)} planet={p} />
    </>
  );
}

function CourseCard({ c, slug }: { c: CourseRow; slug: string }) {
  const { api } = useSession();
  const [ask, node] = useConfirm();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const key = [['master', 'tree', slug], ['master', 'planets'], ['catalog']];
  const setStatus = useAction((status: string) => api.http.patch(`/master/content/courses/${c.id}`, { status }), { success: 'Situação do curso atualizada', invalidate: key });
  const remove = useAction(() => api.http.del<{ archived?: boolean; deleted?: boolean; reason?: string }>(`/master/content/courses/${c.id}`), { success: (r) => r.archived ? 'Curso arquivado (tem progresso de alunos)' : 'Curso excluído', invalidate: key });
  const lessons = c.units.reduce((n, u) => n + u.lessons.length, 0);
  const questions = c.units.reduce((n, u) => n + u.lessons.reduce((m, l) => m + l.questions.length, 0), 0) + (c.exam?.questions.length ?? 0);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button className="text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <div className="flex items-center gap-2"><span className="text-dim">{open ? '▾' : '▸'}</span><h2 className="text-lg font-extrabold">{c.title}</h2></div>
          <div className="mt-0.5 pl-5 text-xs text-dim">{c.meta ?? `${c.units.length} unidades`} · {lessons} etapas · {questions} questões{c.hasCertificate ? ' · com certificado' : ''}{c.code ? ` · ${c.code}` : ''}</div>
        </button>
        <TemplateBadge c={c} />
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={`Situação de ${c.title}`} value={c.status} onChange={(e) => setStatus.mutate(e.target.value)} className="rounded-lg border border-line bg-bg px-2 py-1.5 text-xs font-bold">
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => setEdit(true)}>Editar</Button>
          <Button variant="ghost" className="px-3 py-1.5 text-sm text-red" onClick={async () => { if (await ask({ title: 'Excluir curso?', text: 'Se houver alunos com progresso, o curso é ARQUIVADO (sai do catálogo, o histórico fica). Sem progresso, é excluído de vez.', confirm: 'Continuar', danger: true })) remove.mutate(undefined); }}>Excluir</Button>
        </div>
      </div>
      {open && (
        <div className="mt-4 flex flex-col gap-3 pl-5">
          {c.units.map((u, i) => <UnitBlock key={u.id} u={u} n={i + 1} slug={slug} />)}
          {c.exam && (
            <div className="rounded-2xl border border-purple/30 bg-purple/5 p-4">
              <div className="font-extrabold">🏆 {c.exam.title}</div>
              <div className="text-xs text-dim">{c.exam.questionSource === 'BANK' ? `${c.exam.questions.length} questões no banco` : 'Gerada no app'} · sorteia {c.exam.questionCount ?? 'todas'} · nota mínima {c.exam.passingScore ?? 'da empresa/plataforma'}%</div>
              <QuestionList qs={c.exam.questions} />
            </div>
          )}
        </div>
      )}
      <CourseForm open={edit} onClose={() => setEdit(false)} c={c} invalidate={key} />
      {node}
    </Card>
  );
}

function UnitBlock({ u, n, slug }: { u: UnitRow; n: number; slug: string }) {
  const { api } = useSession();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ title: u.title, accessTier: u.accessTier ?? '', themeColor: u.themeColor ?? '#ffb020' });
  const [lesson, setLesson] = useState<LessonRow | null>(null);
  const save = useAction(() => api.http.patch(`/master/content/units/${u.id}`, { title: f.title.trim(), accessTier: f.accessTier || null, themeColor: f.themeColor }), { success: 'Unidade salva', invalidate: [['master', 'tree', slug]], onDone: () => setEdit(false) });
  return (
    <div className="rounded-2xl bg-bg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg text-xs font-extrabold text-bg" style={{ background: u.themeColor ?? '#ffb020' }}>{n}</span>
          <span className="font-bold">{u.title}</span>
          <span className="text-xs text-dim">{u.accessTier === 'FREE' ? 'Grátis' : u.accessTier === 'PREMIUM' ? 'Premium' : 'herda do curso'}</span>
        </div>
        <button className="text-sm font-bold text-amber" onClick={() => setEdit(true)}>Editar unidade</button>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {u.lessons.map((l) => (
          <li key={l.id}>
            <button onClick={() => setLesson(l)} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-white/[0.04]">
              <span><span className="mr-2 text-xs font-bold text-dim">{TYPE_LABEL[l.type]}</span>{l.title}</span>
              <span className="shrink-0 text-xs text-dim">
                {l.type === 'PRACTICE' && `${l.questions.length} questões${l.questionCount ? ` · ${l.questionCount}/rodada` : ''}`}
                {l.type === 'LESSON' && `${l.content?.slides?.length ?? 0} telas`}
                {l.type === 'VIDEO' && (l.vimeoUrl ? 'vídeo ligado' : <span className="text-amber">sem vídeo</span>)}
                {' · '}{l.xpReward} XP
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Modal open={edit} title="Editar unidade" onClose={() => setEdit(false)}
        footer={<><Button variant="ghost" onClick={() => setEdit(false)}>Cancelar</Button><Button loading={save.isPending} disabled={f.title.trim().length < 2} onClick={() => save.mutate(undefined)}>Salvar</Button></>}>
        <div className="flex flex-col gap-4">
          <TextInput label="Título" value={f.title} onChange={(v) => setF({ ...f, title: v })} />
          <SelectInput label="Acesso no plano grátis" value={f.accessTier} onChange={(v) => setF({ ...f, accessTier: v })} options={TIER_OPTIONS} />
          <TextInput label="Cor" type="color" value={f.themeColor} onChange={(v) => setF({ ...f, themeColor: v })} />
        </div>
      </Modal>
      {lesson && <LessonModal l={lesson} slug={slug} onClose={() => setLesson(null)} />}
    </div>
  );
}

function LessonModal({ l, slug, onClose }: { l: LessonRow; slug: string; onClose: () => void }) {
  const { api } = useSession();
  const [f, setF] = useState({ title: l.title, xpReward: l.xpReward as number | '', vimeoUrl: l.vimeoUrl ?? '', videoTitle: l.videoTitle ?? '', passingPct: l.passingPct as number | '', questionCount: (l.questionCount ?? '') as number | '' });
  const save = useAction(() => api.http.patch(`/master/content/lessons/${l.id}`, {
    title: f.title.trim(), xpReward: f.xpReward === '' ? undefined : f.xpReward,
    ...(l.type === 'VIDEO' ? { vimeoUrl: opt(f.vimeoUrl), videoTitle: f.videoTitle.trim() } : {}),
    ...(l.type === 'PRACTICE' ? { passingPct: f.passingPct === '' ? undefined : f.passingPct, questionCount: f.questionCount === '' ? undefined : f.questionCount } : {}),
  }), { success: 'Etapa salva', invalidate: [['master', 'tree', slug]], onDone: onClose });
  return (
    <Modal open title={`${TYPE_LABEL[l.type]}: ${l.title}`} onClose={onClose} wide
      footer={<><Button variant="ghost" onClick={onClose}>Fechar</Button><Button loading={save.isPending} disabled={f.title.trim().length < 2} onClick={() => save.mutate(undefined)}>Salvar</Button></>}>
      <div className="flex flex-col gap-5">
        <FormGrid>
          <TextInput label="Título" value={f.title} onChange={(v) => setF({ ...f, title: v })} />
          <NumberInput label="XP" min={0} value={f.xpReward} onChange={(v) => setF({ ...f, xpReward: v })} />
          {l.type === 'VIDEO' && <TextInput label="Link do Vimeo" value={f.vimeoUrl} onChange={(v) => setF({ ...f, vimeoUrl: v })} placeholder="https://vimeo.com/123456789/abc" />}
          {l.type === 'VIDEO' && <TextInput label="Título do vídeo" value={f.videoTitle} onChange={(v) => setF({ ...f, videoTitle: v })} hint="Usado para ligar pela pasta do Vimeo" />}
          {l.type === 'PRACTICE' && <NumberInput label="Questões por rodada" min={1} value={f.questionCount} onChange={(v) => setF({ ...f, questionCount: v })} hint="Vazio = todas" />}
          {l.type === 'PRACTICE' && <NumberInput label="% mínima para concluir" min={0} max={100} value={f.passingPct} onChange={(v) => setF({ ...f, passingPct: v })} hint="0 = só concluir" />}
        </FormGrid>
        {l.type === 'LESSON' && <SlidesPreview slides={(l.content?.slides ?? []) as Array<{ heading?: string; text?: string; widget?: { type: string } }>} />}
        {l.type === 'PRACTICE' && <QuestionList qs={l.questions} />}
        {l.generators.length > 0 && <p className="text-xs text-dim">Geradores da prática infinita: {l.generators.join(', ')}</p>}
        <p className="text-xs text-dim">O texto das telas e das questões vem do Claude ou da importação. Para mudar o conteúdo, peça ao Claude conectado ou reimporte o arquivo corrigido.</p>
      </div>
    </Modal>
  );
}

function SlidesPreview({ slides }: { slides: Array<{ heading?: string; text?: string; widget?: { type: string } }> }) {
  return (
    <div>
      <h3 className="mb-2 font-extrabold">Telas ({slides.length})</h3>
      <ol className="flex flex-col gap-2">
        {slides.map((s, i) => <li key={i} className="rounded-xl bg-bg px-4 py-3 text-sm"><div className="font-bold">{i + 1}. {s.heading}</div><div className="text-muted">{s.text}</div>{s.widget && <div className="mt-1 text-xs text-amber">Interativo: {s.widget.type}</div>}</li>)}
      </ol>
    </div>
  );
}

/** Resposta certa das questões sem alternativas (campo `data`, ADR 0011). */
type QData = { answer?: unknown; pairs?: Array<{ left: string; right: string }>; items?: Array<{ text: string; group: number }>; groups?: string[]; simulator?: { id?: string } };
function answerOf(type: string, raw: unknown): string | null {
  const d = raw as QData | null | undefined;
  if (!d) return null;
  if (type === 'NUMBER') return String(d.answer);
  if (type === 'ORDER') return ((d.answer as string[]) ?? []).join(' → ');
  if (type === 'BUILD_SENTENCE') return ((d.answer as string[]) ?? []).join(' ');
  if (type === 'MATCH_PAIRS') return (d.pairs ?? []).map((p) => `${p.left} = ${p.right}`).join(' · ');
  if (type === 'CLASSIFY') return (d.items ?? []).map((i) => `${i.text} → ${d.groups?.[i.group] ?? i.group}`).join(' · ');
  if (type === 'SIMULATOR') return `simulador "${d.simulator?.id}" (regra no app)`;
  return null;
}

function QuestionList({ qs }: { qs: Array<{ id: string; type: string; prompt: string; explanation?: string | null; options?: Array<{ id: string; text: string; isCorrect: boolean }>; data?: unknown }> }) {
  if (!qs.length) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-bold text-muted">Ver {qs.length} questões</summary>
      <ol className="mt-2 flex flex-col gap-2">
        {qs.map((q, i) => (
          <li key={q.id} className="rounded-xl bg-bg-2 px-4 py-3 text-sm">
            <div className="font-bold">{i + 1}. {q.prompt} <span className="text-xs font-medium text-dim">· {q.type}</span></div>
            {q.options && q.options.length > 0 && <ul className="mt-1">{q.options.map((o) => <li key={o.id} className={cx(o.isCorrect ? 'font-bold text-green' : 'text-muted')}>{o.isCorrect ? '✓' : '·'} {o.text}</li>)}</ul>}
            {answerOf(q.type, q.data) && <div className="mt-1 font-bold text-green">✓ {answerOf(q.type, q.data)}</div>}
            {q.explanation && <div className="mt-1 text-xs text-dim">{q.explanation}</div>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function CourseForm({ open, onClose, c, invalidate }: { open: boolean; onClose: () => void; c: CourseRow; invalidate: unknown[][] }) {
  const { api } = useSession();
  const templates = useTrailTemplates();
  const [f, setF] = useState({ title: c.title, description: c.description ?? '', meta: c.meta ?? '', estimatedMinutes: (c.estimatedMinutes ?? '') as number | '', accessTier: c.accessTier ?? '', hasCertificate: c.hasCertificate, badgeName: c.badge?.name ?? '', badgeText: c.badge?.text ?? '', badgeIcon: c.badge?.icon ?? 'medal', trailTemplateId: c.trailTemplateId ?? '' });
  const save = useAction(() => api.http.patch(`/master/content/courses/${c.id}`, {
    title: f.title.trim(), description: f.description.trim(), meta: opt(f.meta) ?? null, estimatedMinutes: f.estimatedMinutes === '' ? undefined : f.estimatedMinutes,
    accessTier: f.accessTier || null, hasCertificate: f.hasCertificate, badge: f.badgeName.trim().length >= 2 ? { icon: f.badgeIcon || 'medal', name: f.badgeName.trim(), text: f.badgeText } : null,
    trailTemplateId: f.trailTemplateId || null,
  }), { success: 'Curso salvo', invalidate: [...invalidate, ['master', 'template-check', c.id], ['master', 'trail-templates']], onDone: onClose });
  return (
    <Modal open={open} title={`Editar ${c.title}`} onClose={onClose} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={f.title.trim().length < 2} onClick={() => save.mutate(undefined)}>Salvar</Button></>}>
      <div className="flex flex-col gap-4">
        <FormGrid>
          <TextInput label="Título" required value={f.title} onChange={(v) => setF({ ...f, title: v })} />
          <TextInput label="Linha do card" value={f.meta} onChange={(v) => setF({ ...f, meta: v })} placeholder="4 unidades · do zero" />
          <SelectInput label="Acesso" value={f.accessTier} onChange={(v) => setF({ ...f, accessTier: v })} options={TIER_OPTIONS.map((o) => o.value ? o : { ...o, label: 'Herda do planeta' })} />
          <NumberInput label="Minutos estimados" min={1} value={f.estimatedMinutes} onChange={(v) => setF({ ...f, estimatedMinutes: v })} />
        </FormGrid>
        <TextArea label="Descrição" rows={2} value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        <SelectInput label="Modelo de trilha" value={f.trailTemplateId} onChange={(v) => setF({ ...f, trailTemplateId: v })}
          options={[{ value: '', label: 'Sem modelo' }, ...(templates.data ?? []).filter((t) => t.isActive || t.id === f.trailTemplateId).map((t) => ({ value: t.id, label: t.name }))]}
          hint="O curso é conferido contra a estrutura do modelo (menu Personalização de trilha)." />
        <Toggle label="Emite certificado" checked={f.hasCertificate} onChange={(v) => setF({ ...f, hasCertificate: v })} />
        <h3 className="font-extrabold">Insígnia ao concluir</h3>
        <FormGrid>
          <TextInput label="Nome da insígnia" value={f.badgeName} onChange={(v) => setF({ ...f, badgeName: v })} />
          <TextInput label="Ícone" value={f.badgeIcon} onChange={(v) => setF({ ...f, badgeIcon: v })} />
        </FormGrid>
        <TextArea label="Texto da insígnia" rows={2} value={f.badgeText} onChange={(v) => setF({ ...f, badgeText: v })} />
      </div>
    </Modal>
  );
}

/** Segue o modelo de trilha? Mostra as diferenças ao passar o mouse / tocar. */
function TemplateBadge({ c }: { c: CourseRow }) {
  const { api } = useSession();
  const q = useQuery({
    queryKey: ['master', 'template-check', c.id, c.trailTemplateId, c.units.map((u) => u.lessons.length).join(',')],
    queryFn: () => api.http.get<{ template: { name: string } | null; follows: boolean | null; differences: string[] }>(`/master/trail-templates/check/${c.id}`),
    enabled: !!c.trailTemplateId,
  });
  const [show, setShow] = useState(false);
  if (!c.trailTemplateId || !q.data?.template) return null;
  const ok = q.data.follows;
  return (
    <div className="relative w-full pl-5 sm:w-auto sm:pl-0">
      <button type="button" onClick={() => setShow((v) => !v)} aria-expanded={show}
        className={ok ? 'rounded-full bg-green/15 px-2.5 py-1 text-xs font-bold text-green' : 'rounded-full bg-amber/15 px-2.5 py-1 text-xs font-bold text-amber'}>
        {ok ? '✓' : '⚠'} Modelo: {q.data.template.name}{ok ? '' : ` · ${q.data.differences.length} diferença(s)`}
      </button>
      {show && !ok && (
        <ul className="mt-2 max-w-xl list-disc rounded-2xl border border-amber/30 bg-amber/5 p-3 pl-7 text-xs text-muted">
          {q.data.differences.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </div>
  );
}
