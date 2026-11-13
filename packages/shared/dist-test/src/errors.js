"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = void 0;
exports.apiErrorFrom = apiErrorFrom;
exports.errorMessage = errorMessage;
/** Erro da API: a mensagem já vem em pt-BR do servidor. `reason` traz o código de negócio. */
class ApiError extends Error {
    constructor(status, message, 
    /** PREMIUM_REQUIRED, COMING_SOON, daily_limit, license_limit, other_company... */
    reason, body) {
        super(message);
        this.status = status;
        this.reason = reason;
        this.body = body;
        this.name = 'ApiError';
    }
    get isPremiumRequired() { return this.reason === 'PREMIUM_REQUIRED'; }
    get isDailyLimit() { return this.reason === 'daily_limit' || this.reason === 'DAILY_LIMIT'; }
    get isUnauthorized() { return this.status === 401; }
}
exports.ApiError = ApiError;
function apiErrorFrom(status, body) {
    const raw = body?.message;
    const message = Array.isArray(raw) ? raw.join('; ') : typeof raw === 'string' ? raw : status >= 500 ? 'Algo deu errado no servidor. Tente de novo em instantes.' : 'Não foi possível concluir a ação.';
    return new ApiError(status, message, body?.reason ?? body?.code ?? body?.error_code, body);
}
/** Mensagem para mostrar ao usuário a partir de qualquer erro. */
function errorMessage(e) {
    if (e instanceof ApiError)
        return e.message;
    if (e instanceof Error && /fetch|network|Failed to fetch|Network request failed/i.test(e.message))
        return 'Sem conexão com o servidor. Confira sua internet.';
    return 'Não foi possível concluir a ação.';
}
