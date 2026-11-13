import { apiErrorFrom } from './errors';
import type { AvailableContext, ContextMode, TokenPair } from './session';
import type {
  CatalogHome, CompanyDashboard, CompanyPerson, MasterDashboard, Me, Page, PlanetDetail, PlanetList, Slide, Tenant, Trail,
} from './types';
import type { AnswerPayload, PublicQuestion } from './questions';
import type { LessonVideo, VideoProgressResult } from './video';
import type { Entitlements, Hangar, MyCompany, Preferences, Progress, PublicTier } from './account';

type Fetch = typeof fetch;

type Body = unknown;
/** FormData vai sem content-type (o navegador define o boundary). */
const isForm = (b: unknown): b is FormData => typeof FormData !== 'undefined' && b instanceof FormData;

async function raw(f: Fetch, url: string, method: string, body: Body, token: string | null): Promise<Response> {
  return f(url, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined && !isForm(body) ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : isForm(body) ? body : JSON.stringify(body),
  });
}

async function send<T>(f: Fetch, url: string, method: string, body: Body, token: string | null): Promise<T> {
  const res = await raw(f, url, method, body, token);
  const text = await res.text();
  let data: any = undefined;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) throw apiErrorFrom(res.status, data);
  return data as T;
}

/**
 * Chamadas de AUTENTICAÇÃO direto na API (sem token de acesso).
 * App: usa direto. Web: só o servidor do Next (BFF) usa, para o refresh ficar em cookie httpOnly.
 */
export function authApi(baseUrl: string, f: Fetch = fetch) {
  const u = (p: string) => `${baseUrl.replace(/\/$/, '')}${p}`;
  return {
    login: (email: string, password: string) => send<TokenPair>(f, u('/auth/login'), 'POST', { email, password }, null),
    register: (b: { name: string; email: string; password: string; birthDate: string; companyCode?: string }) => send<TokenPair>(f, u('/auth/register'), 'POST', b, null),
    refresh: (refreshToken: string) => send<TokenPair>(f, u('/auth/refresh'), 'POST', { refreshToken }, null),
    logout: (refreshToken: string) => send<{ ok: true }>(f, u('/auth/logout'), 'POST', { refreshToken }, null),
    switchContext: (accessToken: string, mode: ContextMode, tenantId?: string) => send<TokenPair>(f, u('/auth/switch-context'), 'POST', { mode, ...(tenantId ? { tenantId } : {}) }, accessToken),
    forgotPassword: (email: string) => send<{ ok: true }>(f, u('/auth/password/forgot'), 'POST', { email }, null),
    resetPassword: (b: { token: string; password: string; displayName?: string; birthDate?: string }) => send<TokenPair | { ok: true }>(f, u('/auth/password/reset'), 'POST', b, null),
  };
}

export interface ApiClientOptions {
  baseUrl: string;
  /** token de acesso atual (em memória) */
  getAccessToken: () => string | null;
  /** renova a sessão e devolve o novo token de acesso (null = sessão acabou; lançar = sem conexão, tentar depois) */
  refresh: () => Promise<string | null>;
  /** chamado quando o refresh falha: levar para o login */
  onSessionExpired?: () => void;
  fetch?: Fetch;
}

/** Cliente tipado da API, com renovação automática do token (uma renovação por vez). */
export function createApiClient(o: ApiClientOptions) {
  const f = o.fetch ?? fetch;
  const base = o.baseUrl.replace(/\/$/, '');
  let refreshing: Promise<string | null> | null = null;
  const refreshOnce = () => (refreshing ??= o.refresh().finally(() => { refreshing = null; }));

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await send<T>(f, base + path, method, body, o.getAccessToken());
    } catch (e: any) {
      if (e?.status !== 401) throw e;
      // refresh que lança = falha passageira (sem conexão): propaga o erro e mantém a sessão.
      // refresh que devolve null = sessão expirada de fato: avisa para ir ao login.
      const token = await refreshOnce();
      if (!token) { o.onSessionExpired?.(); throw e; }
      return send<T>(f, base + path, method, body, token);
    }
  }

  /** Download (CSV, HTML de certificado): devolve o arquivo como Blob, com renovação de token. */
  async function download(path: string): Promise<Blob> {
    let res = await raw(f, base + path, 'GET', undefined, o.getAccessToken());
    if (res.status === 401) {
      const token = await refreshOnce();
      if (!token) { o.onSessionExpired?.(); throw apiErrorFrom(401, { message: 'Sua sessão expirou. Entre de novo.' }); }
      res = await raw(f, base + path, 'GET', undefined, token);
    }
    if (!res.ok) throw apiErrorFrom(res.status, await res.json().catch(() => ({})));
    return res.blob();
  }
  const get = <T>(p: string) => request<T>('GET', p);
  const post = <T>(p: string, b: unknown = {}) => request<T>('POST', p, b);
  const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b);
  const qs = (q: Record<string, string | number | undefined | null>) => {
    const s = Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    return s ? `?${s}` : '';
  };

  return {
    request,
    download,
    /** Chamadas genéricas para as telas de gestão (tipos ficam na própria tela). */
    http: {
      get: <T>(p: string, q?: Record<string, string | number | undefined | null>) => get<T>(p + (q ? qs(q) : '')),
      post: <T>(p: string, b: unknown = {}) => request<T>('POST', p, b),
      patch: <T>(p: string, b: unknown) => request<T>('PATCH', p, b),
      put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
      del: <T>(p: string) => request<T>('DELETE', p),
      /** multipart (ex.: upload de arquivos de importação) */
      upload: <T>(p: string, form: FormData) => request<T>('POST', p, form),
    },
    auth: {
      contexts: () => get<AvailableContext[]>('/auth/contexts'),
      joinCompany: (code: string) => post<TokenPair>('/auth/join-company', { code }),
      changePassword: (currentPassword: string, newPassword: string) => post<unknown>('/auth/change-password', { currentPassword, newPassword }),
    },
    me: {
      get: () => get<Me>('/me'),
      update: (b: { name?: string; displayName?: string }) => patch<Me>('/me', b),
      progress: () => get<Progress>('/me/progress'),
      entitlements: () => get<Entitlements>('/me/entitlements'),
      preferences: () => get<Preferences>('/me/preferences'),
      updatePreferences: (b: Partial<Preferences>) => patch<Preferences>('/me/preferences', b),
      /** Hangar: roupas e acessórios do astronauta (liberados por nível) */
      hangar: () => get<Hangar>('/me/hangar'),
      equip: (itemId: string) => request<Hangar>('PUT', `/me/hangar/${itemId}`, {}),
      /** empresa do colaborador: departamentos, trilhas obrigatórias e ranking */
      company: () => get<MyCompany>('/me/company'),
    },
    billing: {
      /** Básico, Premium, Premium Plus: galáxias e preços (público) */
      tiers: () => get<PublicTier[]>('/billing/tiers'),
    },
    catalog: {
      home: () => get<CatalogHome>('/catalog/home'),
      planets: (q: { category?: string; filter?: string } = {}) => get<PlanetList>(`/catalog/planets${qs(q)}`),
      planet: (slug: string) => get<PlanetDetail>(`/catalog/planets/${encodeURIComponent(slug)}`),
    },
    learning: {
      trail: (courseId: string) => get<Trail>(`/learning/courses/${courseId}/trail`),
      lesson: (lessonId: string) =>
        get<{ id: string; type: string; title: string; xpReward: number; courseId: string; content?: { slides: Slide[] }; video?: LessonVideo; questionSource?: 'BANK' | 'GENERATED'; questionsPerRound?: number | null; questions?: PublicQuestion[]; generators?: string[]; questionCount?: number | null; isReview?: boolean; passingPct?: number }>(`/learning/lessons/${lessonId}`),
      completeLesson: (lessonId: string) => post<unknown>(`/learning/lessons/${lessonId}/complete`),
      videoProgress: (lessonId: string, watchedSeconds: number, ended = false) => post<VideoProgressResult>(`/learning/lessons/${lessonId}/video-progress`, { watchedSeconds: Math.floor(watchedSeconds), ended }),
      /** prática GERADA no aparelho (treino de ouvido, microfone): o app corrige e informa acertos/total */
      practiceResult: (lessonId: string, b: { correct: number; total: number }) => post<{ passed: boolean; passingPct: number; correct: number; total: number; scorePct: number; xpEarned: number; completion: { next?: { lessonId?: string } | null; alreadyCompleted?: boolean } | null }>(`/learning/lessons/${lessonId}/practice-result`, b),
      submitPractice: (lessonId: string, answers: AnswerPayload[]) => post<{ result?: { correct: number; total: number; scorePct: number; xpEarned: number; items: Array<Record<string, unknown>> }; [k: string]: unknown }>(`/learning/lessons/${lessonId}/practice`, { answers }),
    },
    dashboards: {
      master: (q: { from?: string; to?: string } = {}) => get<MasterDashboard>(`/dashboards/master${qs(q)}`),
      company: (tenantId: string, q: { from?: string; to?: string; departmentId?: string } = {}) => get<CompanyDashboard>(`/dashboards/companies/${tenantId}${qs(q)}`),
    },
    master: {
      tenants: (q: { page?: number; pageSize?: number; search?: string; type?: string; status?: string } = {}) => get<Page<Tenant>>(`/master/tenants${qs(q)}`),
      tenant: (id: string) => get<Tenant>(`/master/tenants/${id}`),
      imports: () => get<unknown>('/master/content/imports'),
    },
    company: (tenantId: string) => ({
      overview: () => get<Record<string, unknown>>(`/companies/${tenantId}`),
      people: (q: { search?: string; departmentId?: string; status?: string } = {}) => get<CompanyPerson[]>(`/companies/${tenantId}/people${qs(q)}`),
      departments: () => get<Array<{ id: string; name: string; [k: string]: unknown }>>(`/companies/${tenantId}/departments`),
    }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
