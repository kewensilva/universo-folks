'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Area } from '@folks/shared';
import { AREA_HOME, useSession } from '@/lib/session';
import { Loading } from './ui';

/**
 * Guarda de área (só esconde telas: quem autoriza de verdade é a API).
 * Sem sessão -> /entrar; perfil de outra área -> área do perfil.
 */
export function AreaGuard({ area, children }: { area: Area; children: React.ReactNode }) {
  const { status, area: current, endedByUser, retry } = useSession();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (status === 'anon') router.replace(endedByUser ? '/entrar' : `/entrar?volta=${encodeURIComponent(path)}`);
    else if (status === 'auth' && current && current !== area) router.replace(AREA_HOME[current]);
  }, [status, current, area, router, path, endedByUser]);
  if (status === 'offline') return <Offline onRetry={retry} />;
  if (status !== 'auth' || current !== area) return <Loading label="Abrindo…" />;
  return <>{children}</>;
}

/** Servidor fora do ar: a sessão continua; a página tenta de novo sozinha. */
export function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="max-w-sm rounded-[20px] border border-line bg-card p-6 text-center">
        <div className="text-4xl" aria-hidden>🛰️</div>
        <h1 className="mt-2 text-lg font-extrabold">Sem conexão com o servidor</h1>
        <p className="mt-1 text-sm text-muted">Sua sessão continua. Vamos tentar de novo em alguns segundos.</p>
        <button onClick={onRetry} className="mt-4 rounded-xl border border-line px-4 py-2 text-sm font-bold hover:border-amber">Tentar agora</button>
      </div>
    </div>
  );
}
