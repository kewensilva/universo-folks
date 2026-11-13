import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ApiError, type TokenPair } from '@folks/shared';

/**
 * BFF de sessão (ADR 0012): o refresh token mora num cookie httpOnly que o JavaScript
 * do navegador não lê. O navegador recebe só o access token (fica em memória).
 */
export const REFRESH_COOKIE = 'folks_rt';
const MAX_AGE = 60 * 60 * 24 * 30; // igual ao JWT_REFRESH_TTL_DAYS padrão da API

export async function readRefreshToken() {
  return (await cookies()).get(REFRESH_COOKIE)?.value ?? null;
}

/** Responde ao navegador SEM o refresh token, e grava o refresh no cookie. */
export function sessionResponse(pair: TokenPair) {
  const res = NextResponse.json({ accessToken: pair.accessToken, context: pair.context, user: pair.user });
  res.cookies.set(REFRESH_COOKIE, pair.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/sessao',
    maxAge: MAX_AGE,
  });
  res.headers.set('cache-control', 'no-store');
  return res;
}

export function clearSession(status = 200, body: unknown = { ok: true }) {
  const res = NextResponse.json(body, { status });
  res.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, path: '/api/sessao', maxAge: 0 });
  res.headers.set('cache-control', 'no-store');
  return res;
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ message: e.message, reason: e.reason }, { status: e.status });
  return NextResponse.json({ message: 'Não foi possível falar com o servidor da Folks. Tente de novo.' }, { status: 502 });
}
