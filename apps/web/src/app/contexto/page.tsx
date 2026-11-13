'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { areaFor, contextTitle, errorMessage, sameContext, type AvailableContext } from '@folks/shared';
import { AREA_HOME, useSession } from '@/lib/session';
import { Card, ErrorBox, Loading } from '@/components/ui';
import { Logo } from '@/components/shells';

const ICON: Record<string, string> = { PLATFORM: '🛰️', TENANT: '🏢', B2C: '🧑‍🚀' };

/** "Entrar como": Master, cada empresa (admin ou colaborador) e Individual. */
export default function ContextoPage() {
  const { status, api, context, switchContext } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (status === 'anon') router.replace('/entrar?volta=/contexto'); }, [status, router]);
  const q = useQuery({ queryKey: ['contexts'], queryFn: () => api.auth.contexts(), enabled: status === 'auth' });

  async function pick(c: AvailableContext) {
    const key = `${c.mode}:${c.tenantId ?? ''}`;
    setBusy(key);
    setErr(null);
    try {
      const s = context && sameContext(context, c) ? null : await switchContext(c.mode, c.tenantId);
      router.replace(AREA_HOME[areaFor(s?.context ?? context!)]);
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-xl content-center gap-6 px-4 py-10">
      <Logo />
      <div>
        <h1 className="text-2xl font-extrabold">Entrar como</h1>
        <p className="text-muted">Você tem mais de um perfil. Escolha onde quer entrar agora; dá para trocar depois.</p>
      </div>
      {q.isLoading || status !== 'auth' ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="flex flex-col gap-3">
          {q.data!.map((c) => {
            const key = `${c.mode}:${c.tenantId ?? ''}`;
            const t = contextTitle(c);
            const current = context && sameContext(context, c);
            return (
              <button key={key} onClick={() => pick(c)} disabled={!!busy} className="text-left disabled:opacity-60">
                <Card className={`flex items-center gap-4 transition hover:border-amber/60 ${current ? 'border-amber/60' : ''}`}>
                  <span className="text-3xl" aria-hidden>{ICON[c.mode]}</span>
                  <span className="flex-1">
                    <span className="block font-extrabold">{t.title}</span>
                    <span className="block text-sm text-muted">{t.subtitle}</span>
                  </span>
                  {busy === key ? <span className="text-sm text-amber">Abrindo…</span> : current ? <span className="text-xs font-bold text-amber">ATUAL</span> : <span className="text-dim">→</span>}
                </Card>
              </button>
            );
          })}
        </div>
      )}
      {err && <p role="alert" className="rounded-xl bg-red/10 px-3 py-2 text-sm font-bold text-red">{err}</p>}
    </main>
  );
}
