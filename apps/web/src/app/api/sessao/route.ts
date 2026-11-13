import { authApi } from '@folks/shared';
import { SERVER_API_URL } from '@/lib/env';
import { clearSession, errorResponse, readRefreshToken, sessionResponse } from '@/lib/session-cookie';

/** Renova a sessão com o cookie (abrir a página, token vencido). */
export async function POST() {
  const rt = await readRefreshToken();
  // sem cookie = visitante (não é erro): 200 com sessão nula, sem poluir o console
  if (!rt) return Response.json({ session: null }, { headers: { 'cache-control': 'no-store' } });
  try {
    return sessionResponse(await authApi(SERVER_API_URL).refresh(rt));
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 401 || status === 400) return clearSession(401, { message: 'Sua sessão expirou. Entre de novo.' });
    return errorResponse(e);
  }
}
