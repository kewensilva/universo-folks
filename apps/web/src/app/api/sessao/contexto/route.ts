import { authApi, type ContextMode } from '@folks/shared';
import { SERVER_API_URL } from '@/lib/env';
import { errorResponse, sessionResponse } from '@/lib/session-cookie';

/** Troca o contexto ativo (Master / empresa / Individual) e grava o novo refresh no cookie. */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const body = await req.json().catch(() => ({}));
  if (!auth) return Response.json({ message: 'Sessão não iniciada' }, { status: 401 });
  if (!['PLATFORM', 'TENANT', 'B2C'].includes(body?.mode)) return Response.json({ message: 'Contexto inválido' }, { status: 400 });
  try {
    return sessionResponse(await authApi(SERVER_API_URL).switchContext(auth, body.mode as ContextMode, body.tenantId));
  } catch (e) {
    return errorResponse(e);
  }
}
