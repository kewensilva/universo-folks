'use client';

import Link from 'next/link';
import { badgeColor, badgeLabel, errorMessage } from '@folks/shared';

export function cx(...c: Array<string | false | null | undefined>) { return c.filter(Boolean).join(' '); }

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean; full?: boolean };
export function Button({ variant = 'primary', loading, full, className, children, disabled, ...p }: BtnProps) {
  const styles = {
    primary: 'btn-3d bg-amber text-on-amber hover:brightness-105',
    ghost: 'bg-card-2 text-ink border border-line hover:bg-card',
    danger: 'btn-3d bg-red text-white [--shadow:#cc3445]',
  }[variant];
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-60', styles, full && 'w-full', className)}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('rounded-[20px] border border-line bg-card/90 p-5 backdrop-blur', className)}>{children}</div>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'amber' | 'green' | 'red' | 'blue' | 'purple' }) {
  const color = { amber: 'text-amber', green: 'text-green', red: 'text-red', blue: 'text-blue', purple: 'text-purple' }[tone ?? 'amber'];
  return (
    <Card className="p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-dim">{label}</div>
      <div className={cx('mt-1 text-2xl font-extrabold', color)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Progress({ value, color = 'var(--color-amber)', className }: { value: number; color?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-white/10', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

export function PlanetBadge({ code }: { code: string }) {
  const c = badgeColor[code] ?? '#7a77a3';
  return (
    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: c, background: `${c}22`, border: `1px solid ${c}55` }}>
      {badgeLabel[code] ?? code}
    </span>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span aria-label="Carregando" className={cx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', small ? 'h-4 w-4' : 'h-7 w-7 text-amber')} />;
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-3 py-16 text-muted"><Spinner />{label}</div>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card className="border-red/40 bg-red/10">
      <p className="font-bold text-red">{errorMessage(error)}</p>
      {onRetry && <button onClick={onRetry} className="mt-2 text-sm font-bold text-ink underline">Tentar de novo</button>}
    </Card>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <Card className="text-center"><p className="font-bold">{title}</p>{children && <div className="mt-1 text-sm text-muted">{children}</div>}</Card>;
}

export function PageTitle({ title, subtitle, back, actions }: { title: string; subtitle?: React.ReactNode; back?: { href: string; label: string }; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {back && <Link href={back.href} className="mb-2 inline-block text-sm font-bold text-muted hover:text-ink">← {back.label}</Link>}
        <h1 className="text-2xl font-extrabold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
