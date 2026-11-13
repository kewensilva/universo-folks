'use client';

import { useState } from 'react';
import { useSession } from '@/lib/session';
import { Button, Card, Empty, ErrorBox, Loading, PageTitle, cx } from '@/components/ui';
import { FormGrid, Modal, NumberInput, StatusPill, TextArea, TextInput, Toggle, optEdit, useAction, useConfirm } from '@/components/admin';
import { STEP, TemplatePreview, countLabel, useMethodologies, useTrailTemplates, type StepKind, type TrailStep, type TrailStructure, type TrailTemplate } from '@/components/master/catalog';

const KEY = [['master', 'trail-templates']];
const EMPTY: TrailStructure = { unitSteps: [{ kind: 'VIDEO', min: 1, max: null }, { kind: 'PRACTICE', min: 1, max: null }], closingSteps: null, closingTitle: null, minUnits: null, maxUnits: null, exam: true, methodologies: [] };

/** Menu Personalização de trilha: modelos de estrutura que o Claude segue e a importação confere (ADR 0013). */
export default function PersonalizacaoTrilhaPage() {
  const q = useTrailTemplates();
  const [edit, setEdit] = useState<Partial<TrailTemplate> | null>(null);
  return (
    <>
      <PageTitle title="Personalização de trilha" subtitle="Modelos de como a trilha é montada. Ao pedir um curso, diga ao Claude qual modelo seguir; a importação avisa quando um curso foge do modelo."
        actions={<Button onClick={() => setEdit({ isActive: true, structure: EMPTY })}>+ Novo modelo</Button>} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : !q.data!.length ? (
        <Empty title="Nenhum modelo ainda">Crie o primeiro modelo de trilha.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data!.map((t) => (
            <Card key={t.id} className={cx('flex flex-col gap-4', !t.isActive && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-extrabold">{t.name}</h2>
                  <div className="font-mono text-xs text-dim">{t.code}</div>
                  {t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}
                </div>
                <StatusPill status={t.isActive ? 'ACTIVE' : 'DISABLED'} label={t.isActive ? 'Ativo' : 'Inativo'} />
              </div>
              <div className="rounded-2xl bg-bg-2 p-4"><TemplatePreview s={t.structure} /></div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dim">
                <span>{t.courseCount} curso(s) seguem este modelo{t.structure.methodologies.length ? ` · ${t.structure.methodologies.length} metodologia(s) permitida(s)` : ' · qualquer metodologia ativa'}</span>
                <Button variant="ghost" onClick={() => setEdit(t)}>Editar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit && <TemplateModal t={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function TemplateModal({ t, onClose }: { t: Partial<TrailTemplate>; onClose: () => void }) {
  const { api } = useSession();
  const [ask, confirmNode] = useConfirm();
  const meth = useMethodologies();
  const editing = !!t.id;
  const [f, setF] = useState({ name: t.name ?? '', code: t.code ?? '', description: t.description ?? '', isActive: t.isActive ?? true });
  const [s, setS] = useState<TrailStructure>(() => structuredClone(t.structure ?? EMPTY));
  const save = useAction(() => {
    const body = { name: f.name.trim(), description: optEdit(f.description, editing), isActive: f.isActive, structure: s };
    return editing ? api.http.patch(`/master/trail-templates/${t.id}`, body) : api.http.post('/master/trail-templates', { ...body, code: f.code.trim() || undefined });
  }, { success: editing ? 'Modelo salvo' : 'Modelo criado', invalidate: KEY, onDone: onClose });
  const remove = useAction(() => api.http.del(`/master/trail-templates/${t.id}`), { success: 'Modelo excluído', invalidate: KEY, onDone: onClose });
  const hasClosing = !!s.closingSteps?.length;
  const invalid = f.name.trim().length < 2 || !s.unitSteps.length || (hasClosing && !s.closingSteps!.length);
  const active = (meth.data ?? []).filter((m) => m.status === 'ACTIVE');

  return (
    <Modal open title={editing ? `Modelo: ${t.name}` : 'Novo modelo de trilha'} onClose={onClose} wide
      footer={<>
        {editing && <Button variant="ghost" className="mr-auto text-red" loading={remove.isPending} onClick={async () => { if (await ask({ title: 'Excluir modelo?', text: t.courseCount ? `${t.courseCount} curso(s) seguem este modelo: a exclusão será recusada. Desative-o.` : 'O modelo sai da lista.', confirm: 'Excluir', danger: true })) remove.mutate(undefined); }}>Excluir</Button>}
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate(undefined)}>Salvar</Button>
      </>}>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-4">
          <FormGrid>
            <TextInput label="Nome" required value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Ex.: Vídeo e prática em cada unidade" />
            <TextInput label="Código" value={f.code} disabled={editing} onChange={(v) => setF({ ...f, code: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} hint={editing ? 'É o que o Claude informa no curso.' : 'Vazio = gerado pelo nome. O Claude usa este código.'} />
          </FormGrid>
          <TextArea label="Descrição" rows={2} value={f.description} onChange={(v) => setF({ ...f, description: v })} />

          <StepsEditor title="Cada unidade" steps={s.unitSteps} onChange={(unitSteps) => setS({ ...s, unitSteps })} />

          <Toggle label="Unidade final com estrutura própria" checked={hasClosing} hint="Ex.: unidades só com vídeo e, no fim, uma unidade com a prática."
            onChange={(v) => setS({ ...s, closingSteps: v ? [{ kind: 'PRACTICE', min: 1, max: null }] : null, closingTitle: v ? (s.closingTitle || 'Prática final') : null })} />
          {hasClosing && (
            <div className="flex flex-col gap-3 rounded-2xl border border-line p-3">
              <TextInput label="Nome da unidade final" value={s.closingTitle ?? ''} onChange={(v) => setS({ ...s, closingTitle: v })} />
              <StepsEditor title="Unidade final" steps={s.closingSteps!} onChange={(closingSteps) => setS({ ...s, closingSteps })} />
            </div>
          )}

          <FormGrid>
            <NumberInput label="Mínimo de unidades" min={1} max={50} value={s.minUnits ?? ''} onChange={(v) => setS({ ...s, minUnits: v === '' ? null : v })} hint="Vazio = livre" />
            <NumberInput label="Máximo de unidades" min={1} max={50} value={s.maxUnits ?? ''} onChange={(v) => setS({ ...s, maxUnits: v === '' ? null : v })} hint={hasClosing ? 'Sem contar a unidade final' : 'Vazio = livre'} />
          </FormGrid>
          <Toggle label="Termina com desafio final (certificação)" checked={s.exam} onChange={(v) => setS({ ...s, exam: v })} />

          <div>
            <div className="text-sm font-bold">Metodologias permitidas nas práticas</div>
            <p className="mb-2 text-xs text-dim">Nenhuma marcada = qualquer metodologia ativa.</p>
            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
              {active.map((m) => {
                const on = s.methodologies.includes(m.code);
                return <button key={m.code} type="button" aria-pressed={on} onClick={() => setS({ ...s, methodologies: on ? s.methodologies.filter((c) => c !== m.code) : [...s.methodologies, m.code] })}
                  className={cx('rounded-lg border px-2.5 py-1 text-xs font-bold', on ? 'border-amber bg-amber/15 text-ink' : 'border-line text-muted hover:border-amber/50')}>{on ? '✓ ' : ''}{m.name}</button>;
              })}
            </div>
          </div>
          <Toggle label="Modelo ativo (oferecido ao Claude)" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
        </div>
        <div className="lg:sticky lg:top-0 lg:self-start">
          <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-amber">Prévia da trilha</div>
          <div className="rounded-2xl bg-bg-2 p-4"><TemplatePreview s={s} units={3} /></div>
          <p className="mt-3 text-xs text-dim">Etapas com borda tracejada são opcionais. Várias etapas seguidas do mesmo tipo (ex.: 3 vídeos) contam como um bloco.</p>
        </div>
      </div>
      {confirmNode}
    </Modal>
  );
}

const KINDS: StepKind[] = ['VIDEO', 'LESSON', 'PRACTICE', 'INTERACTIVE'];

/** Lista de etapas em ordem: tipo, quantidade (mín/máx), subir/descer, remover. */
function StepsEditor({ title, steps, onChange }: { title: string; steps: TrailStep[]; onChange: (s: TrailStep[]) => void }) {
  const set = (i: number, p: Partial<TrailStep>) => onChange(steps.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) => { const n = [...steps]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n); };
  return (
    <div>
      <div className="mb-2 text-sm font-bold">{title} <span className="font-medium text-dim">— etapas na ordem</span></div>
      <div className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-bg-2 p-2.5">
            <span className="w-5 text-center text-xs font-extrabold text-dim">{i + 1}</span>
            <select aria-label="Tipo da etapa" value={s.kind} onChange={(e) => set(i, { kind: e.target.value as StepKind })}
              className="rounded-xl border border-line bg-bg px-2.5 py-1.5 text-sm font-bold outline-none focus:border-amber">
              {KINDS.map((k) => <option key={k} value={k}>{STEP[k].icon} {STEP[k].label}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-muted">mín
              <input type="number" min={0} max={20} value={s.min} onChange={(e) => set(i, { min: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })} className="w-14 rounded-lg border border-line bg-bg px-2 py-1 text-sm text-ink outline-none focus:border-amber" />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted">máx
              <input type="number" min={1} max={50} placeholder="∞" value={s.max ?? ''} onChange={(e) => set(i, { max: e.target.value === '' ? null : Math.max(1, Math.min(50, Number(e.target.value))) })} className="w-14 rounded-lg border border-line bg-bg px-2 py-1 text-sm text-ink outline-none focus:border-amber" />
            </label>
            <span className="text-xs text-dim">({countLabel(s)})</span>
            <div className="ml-auto flex gap-1">
              <button type="button" aria-label="Subir etapa" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-white/5 disabled:opacity-30">↑</button>
              <button type="button" aria-label="Descer etapa" disabled={i === steps.length - 1} onClick={() => move(i, 1)} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-white/5 disabled:opacity-30">↓</button>
              <button type="button" aria-label="Remover etapa" disabled={steps.length === 1} onClick={() => onChange(steps.filter((_, k) => k !== i))} className="rounded-lg px-2 py-1 text-sm text-red hover:bg-red/10 disabled:opacity-30">✕</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...steps, { kind: 'PRACTICE', min: 1, max: null }])} className="mt-2 text-sm font-bold text-amber">+ Adicionar etapa</button>
    </div>
  );
}
