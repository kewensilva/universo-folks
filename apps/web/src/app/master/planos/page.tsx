'use client';

import Link from 'next/link';
import { useState } from 'react';
import { fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle, cx } from '@/components/ui';
import { FormGrid, Modal, StatusPill, TextArea, TextInput, Toggle, useAction, useConfirm } from '@/components/admin';
import { PER_INTERVAL, usePlanTiers, usePlans, type PlanTier } from '@/components/master/billing';
import { useCategories } from '@/components/master/content';
import type { Category } from '@/components/master/content-types';

const KEY = [['master', 'plan-tiers'], ['master', 'plans']];

/**
 * Menu Planos: o que cada plano do aluno (B2C) libera. O conteúdo grátis vale para todos;
 * cada plano libera o conteúdo Premium das galáxias marcadas. Os preços ficam no Financeiro.
 */
export default function PlanosPage() {
  const tiers = usePlanTiers();
  const cats = useCategories();
  const prices = usePlans();
  const [edit, setEdit] = useState<Partial<PlanTier> | null>(null);
  const galaxies = (cats.data ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const unlinked = (prices.data ?? []).filter((p) => p.audience === 'B2C' && !p.tierId);

  return (
    <>
      <PageTitle title="Planos" subtitle="O que cada plano do aluno libera. Os cursos e unidades gratuitos valem para todos; cada plano libera o conteúdo Premium das galáxias marcadas. Empresas não usam estes planos: os planetas delas vêm do contrato."
        actions={<Button onClick={() => setEdit({ categories: [], isActive: true })}>+ Novo plano</Button>} />
      {unlinked.length > 0 && (
        <Card className="mb-4 border-amber/40 p-4 text-sm">
          ⚠ {unlinked.length === 1 ? '1 preço do aluno não está ligado' : `${unlinked.length} preços do aluno não estão ligados`} a um plano e {unlinked.length === 1 ? 'libera' : 'liberam'} todas as galáxias: {unlinked.map((p) => p.name).join(', ')}. <Link href="/master/financeiro" className="font-bold text-amber underline">Ligar no Financeiro</Link>
        </Card>
      )}
      {tiers.isLoading || cats.isLoading ? <Loading /> : tiers.error ? <ErrorBox error={tiers.error} onRetry={() => tiers.refetch()} /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tiers.data!.map((t) => <TierCard key={t.id} t={t} galaxies={galaxies} onEdit={() => setEdit(t)} />)}
          </div>
          <Compare tiers={tiers.data!.filter((t) => t.isActive)} galaxies={galaxies} />
        </>
      )}
      {edit && <TierModal t={edit} galaxies={galaxies} onClose={() => setEdit(null)} />}
    </>
  );
}

const covers = (t: Pick<PlanTier, 'includesAllCategories' | 'categories'>, id: string) => t.includesAllCategories || t.categories.some((c) => c.id === id);

function TierCard({ t, galaxies, onEdit }: { t: PlanTier; galaxies: Category[]; onEdit: () => void }) {
  const { api } = useSession();
  // acrescentar/tirar uma galáxia direto no cartão
  const toggle = useAction((id: string) => {
    const ids = t.categories.map((c) => c.id);
    return api.http.patch(`/master/plan-tiers/${t.id}`, { categoryIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  }, { success: 'Plano atualizado', invalidate: KEY });

  return (
    <Card className={cx('flex flex-col gap-4 p-5', !t.isActive && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-black">{t.name}</div>
          <div className="font-mono text-xs text-dim">{t.code}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {t.isDefault && <StatusPill status="COMING_SOON" label="Quem não assina" />}
          {!t.isActive && <StatusPill status="DISABLED" label="Inativo" />}
        </div>
      </div>
      {t.description && <p className="-mt-2 text-sm text-muted">{t.description}</p>}

      <div>
        <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-dim">Libera</div>
        <div className="mb-2 text-sm">✓ Cursos e unidades gratuitos</div>
        {t.includesAllCategories && <div className="mb-2 text-sm font-bold text-amber">✓ Todas as galáxias, inclusive as que forem criadas</div>}
        <div className="flex flex-wrap gap-2">
          {galaxies.map((g) => {
            const on = covers(t, g.id);
            return (
              <button key={g.id} type="button" aria-pressed={on} disabled={t.includesAllCategories || toggle.isPending} onClick={() => toggle.mutate(g.id)}
                title={t.includesAllCategories ? 'Este plano inclui todas as galáxias' : on ? `Tirar ${g.name} do ${t.name}` : `Acrescentar ${g.name} ao ${t.name}`}
                className={cx('rounded-xl border px-3 py-1.5 text-sm font-bold transition disabled:cursor-default', on ? 'border-amber bg-amber/15 text-ink' : 'border-dashed border-line text-dim hover:border-amber/50')}>
                {on ? '✓ ' : '+ '}{g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-dim">Preços</div>
        {t.plans.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {t.plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>{p.name}</span>
                <span className="whitespace-nowrap"><b>{fmt.money(p.priceCents, p.currency)}</b><span className="text-dim">{PER_INTERVAL[p.interval]}</span>{!p.isActive && <span className="ml-2 text-xs text-dim">fora de venda</span>}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-dim">{t.isDefault ? 'Gratuito: é o plano de quem não assina.' : <>Nenhum preço. <Link href="/master/financeiro" className="font-bold text-amber underline">Criar no Financeiro</Link></>}</div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-sm">
        <span className="text-dim">{t.isDefault ? 'Todos sem assinatura' : `${t.activeSubscriptions} ${t.activeSubscriptions === 1 ? 'assinatura ativa' : 'assinaturas ativas'}`}</span>
        <Button variant="ghost" onClick={onEdit}>Editar</Button>
      </div>
    </Card>
  );
}

function Row({ label, cells }: { label: string; cells: boolean[] }) {
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-4 text-sm">{label}</td>
      {cells.map((c, i) => <td key={i} className={cx('py-2 text-center text-sm font-black', c ? 'text-green' : 'text-dim')}>{c ? '✓' : '—'}</td>)}
    </tr>
  );
}

/** Comparativo lado a lado (o que o aluno vê na tela de assinatura). */
function Compare({ tiers, galaxies }: { tiers: PlanTier[]; galaxies: Category[] }) {
  if (!tiers.length) return null;
  return (
    <Card className="mt-6 overflow-x-auto p-5">
      <div className="mb-3 font-black">Comparativo</div>
      <table className="w-full min-w-[520px]">
        <thead><tr><th />{tiers.map((t) => <th key={t.id} className="pb-2 text-center text-sm font-black">{t.name}</th>)}</tr></thead>
        <tbody>
          <Row label="Cursos e unidades gratuitos" cells={tiers.map(() => true)} />
          {galaxies.map((g) => <Row key={g.id} label={`${g.name} completo`} cells={tiers.map((t) => covers(t, g.id))} />)}
          <Row label="Certificado, prática ilimitada e sem anúncio" cells={tiers.map((t) => !t.isDefault)} />
        </tbody>
      </table>
      <p className="mt-3 text-xs text-dim">Certificado, prática infinita e jam ilimitados e a ausência de anúncio valem para quem tem qualquer assinatura paga.</p>
    </Card>
  );
}

function TierModal({ t, galaxies, onClose }: { t: Partial<PlanTier>; galaxies: Category[]; onClose: () => void }) {
  const { api } = useSession();
  const [ask, confirmNode] = useConfirm();
  const editing = !!t.id;
  const [f, setF] = useState({
    name: t.name ?? '', code: t.code ?? '', description: t.description ?? '',
    categoryIds: (t.categories ?? []).map((c) => c.id), includesAllCategories: t.includesAllCategories ?? false,
    isDefault: t.isDefault ?? false, isActive: t.isActive ?? true,
  });
  const toggleCat = (id: string) => setF({ ...f, categoryIds: f.categoryIds.includes(id) ? f.categoryIds.filter((x) => x !== id) : [...f.categoryIds, id] });
  const save = useAction(() => {
    const body = { name: f.name.trim(), description: f.description.trim() || null, categoryIds: f.categoryIds, includesAllCategories: f.includesAllCategories, isDefault: f.isDefault, isActive: f.isDefault ? true : f.isActive };
    return editing ? api.http.patch(`/master/plan-tiers/${t.id}`, body) : api.http.post('/master/plan-tiers', { ...body, ...(f.code.trim() ? { code: f.code.trim() } : {}) });
  }, { success: editing ? 'Plano salvo' : 'Plano criado', invalidate: KEY, onDone: onClose });
  const remove = useAction(() => api.http.del(`/master/plan-tiers/${t.id}`), { success: 'Plano excluído', invalidate: KEY, onDone: onClose });
  const invalid = f.name.trim().length < 2 || (!editing && !!f.code.trim() && !/^[a-z0-9][a-z0-9-]{1,40}$/.test(f.code.trim()));

  return (
    <Modal open title={editing ? `Plano: ${t.name}` : 'Novo plano'} onClose={onClose} wide
      footer={<>
        {editing && !t.isDefault && <Button variant="ghost" className="mr-auto text-red" loading={remove.isPending} onClick={async () => {
          if (await ask({ title: 'Excluir plano?', text: t.plans?.length ? `${t.plans.length} preço(s) liberam este plano: a exclusão será recusada. Desvincule-os no Financeiro ou desative o plano.` : 'Ele sai da lista de planos.', confirm: 'Excluir', danger: true })) remove.mutate(undefined);
        }}>Excluir</Button>}
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate(undefined)}>Salvar</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <FormGrid>
          <TextInput label="Nome" required value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Ex.: Premium Plus" />
          <TextInput label="Código" value={f.code} disabled={editing} onChange={(v) => setF({ ...f, code: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            hint={editing ? 'O código não muda.' : 'Opcional: sai do nome (ex.: premium-plus).'} />
        </FormGrid>
        <TextArea label="Descrição" rows={2} value={f.description} onChange={(v) => setF({ ...f, description: v })} placeholder="O que o aluno ganha com este plano." />
        <div>
          <div className="mb-1 text-sm font-bold">Galáxias liberadas</div>
          <div className="mb-3 text-xs text-dim">Os cursos e unidades gratuitos valem em qualquer plano. Marque as galáxias que este plano libera por completo.</div>
          <Toggle label="Todas as galáxias" checked={f.includesAllCategories} onChange={(v) => setF({ ...f, includesAllCategories: v })} hint="Inclui também as galáxias que forem criadas depois." />
          <div className="mt-3 flex flex-wrap gap-2">
            {galaxies.map((g) => {
              const on = f.includesAllCategories || f.categoryIds.includes(g.id);
              return (
                <button key={g.id} type="button" aria-pressed={on} disabled={f.includesAllCategories} onClick={() => toggleCat(g.id)}
                  className={cx('rounded-xl border px-3 py-1.5 text-sm font-bold transition disabled:cursor-default', on ? 'border-amber bg-amber/15 text-ink' : 'border-line text-muted hover:border-amber/50')}>
                  {on ? '✓ ' : ''}{g.name}
                </button>
              );
            })}
          </div>
        </div>
        <Toggle label="Plano de quem não assina" checked={f.isDefault} onChange={(v) => setF({ ...f, isDefault: v })}
          hint={t.isDefault ? 'Para trocar, marque outro plano como o de quem não assina.' : 'Só um plano tem essa marca: marcar este desmarca o atual.'} />
        {!f.isDefault && <Toggle label="Ativo" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} hint="Inativo: some do comparativo e não é sugerido ao aluno; quem já assina mantém o acesso." />}
      </div>
      {confirmNode}
    </Modal>
  );
}
