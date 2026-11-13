'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, apiErrorFrom, areaFor, createApiClient, type ActiveContext, type ApiClient, type Area, type ContextMode, type SessionUser } from '@folks/shared';
import { PUBLIC_API_URL } from './env';

/** offline = servidor fora do ar: mantém a sessão e tenta de novo (não manda para o login). */
type Status = 'loading' | 'anon' | 'auth' | 'offline';
interface SessionData { accessToken: string; context: ActiveContext; user: SessionUser }

interface SessionValue {
  status: Status;
  user: SessionUser | null;
  context: ActiveContext | null;
  area: Area | null;
  /** a sessão terminou porque a pessoa clicou em Sair (não guarda a página para voltar) */
  endedByUser: boolean;
  api: ApiClient;
  login: (email: string, password: string) => Promise<SessionData>;
  logout: () => Promise<void>;
  /** tenta renovar de novo (tela de "sem conexão") */
  retry: () => void;
  switchContext: (mode: ContextMode, tenantId?: string) => Promise<SessionData>;
}

const Ctx = createContext<SessionValue | null>(null);

/**
 * Uma renovação por vez na página inteira. A API faz ROTAÇÃO do refresh token: duas renovações
 * simultâneas com o mesmo cookie fazem a segunda ser recusada e derrubam a sessão
 * (acontece com o StrictMode montando o efeito duas vezes, ou com chamadas em paralelo).
 */
let refreshInFlight: Promise<SessionData> | null = null;
const refreshSession = () => (refreshInFlight ??= bff('').finally(() => { refreshInFlight = null; }));

/** Guarda o token de acesso só em memória (nunca em localStorage). */
class TokenBox {
  private value: string | null = null;
  get = () => this.value;
  set = (t: string | null) => { this.value = t; };
}

async function bff(path: string, body?: unknown, token?: string | null): Promise<SessionData> {
  const res = await fetch(`/api/sessao${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiErrorFrom(res.status, data);
  if (data?.session === null) throw apiErrorFrom(401, { message: 'Sessão não iniciada' });
  return data as SessionData;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider onReset={() => queryClient.clear()}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

function SessionProvider({ children, onReset }: { children: React.ReactNode; onReset: () => void }) {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<SessionData | null>(null);
  const [endedByUser, setEndedByUser] = useState(false);
  const [token] = useState(() => new TokenBox());

  const apply = useCallback((d: SessionData | null) => {
    token.set(d?.accessToken ?? null);
    setData(d);
    setStatus(d ? 'auth' : 'anon');
  }, [token]);

  /** 401 = sem sessão (vai ao login); 5xx/rede = servidor fora do ar (offline, tenta de novo). */
  const onRefreshError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { apply(null); return null; }
    setStatus('offline');
    throw e;
  }, [apply]);

  const refresh = useCallback(async () => {
    try {
      const d = await refreshSession();
      apply(d);
      return d.accessToken;
    } catch (e) {
      return onRefreshError(e);
    }
  }, [apply, onRefreshError]);

  // abrir a página: tenta renovar pelo cookie httpOnly
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    refreshSession().then((d) => alive && apply(d), (e) => { if (alive) { try { onRefreshError(e); } catch { /* offline: tenta de novo abaixo */ } } });
    return () => { alive = false; };
  }, [apply, onRefreshError, attempt]);
  // sem conexão: tenta de novo a cada 5 s
  useEffect(() => {
    if (status !== 'offline') return;
    const t = setTimeout(() => setAttempt((n) => n + 1), 5000);
    return () => clearTimeout(t);
  }, [status, attempt]);

  const api = useMemo(
    () => createApiClient({ baseUrl: PUBLIC_API_URL, getAccessToken: token.get, refresh, onSessionExpired: () => apply(null) }),
    [refresh, apply, token],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user: data?.user ?? null,
      context: data?.context ?? null,
      area: data ? areaFor(data.context) : null,
      endedByUser,
      api,
      login: async (email, password) => { onReset(); setEndedByUser(false); const d = await bff('/entrar', { email, password }); apply(d); return d; },
      retry: () => setAttempt((n) => n + 1),
      logout: async () => { setEndedByUser(true); await bff('/sair').catch(() => undefined); onReset(); apply(null); },
      switchContext: async (mode, tenantId) => { const d = await bff('/contexto', { mode, tenantId }, token.get()); onReset(); apply(d); return d; },
    }),
    [status, data, endedByUser, api, apply, onReset, token],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fora do <Providers>');
  return v;
}

/** Caminho inicial de cada área. */
export const AREA_HOME: Record<Area, string> = { master: '/master', empresa: '/empresa', estudar: '/estudar' };
