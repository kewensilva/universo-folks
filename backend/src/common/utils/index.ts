import { createHash, randomBytes } from 'crypto';

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Percentual inteiro seguro (0..100) */
export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Código legível para certificados / join codes: ex. FK-7Q2M-9XKD */
export function humanCode(prefix: string, groups = 2): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(groups * 4);
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += alphabet[bytes[g * 4 + i] % alphabet.length];
    parts.push(s);
  }
  return [prefix, ...parts].join('-');
}

/** Data (UTC 00:00) no fuso informado - usada para streak/meta diária */
export function dayInTz(date: Date, timeZone = 'America/Sao_Paulo'): Date {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return new Date(`${s}T00:00:00.000Z`);
}

/** Vimeo: extrai id e hash de URLs como https://vimeo.com/123456/abcd ou player.vimeo.com/video/123?h=abcd */
export function parseVimeoUrl(url: string): { id: string; hash?: string } | null {
  const m = url.match(/vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/|manage\/videos\/)?(\d+)(?:\/([a-zA-Z0-9]+))?/);
  if (!m) return null;
  const hashParam = url.match(/[?&]h=([a-zA-Z0-9]+)/);
  return { id: m[1], hash: m[2] ?? hashParam?.[1] };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
