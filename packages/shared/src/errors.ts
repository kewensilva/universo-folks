/** Erro da API: a mensagem já vem em pt-BR do servidor. `reason` traz o código de negócio. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** PREMIUM_REQUIRED, COMING_SOON, daily_limit, license_limit, other_company... */
    public readonly reason?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isPremiumRequired() { return this.reason === 'PREMIUM_REQUIRED'; }
  get isDailyLimit() { return this.reason === 'daily_limit' || this.reason === 'DAILY_LIMIT'; }
  get isUnauthorized() { return this.status === 401; }
}

export function apiErrorFrom(status: number, body: any): ApiError {
  const raw = body?.message;
  const message = Array.isArray(raw) ? raw.join('; ') : typeof raw === 'string' ? raw : status >= 500 ? 'Algo deu errado no servidor. Tente de novo em instantes.' : 'Não foi possível concluir a ação.';
  return new ApiError(status, message, body?.reason ?? body?.code ?? body?.error_code, body);
}

/** Mensagem para mostrar ao usuário a partir de qualquer erro. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && /fetch|network|Failed to fetch|Network request failed/i.test(e.message)) return 'Sem conexão com o servidor. Confira sua internet.';
  return 'Não foi possível concluir a ação.';
}
