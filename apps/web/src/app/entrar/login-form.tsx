'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { errorMessage } from '@folks/shared';
import { AREA_HOME, useSession } from '@/lib/session';
import { Button, Card } from '@/components/ui';
import { PlanetOrb } from '@/components/planet';

export function LoginForm() {
  const { login, status, area, api } = useSession();
  const router = useRouter();
  const volta = useSearchParams().get('volta');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'auth' && area && !busy) router.replace(AREA_HOME[area]);
  }, [status, area, busy, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const s = await login(email, password);
      // mais de um perfil (ex.: Master + Individual, ou empresa + Individual)? deixa escolher
      const contexts = await api.auth.contexts().catch(() => []);
      const target = volta && volta.startsWith('/') && !volta.startsWith('//') ? volta : null;
      if (target) router.replace(target);
      else if (contexts.length > 2 || (contexts.length === 2 && s.context.mode === 'PLATFORM')) router.replace('/contexto');
      else router.replace('/');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex flex-col items-center text-center">
        <PlanetOrb size={84} visual={{ colors: ['#9b7bff', '#1a1240', '#ffffff'], ring: true }} />
        <h1 className="mt-2 text-3xl font-extrabold">Universo <span className="text-amber">Folks</span></h1>
        <p className="mt-1 text-muted">Aprender um pouco todo dia.</p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-muted">E-mail</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-line bg-bg-2 px-4 py-3 text-ink outline-none focus:border-amber" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-muted">Senha</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-line bg-bg-2 px-4 py-3 text-ink outline-none focus:border-amber" />
          </label>
          {error && <p role="alert" className="rounded-xl bg-red/10 px-3 py-2 text-sm font-bold text-red">{error}</p>}
          <Button type="submit" loading={busy} full disabled={!email || !password}>Entrar</Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-xs text-dim">Master, administradores de empresa, colaboradores e alunos entram por aqui.</p>
    </div>
  );
}
