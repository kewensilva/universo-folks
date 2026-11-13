"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authApi = authApi;
exports.createApiClient = createApiClient;
const errors_1 = require("./errors");
/** FormData vai sem content-type (o navegador define o boundary). */
const isForm = (b) => typeof FormData !== 'undefined' && b instanceof FormData;
async function raw(f, url, method, body, token) {
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
async function send(f, url, method, body, token) {
    const res = await raw(f, url, method, body, token);
    const text = await res.text();
    let data = undefined;
    if (text) {
        try {
            data = JSON.parse(text);
        }
        catch {
            data = text;
        }
    }
    if (!res.ok)
        throw (0, errors_1.apiErrorFrom)(res.status, data);
    return data;
}
/**
 * Chamadas de AUTENTICAÇÃO direto na API (sem token de acesso).
 * App: usa direto. Web: só o servidor do Next (BFF) usa, para o refresh ficar em cookie httpOnly.
 */
function authApi(baseUrl, f = fetch) {
    const u = (p) => `${baseUrl.replace(/\/$/, '')}${p}`;
    return {
        login: (email, password) => send(f, u('/auth/login'), 'POST', { email, password }, null),
        register: (b) => send(f, u('/auth/register'), 'POST', b, null),
        refresh: (refreshToken) => send(f, u('/auth/refresh'), 'POST', { refreshToken }, null),
        logout: (refreshToken) => send(f, u('/auth/logout'), 'POST', { refreshToken }, null),
        switchContext: (accessToken, mode, tenantId) => send(f, u('/auth/switch-context'), 'POST', { mode, ...(tenantId ? { tenantId } : {}) }, accessToken),
        forgotPassword: (email) => send(f, u('/auth/password/forgot'), 'POST', { email }, null),
        resetPassword: (b) => send(f, u('/auth/password/reset'), 'POST', b, null),
    };
}
/** Cliente tipado da API, com renovação automática do token (uma renovação por vez). */
function createApiClient(o) {
    const f = o.fetch ?? fetch;
    const base = o.baseUrl.replace(/\/$/, '');
    let refreshing = null;
    const refreshOnce = () => (refreshing ?? (refreshing = o.refresh().finally(() => { refreshing = null; })));
    async function request(method, path, body) {
        try {
            return await send(f, base + path, method, body, o.getAccessToken());
        }
        catch (e) {
            if (e?.status !== 401)
                throw e;
            // refresh que lança = falha passageira (sem conexão): propaga o erro e mantém a sessão.
            // refresh que devolve null = sessão expirada de fato: avisa para ir ao login.
            const token = await refreshOnce();
            if (!token) {
                o.onSessionExpired?.();
                throw e;
            }
            return send(f, base + path, method, body, token);
        }
    }
    /** Download (CSV, HTML de certificado): devolve o arquivo como Blob, com renovação de token. */
    async function download(path) {
        let res = await raw(f, base + path, 'GET', undefined, o.getAccessToken());
        if (res.status === 401) {
            const token = await refreshOnce();
            if (!token) {
                o.onSessionExpired?.();
                throw (0, errors_1.apiErrorFrom)(401, { message: 'Sua sessão expirou. Entre de novo.' });
            }
            res = await raw(f, base + path, 'GET', undefined, token);
        }
        if (!res.ok)
            throw (0, errors_1.apiErrorFrom)(res.status, await res.json().catch(() => ({})));
        return res.blob();
    }
    const get = (p) => request('GET', p);
    const post = (p, b = {}) => request('POST', p, b);
    const patch = (p, b) => request('PATCH', p, b);
    const qs = (q) => {
        const s = Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
        return s ? `?${s}` : '';
    };
    return {
        request,
        download,
        /** Chamadas genéricas para as telas de gestão (tipos ficam na própria tela). */
        http: {
            get: (p, q) => get(p + (q ? qs(q) : '')),
            post: (p, b = {}) => request('POST', p, b),
            patch: (p, b) => request('PATCH', p, b),
            put: (p, b) => request('PUT', p, b),
            del: (p) => request('DELETE', p),
            /** multipart (ex.: upload de arquivos de importação) */
            upload: (p, form) => request('POST', p, form),
        },
        auth: {
            contexts: () => get('/auth/contexts'),
            joinCompany: (code) => post('/auth/join-company', { code }),
            changePassword: (currentPassword, newPassword) => post('/auth/change-password', { currentPassword, newPassword }),
        },
        me: {
            get: () => get('/me'),
            update: (b) => patch('/me', b),
            progress: () => get('/me/progress'),
            entitlements: () => get('/me/entitlements'),
            preferences: () => get('/me/preferences'),
            updatePreferences: (b) => patch('/me/preferences', b),
            /** Hangar: roupas e acessórios do astronauta (liberados por nível) */
            hangar: () => get('/me/hangar'),
            equip: (itemId) => request('PUT', `/me/hangar/${itemId}`, {}),
            /** empresa do colaborador: departamentos, trilhas obrigatórias e ranking */
            company: () => get('/me/company'),
        },
        billing: {
            /** Básico, Premium, Premium Plus: galáxias e preços (público) */
            tiers: () => get('/billing/tiers'),
        },
        catalog: {
            home: () => get('/catalog/home'),
            planets: (q = {}) => get(`/catalog/planets${qs(q)}`),
            planet: (slug) => get(`/catalog/planets/${encodeURIComponent(slug)}`),
        },
        learning: {
            trail: (courseId) => get(`/learning/courses/${courseId}/trail`),
            lesson: (lessonId) => get(`/learning/lessons/${lessonId}`),
            completeLesson: (lessonId) => post(`/learning/lessons/${lessonId}/complete`),
            videoProgress: (lessonId, watchedSeconds, ended = false) => post(`/learning/lessons/${lessonId}/video-progress`, { watchedSeconds: Math.floor(watchedSeconds), ended }),
            /** prática GERADA no aparelho (treino de ouvido, microfone): o app corrige e informa acertos/total */
            practiceResult: (lessonId, b) => post(`/learning/lessons/${lessonId}/practice-result`, b),
            submitPractice: (lessonId, answers) => post(`/learning/lessons/${lessonId}/practice`, { answers }),
        },
        dashboards: {
            master: (q = {}) => get(`/dashboards/master${qs(q)}`),
            company: (tenantId, q = {}) => get(`/dashboards/companies/${tenantId}${qs(q)}`),
        },
        master: {
            tenants: (q = {}) => get(`/master/tenants${qs(q)}`),
            tenant: (id) => get(`/master/tenants/${id}`),
            imports: () => get('/master/content/imports'),
        },
        company: (tenantId) => ({
            overview: () => get(`/companies/${tenantId}`),
            people: (q = {}) => get(`/companies/${tenantId}/people${qs(q)}`),
            departments: () => get(`/companies/${tenantId}/departments`),
        }),
    };
}
