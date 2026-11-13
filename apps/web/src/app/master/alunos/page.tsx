'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fmt, type Page } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { DataTable, Modal, Pagination, SearchBox, SectionTitle, StatusPill, Tabs, useAction, useConfirm } from '@/components/admin';
import { GrantModal, PaymentsTable, SubscriptionsTable, type Subscription } from '@/components/master/billing';

interface UserRow { id: string; name: string; email: string; status: 'ACTIVE' | 'DISABLED'; platformRole: string; createdAt: string; lastLoginAt?: string | null; gamification?: { totalXp: number; level: number; currentStreak: number } | null; memberships: Array<{ role: string; tenant: { id: string; tradeName: string } }>; subscriptions: Subscription[] }
interface UserDetail extends UserRow { displayName?: string | null; enrollments: Array<{ courseId?: string; progressPct?: number; status?: string; course?: { title: string } }>; certificates: Array<{ code: string; issuedAt?: string; course?: { title: string } | null }> }

type Segment = 'all' | 'b2c' | 'premium';

/** Todas as pessoas da plataforma: alunos B2C (grátis e Premium) e colaboradores de empresas. */
export default function AlunosPage() {
  const { api } = useSession();
  const [segment, setSegment] = useState<Segment>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['master', 'users', segment, search, page], queryFn: () => api.http.get<Page<UserRow>>('/master/users', { segment, search, page, pageSize: 25 }) });
  return (
    <>
      <PageTitle title="Pessoas e alunos" subtitle="Alunos individuais (B2C) e colaboradores das empresas. Suporte, Premium e bloqueio de acesso." />
      <Tabs active={segment} onChange={(s) => { setSegment(s); setPage(1); }} tabs={[{ key: 'all', label: 'Todos' }, { key: 'b2c', label: 'Só individuais (B2C)' }, { key: 'premium', label: 'Premium' }]} />
      <div className="mb-4"><SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar por nome ou e-mail…" /></div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <DataTable rows={q.data!.items} rowKey={(u) => u.id} onRowClick={(u) => setOpen(u.id)} empty="Ninguém encontrado."
            columns={[
              { key: 'n', label: 'Pessoa', render: (u) => <div><div className="font-bold">{u.name}{u.platformRole === 'MASTER_FOLKS' && <span className="ml-2 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-extrabold text-amber">MASTER</span>}</div><div className="text-xs text-dim">{u.email}</div></div> },
              { key: 'e', label: 'Empresa', render: (u) => <span className="text-muted">{u.memberships[0]?.tenant.tradeName ?? 'Individual'}</span> },
              { key: 'p', label: 'Plano', render: (u) => u.subscriptions.length ? <span className="font-bold text-gold">👑 {u.subscriptions[0].plan?.name ?? 'Premium'}</span> : <span className="text-dim">{u.memberships.length ? 'Pela empresa' : 'Grátis'}</span> },
              { key: 'x', label: 'Nível', render: (u) => u.gamification ? `${u.gamification.level} · ${fmt.num(u.gamification.totalXp)} XP` : '—' },
              { key: 's', label: 'Acesso', render: (u) => <StatusPill status={u.status} /> },
              { key: 'l', label: 'Último acesso', render: (u) => <span className="text-muted">{fmt.relativeDays(u.lastLoginAt)}</span> },
              { key: 'c', label: 'Cadastro', render: (u) => <span className="text-muted">{fmt.date(u.createdAt)}</span> },
            ]} />
          <Pagination page={q.data!.page} totalPages={q.data!.totalPages} total={q.data!.total} onPage={setPage} />
        </>
      )}
      {open && <UserModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function UserModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { api, user: me } = useSession();
  const [ask, node] = useConfirm();
  const [grant, setGrant] = useState(false);
  const q = useQuery({ queryKey: ['master', 'user', id], queryFn: () => api.http.get<UserDetail>(`/master/users/${id}`) });
  const key = [['master', 'user', id], ['master', 'users'], ['master', 'payments']];
  const setStatus = useAction((status: 'ACTIVE' | 'DISABLED') => api.http.patch(`/master/users/${id}`, { status }), { success: 'Acesso atualizado', invalidate: key });
  const u = q.data;
  return (
    <Modal open title={u?.name ?? 'Pessoa'} onClose={onClose} wide
      footer={u && <>
        {u.id !== me?.id && (u.status === 'ACTIVE'
          ? <Button variant="danger" loading={setStatus.isPending} onClick={async () => { if (await ask({ title: 'Desativar acesso?', text: `${u.name} não consegue mais entrar e todas as sessões são encerradas. Nada é apagado.`, confirm: 'Desativar', danger: true })) setStatus.mutate('DISABLED'); }}>Desativar acesso</Button>
          : <Button variant="ghost" loading={setStatus.isPending} onClick={() => setStatus.mutate('ACTIVE')}>Reativar acesso</Button>)}
        {!u.memberships.length && <Button onClick={() => setGrant(true)}>Conceder Premium</Button>}
      </>}>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : u && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><div className="text-dim">E-mail</div><div className="font-bold">{u.email}</div></div>
            <div><div className="text-dim">Vínculo</div><div className="font-bold">{u.memberships.map((m) => `${m.tenant.tradeName} (${m.role === 'ADMIN_CLIENTE' ? 'admin' : 'colaborador'})`).join(', ') || 'Individual (B2C)'}</div></div>
            <div><div className="text-dim">Situação</div><StatusPill status={u.status} /></div>
            <div><div className="text-dim">Cadastro</div><div className="font-bold">{fmt.date(u.createdAt)}</div></div>
            <div><div className="text-dim">Último acesso</div><div className="font-bold">{fmt.relativeDays(u.lastLoginAt)}</div></div>
            <div><div className="text-dim">Gamificação</div><div className="font-bold">{u.gamification ? `Nível ${u.gamification.level} · ${fmt.num(u.gamification.totalXp)} XP · ${u.gamification.currentStreak} dias` : '—'}</div></div>
          </div>
          <section><SectionTitle>Assinaturas</SectionTitle><SubscriptionsTable subscriptions={u.subscriptions} invalidate={key} /></section>
          <section><SectionTitle>Cursos ({u.enrollments.length}) e certificados ({u.certificates.length})</SectionTitle>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {u.enrollments.slice(0, 12).map((e, i) => <li key={i} className="rounded-xl bg-bg px-3 py-2">{e.course?.title ?? 'Curso'} · <span className="text-muted">{Math.round(e.progressPct ?? 0)}%</span></li>)}
              {u.certificates.map((c) => <li key={c.code} className="rounded-xl bg-purple/10 px-3 py-2">🏆 {c.course?.title ?? 'Certificado'} · <span className="font-mono text-xs">{c.code}</span></li>)}
              {!u.enrollments.length && !u.certificates.length && <li className="text-muted">Nenhum curso iniciado.</li>}
            </ul>
          </section>
          <section><SectionTitle>Pagamentos</SectionTitle><PaymentsTable userId={u.id} /></section>
        </div>
      )}
      {u && <GrantModal open={grant} onClose={() => setGrant(false)} target={{ userId: u.id, label: u.name }} invalidate={key} />}
      {node}
    </Modal>
  );
}
