'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import type { Area } from '@folks/shared';
import { AreaGuard } from './guard';
import { ToastProvider } from './admin';
import { UserMenu } from './user-menu';
import { Loading, cx } from './ui';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-extrabold">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-amber text-on-amber">✦</span>
      <span>Universo <span className="text-amber">Folks</span></span>
    </Link>
  );
}

type NavItem = { href: string; label: string; icon: string; exact?: boolean };
const isActive = (path: string, n: NavItem) => (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + '/'));

/** Painéis (MASTER e empresa): barra lateral no desktop, abas no topo no celular. */
export function PanelShell({ area, title, nav, children }: { area: Area; title: string; nav: NavItem[]; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <AreaGuard area={area}>
      <ToastProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-bg-2/80 p-4 backdrop-blur lg:flex">
          <Logo />
          <div className="mt-1 pl-10 text-[11px] font-bold uppercase tracking-wider text-dim">{title}</div>
          <nav className="mt-8 flex flex-col gap-1 overflow-y-auto pb-4">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold', isActive(path, n) ? 'bg-amber/15 text-amber' : 'text-muted hover:bg-card hover:text-ink')}>
                <span aria-hidden>{n.icon}</span>{n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur md:px-8">
            <div className="lg:hidden"><Logo /></div>
            <nav className="flex gap-1 overflow-x-auto lg:hidden">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className={cx('whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold', isActive(path, n) ? 'bg-amber/15 text-amber' : 'text-muted')}>{n.label}</Link>
              ))}
            </nav>
            <div className="ml-auto"><UserMenu /></div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
            <Suspense fallback={<Loading />}>{children}</Suspense>
          </main>
        </div>
      </div>
      </ToastProvider>
    </AreaGuard>
  );
}

/** Área de estudo (colaborador e aluno): visual do protótipo, abas Início e Cursos. */
export function StudyShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const nav: NavItem[] = [
    { href: '/estudar', label: 'Início', icon: '🏠', exact: true },
    { href: '/estudar/planetas', label: 'Cursos', icon: '🪐' },
  ];
  return (
    <AreaGuard area="estudar">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Logo />
          <nav className="hidden gap-1 sm:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={cx('rounded-full px-4 py-2 text-sm font-bold', isActive(path, n) ? 'bg-amber/15 text-amber' : 'text-muted hover:text-ink')}>
                <span aria-hidden className="mr-1.5">{n.icon}</span>{n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto"><UserMenu /></div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-bg-2/95 py-2 sm:hidden">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={cx('flex flex-col items-center text-[11px] font-bold', isActive(path, n) ? 'text-amber' : 'text-dim')}>
            <span className="text-lg" aria-hidden>{n.icon}</span>{n.label}
          </Link>
        ))}
      </nav>
    </AreaGuard>
  );
}
