import { authApi } from '@folks/shared';
import { SERVER_API_URL } from '@/lib/env';
import { clearSession, readRefreshToken } from '@/lib/session-cookie';

export async function POST() {
  const rt = await readRefreshToken();
  if (rt) await authApi(SERVER_API_URL).logout(rt).catch(() => undefined); // revoga no servidor
  return clearSession();
}
