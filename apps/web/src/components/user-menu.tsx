'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PROFILE_LABEL, profileOf } from '@folks/shared';
import { useSession } from '@/lib/session';

export function UserMenu() {
  const { user, context, logout } = useSession();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  if (!user || !context) return null;
  const initials = user.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-full border border-line bg-card px-2 py-1.5 pr-3 hover:bg-card-2" aria-expanded={open}>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-purple text-sm font-extrabold">{initials}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-bold">{user.displayName || user.name.split(' ')[0]}</span>
          <span className="block text-[11px] text-muted">{PROFILE_LABEL[profileOf(context)]}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-2xl border border-line bg-bg-2 p-2 shadow-2xl" onMouseLeave={() => setOpen(false)}>
          <div className="px-3 py-2 text-xs text-muted">{user.email}</div>
          <Link href="/contexto" className="block rounded-xl px-3 py-2 text-sm font-bold hover:bg-card">Trocar perfil / empresa</Link>
          <button
            onClick={async () => { await logout(); router.replace('/entrar'); }}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-red hover:bg-card"
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
