import { authApi } from '@folks/shared';
import { SERVER_API_URL } from '@/lib/env';
import { errorResponse, sessionResponse } from '@/lib/session-cookie';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
    return Response.json({ message: 'Informe e-mail e senha.' }, { status: 400 });
  }
  try {
    return sessionResponse(await authApi(SERVER_API_URL).login(body.email.trim(), body.password));
  } catch (e) {
    return errorResponse(e);
  }
}
