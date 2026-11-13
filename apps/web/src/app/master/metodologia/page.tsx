'use client';

import { useMemo, useState } from 'react';
import { QUESTION_TYPE_LABEL } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle, cx } from '@/components/ui';
import { DataTable, FormGrid, Modal, NumberInput, SearchBox, SelectInput, StatusPill, Tabs, TextArea, TextInput, optEdit, useAction, useConfirm } from '@/components/admin';
import { CAPTURE_FORMATS, FORMAT_LABEL, METHODOLOGY_STATUS, useMethodologies, type Methodology, type MethodologyStatus } from '@/components/master/catalog';

type Filter = 'todas' | 'ativas' | 'inativas' | 'em-breve';
const KEY = [['master', 'methodologies'], ['master', 'trail-templates']];

/** Menu Metodologia: como cada prática funciona (ADR 0013). Guia o Claude e a conferência da importação. */
export default function MetodologiaPage() {
  const q = useMethodologies();
  const [filter, setFilter] = useState<Filter>('todas');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Partial<Methodology> | null>(null);
  const rows = useMemo(() => (q.data ?? []).filter((m) =>
    (filter === 'todas' || (filter === 'ativas' && m.status === 'ACTIVE') || (filter === 'inativas' && m.status === 'INACTIVE') || (filter === 'em-breve' && m.status === 'COMING_SOON'))
    && (!search.trim() || `${m.name} ${m.code} ${m.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [q.data, filter, search]);
  const count = (s: MethodologyStatus) => q.data?.filter((m) => m.status === s).length ?? 0;

  return (
    <>
      <PageTitle title="Metodologia" subtitle="Como cada prática funciona. Só as ativas são oferecidas ao Claude; a importação avisa quando um conteúdo usa uma inativa, em breve ou fora do catálogo."
        actions={<Button onClick={() => setEdit({ status: 'ACTIVE', answerFormats: ['SINGLE_CHOICE'] })}>+ Nova metodologia</Button>} />
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <Tabs active={filter} onChange={setFilter} tabs={[
          { key: 'todas', label: 'Todas', count: q.data?.length }, { key: 'ativas', label: 'Ativas', count: count('ACTIVE') },
          { key: 'inativas', label: 'Inativas', count: count('INACTIVE') }, { key: 'em-breve', label: 'Em breve', count: count('COMING_SOON') },
        ]} />
        <div className="w-full sm:w-64"><SearchBox value={search} onChange={setSearch} placeholder="Buscar metodologia…" /></div>
      </Card>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <DataTable rows={rows} rowKey={(m) => m.id} onRowClick={(m) => setEdit(m)} empty="Nenhuma metodologia com esse filtro." minWidth={820}
          columns={[
            { key: 'n', label: 'Metodologia', render: (m) => (
              <div>
                <div className="font-bold">{m.capture ? '🎙️ ' : ''}{m.name}</div>
                <div className="font-mono text-xs text-dim">{m.code}{m.isSystem ? ' · da plataforma' : ''}</div>
                {m.description && <div className="mt-0.5 max-w-md text-xs text-muted">{m.description}</div>}
              </div>
            ) },
            { key: 'f', label: 'Resposta do aluno', render: (m) => <div className="flex flex-wrap gap-1">{m.answerFormats.map((f) => <span key={f} className="rounded-lg bg-white/5 px-2 py-0.5 text-xs font-bold text-muted">{FORMAT_LABEL[f] ?? f}</span>)}</div> },
            { key: 'u', label: 'Em uso', className: 'text-right', render: (m) => <span className={cx('text-sm', m.questionCount ? 'font-bold' : 'text-dim')}>{m.questionCount} questões</span> },
            { key: 's', label: 'Situação', render: (m) => <StatusPill status={METHODOLOGY_STATUS[m.status].pill} label={METHODOLOGY_STATUS[m.status].label} /> },
          ]} />
      )}
      {edit && <MethodologyModal m={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function MethodologyModal({ m, onClose }: { m: Partial<Methodology>; onClose: () => void }) {
  const { api } = useSession();
  const [ask, confirmNode] = useConfirm();
  const editing = !!m.id;
  const [f, setF] = useState({
    code: m.code ?? '', name: m.name ?? '', description: m.description ?? '', guidance: m.guidance ?? '',
    status: (m.status ?? 'ACTIVE') as MethodologyStatus, answerFormats: m.answerFormats ?? [],
    timeLimit: (m.defaultTimeLimitMs ? Math.round(m.defaultTimeLimitMs / 1000) : '') as number | '',
  });
  const capture = f.answerFormats.some((x) => (CAPTURE_FORMATS as readonly string[]).includes(x));
  const toggleFormat = (x: string) => setF({ ...f, answerFormats: f.answerFormats.includes(x) ? f.answerFormats.filter((y) => y !== x) : [...f.answerFormats, x] });
  const save = useAction(() => {
    const body = {
      name: f.name.trim(), description: optEdit(f.description, editing), guidance: optEdit(f.guidance, editing), status: f.status, answerFormats: f.answerFormats,
      defaultTimeLimitMs: f.timeLimit === '' ? (editing ? null : undefined) : f.timeLimit * 1000,
    };
    return editing ? api.http.patch(`/master/methodologies/${m.id}`, body) : api.http.post('/master/methodologies', { ...body, code: f.code.trim() });
  }, { success: editing ? 'Metodologia salva' : 'Metodologia criada', invalidate: KEY, onDone: onClose });
  const remove = useAction(() => api.http.del(`/master/methodologies/${m.id}`), { success: 'Metodologia excluída', invalidate: KEY, onDone: onClose });
  const invalid = f.name.trim().length < 2 || !f.answerFormats.length || (!editing && !/^[a-z][a-z0-9_]{1,40}$/.test(f.code.trim()));

  return (
    <Modal open title={editing ? `Metodologia: ${m.name}` : 'Nova metodologia'} onClose={onClose} wide
      footer={<>
        {editing && !m.isSystem && <Button variant="ghost" className="mr-auto text-red" loading={remove.isPending} onClick={async () => { if (await ask({ title: 'Excluir metodologia?', text: m.questionCount ? `${m.questionCount} questões usam esta metodologia: a exclusão será recusada. Desative-a.` : 'Ela sai do catálogo.', confirm: 'Excluir', danger: true })) remove.mutate(undefined); }}>Excluir</Button>}
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate(undefined)}>Salvar</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <FormGrid>
          <TextInput label="Nome" required value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Ex.: Mito ou verdade" />
          <TextInput label="Código" value={f.code} disabled={editing} onChange={(v) => setF({ ...f, code: v.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
            hint={editing ? 'O código não muda: é o que as questões guardam.' : 'Minúsculas e _ (ex.: mito_verdade). É o "methodology" das questões.'} />
        </FormGrid>
        <TextArea label="Como funciona (para o time)" rows={2} value={f.description} onChange={(v) => setF({ ...f, description: v })} placeholder="O que o aluno vê e faz nesta prática." />
        <div>
          <div className="mb-2 text-sm font-bold">Resposta do aluno</div>
          <div className="flex flex-wrap gap-2">
            {Object.keys(QUESTION_TYPE_LABEL).map((x) => <FormatChip key={x} label={FORMAT_LABEL[x]} on={f.answerFormats.includes(x)} onClick={() => toggleFormat(x)} />)}
          </div>
          <div className="mb-2 mt-3 text-sm font-bold">Captura <span className="font-medium text-dim">(em breve no app)</span></div>
          <div className="flex flex-wrap gap-2">
            {CAPTURE_FORMATS.map((x) => <FormatChip key={x} label={FORMAT_LABEL[x]} on={f.answerFormats.includes(x)} onClick={() => {
              const adding = !f.answerFormats.includes(x);
              // captura ainda não existe no app: ao marcar, a situação vira "Em breve"
              setF({ ...f, answerFormats: adding ? [...f.answerFormats, x] : f.answerFormats.filter((y) => y !== x), status: adding && f.status === 'ACTIVE' ? 'COMING_SOON' : f.status });
            }} />)}
          </div>
        </div>
        <TextArea label="Orientação para o Claude" rows={3} value={f.guidance} onChange={(v) => setF({ ...f, guidance: v })} placeholder="Ex.: Afirmação curta e verificável; a opção errada explica o porquê." hint="O Claude recebe este texto ao criar questões desta metodologia." />
        <FormGrid>
          <SelectInput label="Situação" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[
            ...(capture ? [] : [{ value: 'ACTIVE' as const, label: 'Ativa (oferecida ao Claude)' }]),
            { value: 'INACTIVE' as const, label: 'Inativa (não oferecida; o que existe continua)' },
            { value: 'COMING_SOON' as const, label: 'Em breve (ainda não existe no app)' },
          ]} hint={capture ? 'Captura por voz, foto ou vídeo fica "Em breve" até o app capturar.' : undefined} />
          <NumberInput label="Tempo padrão por questão (segundos)" min={1} max={600} value={f.timeLimit} onChange={(v) => setF({ ...f, timeLimit: v })} hint="Vazio = sem tempo" />
        </FormGrid>
      </div>
      {confirmNode}
    </Modal>
  );
}

function FormatChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cx('rounded-xl border px-3 py-1.5 text-sm font-bold transition', on ? 'border-amber bg-amber/15 text-ink' : 'border-line text-muted hover:border-amber/50')}>{on ? '✓ ' : ''}{label}</button>;
}
