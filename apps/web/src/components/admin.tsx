'use client';

/**
 * Kit dos painéis de gestão (MASTER e empresa): tabela, modal, campos, abas, confirmação,
 * avisos (toast) e ações com invalidação de cache. Mensagens de erro vêm prontas da API (pt-BR).
 */
import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { errorMessage } from '@folks/shared';
import { Button, Card, Empty, cx } from './ui';

// ------------------------------------------------------------------ avisos
type Toast = { id: number; text: string; tone: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx('pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl', t.tone === 'error' ? 'border-red/50 bg-[#2a0d14] text-red' : 'border-green/40 bg-[#0c2418] text-green')}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Mutação com aviso de sucesso/erro e invalidação das listas afetadas. */
export function useAction<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string | ((r: TRes) => string); invalidate?: QueryKey[]; onDone?: (r: TRes) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
      if (opts.success) toast(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      opts.onDone?.(r);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
}

// ------------------------------------------------------------------ tabela
export interface Column<T> { key: string; label: string; render: (row: T) => React.ReactNode; className?: string }
export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty = 'Nada por aqui ainda.', minWidth = 760 }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: string; minWidth?: number }) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="text-left text-xs uppercase tracking-wide text-dim">
          <tr className="border-b border-line">{columns.map((c) => <th key={c.key} className={cx('px-4 py-3 first:pl-5', c.className)}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cx('border-b border-line/60 last:border-0', onRowClick && 'cursor-pointer hover:bg-white/[0.03]')}>
              {columns.map((c) => <td key={c.key} className={cx('px-4 py-3 align-middle first:pl-5', c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return <p className="mt-3 text-xs text-dim">{total} {total === 1 ? 'registro' : 'registros'}</p>;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-xs text-dim">{total} registros · página {page} de {totalPages}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-xl border border-line px-3 py-1.5 font-bold disabled:opacity-40">Anterior</button>
        <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="rounded-xl border border-line px-3 py-1.5 font-bold disabled:opacity-40">Próxima</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ modal
export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-3xl border border-line bg-bg-2 shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-xl')}>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full px-2 text-xl text-muted hover:text-ink">×</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmação para ações que mudam ou apagam dados. */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; text: React.ReactNode; confirm: string; danger?: boolean; resolve: (ok: boolean) => void } | null>(null);
  const ask = useCallback((o: { title: string; text: React.ReactNode; confirm?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ confirm: 'Confirmar', ...o, resolve })), []);
  const close = (ok: boolean) => { state?.resolve(ok); setState(null); };
  const node = (
    <Modal open={!!state} title={state?.title ?? ''} onClose={() => close(false)}
      footer={<><Button variant="ghost" onClick={() => close(false)}>Cancelar</Button><Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirm}</Button></>}>
      <div className="text-muted">{state?.text}</div>
    </Modal>
  );
  return [ask, node] as const;
}

// ------------------------------------------------------------------ campos
const inputCls = 'w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-ink outline-none focus:border-amber disabled:opacity-60';

export function Field({ label, hint, children, error }: { label: string; hint?: React.ReactNode; children: (id: string) => React.ReactNode; error?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold text-muted">{label}</label>
      {children(id)}
      {hint && !error && <span className="text-xs text-dim">{hint}</span>}
      {error && <span className="text-xs font-bold text-red">{error}</span>}
    </div>
  );
}

export function TextInput({ label, value, onChange, hint, type = 'text', required, placeholder, disabled, autoFocus }: { label: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode; type?: string; required?: boolean; placeholder?: string; disabled?: boolean; autoFocus?: boolean }) {
  return <Field label={required ? `${label} *` : label} hint={hint}>{(id) => <input id={id} type={type} value={value} required={required} placeholder={placeholder} disabled={disabled} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} className={inputCls} />}</Field>;
}

export function NumberInput({ label, value, onChange, hint, min, max }: { label: string; value: number | ''; onChange: (v: number | '') => void; hint?: React.ReactNode; min?: number; max?: number }) {
  return <Field label={label} hint={hint}>{(id) => <input id={id} type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls} />}</Field>;
}

export function TextArea({ label, value, onChange, rows = 4, hint, mono, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: React.ReactNode; mono?: boolean; placeholder?: string }) {
  return <Field label={label} hint={hint}>{(id) => <textarea id={id} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, mono && 'font-mono text-xs')} />}</Field>;
}

export function SelectInput<V extends string>({ label, value, onChange, options, hint, placeholder }: { label: string; value: V | ''; onChange: (v: V) => void; options: Array<{ value: V; label: string }>; hint?: React.ReactNode; placeholder?: string }) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as V)} className={inputCls}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition', checked ? 'bg-amber' : 'bg-white/15')}>
        <span className={cx('block h-5 w-5 rounded-full bg-white transition', checked && 'translate-x-5')} />
      </button>
      <span><span className="block text-sm font-bold">{label}</span>{hint && <span className="block text-xs text-dim">{hint}</span>}</span>
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="w-full max-w-sm rounded-xl border border-line bg-bg-2 px-4 py-2.5 outline-none focus:border-amber" />;
}

// ------------------------------------------------------------------ abas e selos
export function Tabs<K extends string>({ tabs, active, onChange }: { tabs: Array<{ key: K; label: string; count?: number }>; active: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => onChange(t.key)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-bold', active === t.key ? 'border-amber text-amber' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-xs text-dim">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

const PILL: Record<string, [string, string]> = {
  ACTIVE: ['Ativo', 'green'], PUBLISHED: ['Publicado', 'green'], APPLIED: ['Gravada', 'green'], PAID: ['Pago', 'green'], DONE: ['Concluiu', 'green'],
  DRAFT: ['Rascunho', 'dim'], COMING_SOON: ['Em breve', 'blue'], VALIDATED: ['Validada', 'blue'], INVITED: ['Convidado', 'blue'], PENDING: ['Pendente', 'amber'],
  ARCHIVED: ['Arquivado', 'dim'], DISABLED: ['Desativado', 'red'], SUSPENDED: ['Suspensa', 'red'], CANCELED: ['Cancelada', 'red'], INVALID: ['Com erros', 'red'],
  FAILED: ['Falhou', 'red'], PARTIAL: ['Parcial', 'amber'], APPLYING: ['Gravando', 'amber'], DISCARDED: ['Descartada', 'dim'], TRIALING: ['Teste', 'blue'], PAST_DUE: ['Em atraso', 'red'], EXPIRED: ['Expirada', 'dim'],
};
export function StatusPill({ status, label }: { status: string; label?: string }) {
  const [text, tone] = PILL[status] ?? [status, 'dim'];
  const color = { green: 'var(--color-green)', dim: 'var(--color-dim)', blue: 'var(--color-blue)', amber: 'var(--color-amber)', red: 'var(--color-red)' }[tone];
  return <span className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{label ?? text}</span>;
}

/** Baixa um Blob como arquivo (CSV, HTML). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Formulário em grade de 2 colunas. */
export function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/** Cabeçalho de seção dentro de um card. */
export function SectionTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-extrabold">{children}</h2>{actions}</div>;
}

/** Converte "" em undefined (campos opcionais da API). */
export const opt = (v: string) => (v.trim() === '' ? undefined : v.trim());
/** Texto opcional num formulário que cria e edita: ao editar manda '' para limpar o campo (undefined manteria o valor antigo). */
export const optEdit = (v: string, editing: boolean) => (editing ? v.trim() : opt(v));
export const optNum = (v: number | '') => (v === '' ? undefined : v);
