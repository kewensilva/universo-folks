'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { fmt, type CompanyPerson, type Page } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, Progress, cx } from '../ui';
import { DataTable, Field, Modal, SearchBox, SelectInput, StatusPill, TextArea, TextInput, opt, useAction, useConfirm, useToast } from '../admin';
import { useDepartments } from './departments';
import { ROLE_LABEL, type Department, type Member, type MemberDashboard } from './types';

const TRACK_TONE: Record<string, string> = { DONE: 'text-green', LATE: 'text-red', NOT_STARTED: 'text-dim', INVITED: 'text-blue', ON_TRACK: 'text-ink' };

/**
 * Pessoas da empresa: convidar (ocupa licença), importar planilha, editar papel/setores/situação,
 * reenviar convite, lembrete por e-mail e remover. Cotas de licença são do MASTER.
 */
export function CompanyPeople({ tenantId }: { tenantId: string }) {
  const { api } = useSession();
  const toast = useToast();
  const [ask, confirmNode] = useConfirm();
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invite, setInvite] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [open, setOpen] = useState<Member | null>(null);
  const departments = useDepartments(tenantId);
  const members = useQuery({ queryKey: ['company', tenantId, 'members'], queryFn: () => api.http.get<Page<Member>>(`/companies/${tenantId}/members`, { pageSize: 200 }) });
  const people = useQuery({ queryKey: ['company', tenantId, 'people'], queryFn: () => api.company(tenantId).people() });
  const track = useMemo(() => new Map((people.data ?? []).map((p: CompanyPerson) => [p.membershipId, p])), [people.data]);
  const key = [['company', tenantId], ['dash', 'company', tenantId]];

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (members.data?.items ?? []).filter((m) =>
      (!s || m.user.name.toLowerCase().includes(s) || m.user.email.toLowerCase().includes(s)) &&
      (!dept || m.departments.some((d) => d.id === dept)) && (!role || m.role === role) && (!status || m.status === status));
  }, [members.data, search, dept, role, status]);

  // A API só lembra quem já aceitou o convite e tem trilha pendente; convidados recebem "Reenviar convite".
  const remind = useAction(async (ids: string[]) => ({ ids, r: await api.http.post<{ sent: number }>(`/companies/${tenantId}/reminders`, ids.length ? { membershipIds: ids } : {}) }), {
    success: ({ ids, r }) => r.sent === ids.length
      ? `Lembrete enviado para ${r.sent} pessoa(s)`
      : `Lembrete enviado para ${r.sent} de ${ids.length}. Quem ainda não aceitou o convite ou não tem trilha pendente não recebe (para convidados, use "Reenviar convite").`,
    onDone: () => setSelected(new Set()),
  });

  if (members.isLoading) return <Loading />;
  if (members.error) return <ErrorBox error={members.error} onRetry={() => members.refetch()} />;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.membershipId));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por nome ou e-mail…" />
        <select aria-label="Departamento" value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm"><option value="">Todos os setores</option>{(departments.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select aria-label="Papel" value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm"><option value="">Todos os papéis</option><option value="COLABORADOR_CLIENTE">Colaboradores</option><option value="ADMIN_CLIENTE">Administradores</option></select>
        <select aria-label="Situação" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-line bg-bg-2 px-3 py-2.5 text-sm"><option value="">Todas as situações</option><option value="ACTIVE">Ativos</option><option value="INVITED">Convidados</option><option value="DISABLED">Desativados</option></select>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setBulk(true)}>Importar planilha</Button>
          <Button onClick={() => setInvite(true)}>+ Convidar pessoa</Button>
        </div>
      </div>
      {selected.size > 0 && (
        <Card className="mb-3 flex flex-wrap items-center justify-between gap-2 border-amber/40 py-3">
          <span className="text-sm font-bold">{selected.size} selecionada(s)</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
            <Button loading={remind.isPending} onClick={() => remind.mutate([...selected])}>Enviar lembrete por e-mail</Button>
          </div>
        </Card>
      )}
      <DataTable rows={rows} rowKey={(m) => m.membershipId} onRowClick={setOpen} empty="Ninguém encontrado com esses filtros."
        columns={[
          { key: 'sel', label: '', className: 'w-8', render: (m) => <input type="checkbox" aria-label={`Selecionar ${m.user.name}`} checked={selected.has(m.membershipId)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(m.membershipId)} /> },
          { key: 'n', label: 'Pessoa', render: (m) => <div><div className="font-bold">{m.user.name}{m.role === 'ADMIN_CLIENTE' && <span className="ml-2 rounded-full bg-purple/20 px-2 py-0.5 text-[10px] font-extrabold text-purple">ADMIN</span>}</div><div className="text-xs text-dim">{m.user.email}{m.jobTitle ? ` · ${m.jobTitle}` : ''}</div></div> },
          { key: 'd', label: 'Setores', render: (m) => <span className="text-muted">{m.departments.map((d) => d.name).join(', ') || '—'}</span> },
          { key: 's', label: 'Acesso', render: (m) => <StatusPill status={m.status} /> },
          { key: 't', label: 'Trilhas', render: (m) => { const p = track.get(m.membershipId); return p ? <span className={cx('font-bold', TRACK_TONE[p.status] ?? 'text-muted')}>{p.statusLabel}</span> : '—'; } },
          { key: 'p', label: 'Conclusão', className: 'w-40', render: (m) => <div><div className="text-xs font-bold">{fmt.pct(m.completionPct)} · {m.coursesCompleted}/{m.coursesStarted} cursos</div><Progress value={m.completionPct} className="mt-1" /></div> },
          { key: 'l', label: 'Último acesso', render: (m) => <span className="text-muted">{fmt.relativeDays(m.user.lastLoginAt)}</span> },
        ]} />
      <div className="mt-3 flex items-center justify-between text-xs text-dim">
        <span>{rows.length} de {members.data?.total ?? 0} pessoas</span>
        {rows.length > 0 && <button className="font-bold text-muted underline" onClick={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.membershipId)))}>{allSelected ? 'Desmarcar todos' : 'Selecionar todos os filtrados'}</button>}
      </div>

      <InviteModal open={invite} onClose={() => setInvite(false)} tenantId={tenantId} departments={departments.data ?? []} invalidate={key} />
      <BulkModal open={bulk} onClose={() => setBulk(false)} tenantId={tenantId} departments={departments.data ?? []} invalidate={key} />
      {open && <MemberModal member={open} tenantId={tenantId} departments={departments.data ?? []} invalidate={key} onClose={() => setOpen(null)} ask={ask} toast={toast} />}
      {confirmNode}
    </>
  );
}

function DeptPicker({ departments, value, onChange }: { departments: Department[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!departments.length) return <p className="text-xs text-dim">A empresa ainda não tem departamentos.</p>;
  return (
    <Field label="Setores">
      {() => (
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => {
            const on = value.includes(d.id);
            return <button type="button" key={d.id} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== d.id) : [...value, d.id])} className={cx('rounded-full border px-3 py-1 text-sm font-bold', on ? 'border-amber bg-amber/15 text-ink' : 'border-line text-muted')}>{d.name}</button>;
          })}
        </div>
      )}
    </Field>
  );
}

function InviteModal({ open, onClose, tenantId, departments, invalidate }: { open: boolean; onClose: () => void; tenantId: string; departments: Department[]; invalidate: unknown[][] }) {
  const { api } = useSession();
  const [f, setF] = useState({ name: '', email: '', role: 'COLABORADOR_CLIENTE', jobTitle: '', departmentIds: [] as string[] });
  const save = useAction(() => api.http.post(`/companies/${tenantId}/members`, { name: f.name.trim(), email: f.email.trim(), role: f.role, jobTitle: opt(f.jobTitle), departmentIds: f.departmentIds }),
    { success: `Convite enviado para ${f.email}`, invalidate, onDone: () => { setF({ name: '', email: '', role: 'COLABORADOR_CLIENTE', jobTitle: '', departmentIds: [] }); onClose(); } });
  return (
    <Modal open={open} title="Convidar pessoa" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={f.name.trim().length < 2 || !/.+@.+\..+/.test(f.email)} onClick={() => save.mutate(undefined)}>Enviar convite</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">A pessoa recebe um e-mail para criar a senha. O convite já ocupa uma licença. Uma pessoa só pode estar em uma empresa.</p>
        <TextInput label="Nome" required autoFocus value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <TextInput label="E-mail" type="email" required value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput label="Papel" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={[{ value: 'COLABORADOR_CLIENTE', label: 'Colaborador' }, { value: 'ADMIN_CLIENTE', label: 'Administrador' }]} />
          <TextInput label="Cargo" value={f.jobTitle} onChange={(v) => setF({ ...f, jobTitle: v })} />
        </div>
        <DeptPicker departments={departments} value={f.departmentIds} onChange={(v) => setF({ ...f, departmentIds: v })} />
      </div>
    </Modal>
  );
}

/** Planilha colada: "nome;e-mail;setor;cargo" (separador ; ou , ou tab). Setor pelo nome. */
function BulkModal({ open, onClose, tenantId, departments, invalidate }: { open: boolean; onClose: () => void; tenantId: string; departments: Department[]; invalidate: unknown[][] }) {
  const { api } = useSession();
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ created: unknown[]; errors: Array<{ email: string; error: string }> } | null>(null);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const parsed = useMemo(() => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[;\t,]/).map((c) => c.trim()))
    .filter((c) => c.length >= 2 && /@/.test(c[1]) && !/^nome$/i.test(c[0]))
    .map(([name, email, setor, cargo]) => ({ name, email, jobTitle: cargo || undefined, departmentIds: setor ? departments.filter((d) => norm(d.name) === norm(setor)).map((d) => d.id) : [] })), [text, departments]);
  const save = useAction(() => api.http.post<{ created: unknown[]; errors: Array<{ email: string; error: string }> }>(`/companies/${tenantId}/members/bulk`, { members: parsed }),
    { success: (r) => `${r.created.length} convite(s) enviado(s)`, invalidate, onDone: (r) => setResult(r) });
  const close = () => { setText(''); setResult(null); onClose(); };
  return (
    <Modal open={open} title="Importar pessoas por planilha" onClose={close} wide
      footer={result ? <Button onClick={close}>Fechar</Button> : <><Button variant="ghost" onClick={close}>Cancelar</Button><Button loading={save.isPending} disabled={!parsed.length} onClick={() => save.mutate(undefined)}>Convidar {parsed.length || ''}</Button></>}>
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="font-bold text-green">{result.created.length} convite(s) enviado(s).</p>
          {result.errors.length > 0 && <div><p className="font-bold text-red">{result.errors.length} não entraram:</p><ul className="mt-1 text-sm">{result.errors.map((e) => <li key={e.email}><b>{e.email}</b>: {e.error}</li>)}</ul></div>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">Cole as linhas da planilha no formato <b className="text-ink">nome; e-mail; setor; cargo</b> (setor e cargo são opcionais). O setor precisa ter o mesmo nome de um departamento.</p>
          <TextArea label="Linhas" rows={10} mono value={text} onChange={setText} placeholder={'Maria Souza; maria@empresa.com; Comercial; Vendedora\nJoão Lima; joao@empresa.com; Operações'} />
          <p className="text-xs text-dim">{parsed.length} pessoa(s) reconhecida(s){parsed.some((p) => !p.departmentIds.length) ? ' · algumas sem setor correspondente' : ''}</p>
        </div>
      )}
    </Modal>
  );
}

function MemberModal({ member, tenantId, departments, invalidate, onClose, ask, toast }: { member: Member; tenantId: string; departments: Department[]; invalidate: unknown[][]; onClose: () => void; ask: ReturnType<typeof useConfirm>[0]; toast: ReturnType<typeof useToast> }) {
  const { api } = useSession();
  const [f, setF] = useState({ role: member.role, status: member.status, jobTitle: member.jobTitle ?? '', departmentIds: member.departments.map((d) => d.id) });
  const dash = useQuery({ queryKey: ['company', tenantId, 'member', member.membershipId], queryFn: () => api.http.get<MemberDashboard>(`/dashboards/companies/${tenantId}/members/${member.membershipId}`) });
  const save = useAction(() => api.http.patch(`/companies/${tenantId}/members/${member.membershipId}`, { role: f.role, status: f.status === 'INVITED' ? undefined : f.status, jobTitle: f.jobTitle.trim(), departmentIds: f.departmentIds }), { success: 'Dados atualizados', invalidate, onDone: onClose });
  const resend = useAction(() => api.http.post(`/companies/${tenantId}/members/${member.membershipId}/resend-invite`), { success: 'Convite reenviado' });
  const remove = useAction(() => api.http.del(`/companies/${tenantId}/members/${member.membershipId}`), { success: `${member.user.name} saiu da empresa`, invalidate, onDone: onClose });
  void toast;
  return (
    <Modal open title={member.user.name} onClose={onClose} wide
      footer={<>
        <Button variant="danger" onClick={async () => { if (await ask({ title: 'Remover da empresa?', text: <>A licença de <b>{member.user.name}</b> é liberada e a pessoa perde o acesso aos cursos da empresa. O histórico fica guardado.</>, confirm: 'Remover', danger: true })) remove.mutate(undefined); }}>Remover da empresa</Button>
        {member.status === 'INVITED' && <Button variant="ghost" loading={resend.isPending} onClick={() => resend.mutate(undefined)}>Reenviar convite</Button>}
        <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Salvar</Button>
      </>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-4">
          <div className="text-sm text-muted">{member.user.email}<br />Último acesso: {fmt.relativeDays(member.user.lastLoginAt)}{member.user.gamification ? ` · nível ${member.user.gamification.level} · ${fmt.num(member.user.gamification.totalXp)} XP` : ''}</div>
          <SelectInput label="Papel" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={[{ value: 'COLABORADOR_CLIENTE', label: ROLE_LABEL.COLABORADOR_CLIENTE }, { value: 'ADMIN_CLIENTE', label: ROLE_LABEL.ADMIN_CLIENTE }]} />
          {member.status !== 'INVITED' && <SelectInput label="Acesso" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: 'ACTIVE', label: 'Ativo' }, { value: 'DISABLED', label: 'Desativado (libera a licença)' }]} />}
          <TextInput label="Cargo" value={f.jobTitle} onChange={(v) => setF({ ...f, jobTitle: v })} />
          <DeptPicker departments={departments} value={f.departmentIds} onChange={(v) => setF({ ...f, departmentIds: v })} />
        </div>
        <div>
          <h3 className="mb-2 font-extrabold">Cursos</h3>
          {dash.isLoading ? <Loading /> : dash.error ? <ErrorBox error={dash.error} /> : (dash.data!.courses.length === 0 ? <p className="text-sm text-muted">Nenhum curso liberado ou iniciado.</p> : (
            <ul className="flex flex-col gap-3">
              {dash.data!.courses.map((c) => (
                <li key={c.courseId}>
                  <div className="flex justify-between gap-2 text-sm"><span className="font-bold">{c.course} <span className="font-medium text-dim">· {c.planet}</span></span><span className="text-muted">{fmt.pct(c.progressPct)}</span></div>
                  <Progress value={c.progressPct} className="mt-1" color={c.completedAt ? 'var(--color-green)' : undefined} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </Modal>
  );
}
