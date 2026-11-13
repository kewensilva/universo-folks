import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, authApi, createApiClient, isStudyContext, type ActiveContext, type ApiClient, type ContextMode, type SessionUser, type TokenPair } from '@folks/shared';
import { API_URL } from './env';
import { refreshStore } from './secure';

/** offline = servidor fora do ar: mantém o refresh guardado e tenta de novo. */
type Status = 'loading' | 'anon' | 'auth' | 'offline';

interface SessionValue {
  status: Status;
  user: SessionUser | null;
  context: ActiveContext | null;
  /** o perfil atual estuda no app? (MASTER e ADMIN usam o painel na web) */
  canStudy: boolean;
  api: ApiClient;
  login: (email: string, password: string) => Promise<void>;
  /** cadastro gratuito (B2C): já entra logado no plano Básico */
  register: (b: { name: string; email: string; password: string; birthDate: string; companyCode?: string }) => Promise<void>;
  /** entra numa empresa pelo código e passa a estudar nela */
  joinCompany: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  switchContext: (mode: ContextMode, tenantId?: string) => Promise<void>;
  retry: () => void;
}

const Ctx = createContext<SessionValue | null>(null);
const auth = authApi(API_URL);

/** Token de acesso só em memória. */
class TokenBox {
  private value: string | null = null;
  get = () => this.value;
  set = (t: string | null) => { this.value = t; };
}

/** Uma renovação por vez: a API faz rotação do refresh token (ver web/lib/session.tsx). */
let inflight: Promise<TokenPair | null> | null = null;
function renew(): Promise<TokenPair | null> {
  return (inflight ??= (async () => {
    const rt = await refreshStore.get();
    if (!rt) return null;
    try {
      const pair = await auth.refresh(rt);
      await refreshStore.set(pair.refreshToken);
      return pair;
    } catch (e) {
      // 401/400 = sessão acabou; qualquer outro erro (rede, 5xx) = sem conexão: propaga e mantém o refresh
      if (e instanceof ApiError && (e.status === 401 || e.status === 400)) { await refreshStore.clear(); return null; }
      throw e;
    }
  })().finally(() => { inflight = null; }));
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider onReset={() => queryClient.clear()}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

function SessionProvider({ children, onReset }: { children: React.ReactNode; onReset: () => void }) {
  const [status, setStatus] = useState<Status>('loading');
  const [pair, setPair] = useState<TokenPair | null>(null);
  const [token] = useState(() => new TokenBox());

  const apply = useCallback(async (p: TokenPair | null) => {
    token.set(p?.accessToken ?? null);
    if (p) await refreshStore.set(p.refreshToken);
    setPair(p);
    setStatus(p ? 'auth' : 'anon');
  }, [token]);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    renew().then((p) => { if (alive) void apply(p); }, () => { if (alive) setStatus('offline'); });
    return () => { alive = false; };
  }, [apply, attempt]);
  useEffect(() => {
    if (status !== 'offline') return;
    const t = setTimeout(() => setAttempt((n) => n + 1), 5000);
    return () => clearTimeout(t);
  }, [status, attempt]);

  const refresh = useCallback(async () => {
    const p = await renew(); // lança se estiver sem conexão: a sessão fica
    await apply(p);
    return p?.accessToken ?? null;
  }, [apply]);

  const api = useMemo(
    () => createApiClient({ baseUrl: API_URL, getAccessToken: token.get, refresh, onSessionExpired: () => void apply(null) }),
    [token, refresh, apply],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user: pair?.user ?? null,
      context: pair?.context ?? null,
      canStudy: pair ? isStudyContext(pair.context) : false,
      api,
      retry: () => setAttempt((n) => n + 1),
      login: async (email, password) => { onReset(); await apply(await auth.login(email.trim(), password)); },
      register: async (b) => { onReset(); await apply(await auth.register({ ...b, email: b.email.trim(), name: b.name.trim() })); },
      joinCompany: async (code) => {
        const p = await api.auth.joinCompany(code.trim().toUpperCase());
        onReset();
        await apply(p);
      },
      logout: async () => {
        const rt = await refreshStore.get();
        if (rt) await auth.logout(rt).catch(() => undefined);
        await refreshStore.clear();
        onReset();
        await apply(null);
      },
      switchContext: async (mode, tenantId) => {
        const p = await auth.switchContext(token.get() ?? '', mode, tenantId);
        onReset();
        await apply(p);
      },
    }),
    [status, pair, api, apply, onReset, token],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession fora do <Providers>');
  return v;
}
