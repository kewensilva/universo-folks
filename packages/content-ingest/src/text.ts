import { createHash } from 'node:crypto';

/** "Comunicação Assertiva!" -> "comunicacao-assertiva" */
export function slugify(input: string): string {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Normaliza nomes de chave para comparação: "Título_do Curso" -> "titulodocurso" */
export function keyNorm(k: string): string {
  return String(k).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function clean(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\r\n/g, '\n').trim();
  return s.length ? s : undefined;
}

/** Vimeo: extrai id e hash de URLs (vimeo.com/123/abc, player.vimeo.com/video/123?h=abc). */
export function parseVimeo(url: string): { id: string; hash?: string } | null {
  const m = String(url).match(/vimeo\.com\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/|manage\/videos\/)?(\d+)(?:\/([a-zA-Z0-9]+))?/);
  if (!m) return null;
  const h = String(url).match(/[?&]h=([a-zA-Z0-9]+)/);
  return { id: m[1], hash: m[2] ?? h?.[1] };
}

/** JSON estável (chaves ordenadas) para hash de conteúdo. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      // null e ausente são equivalentes para o hash (estabilidade entre passadas e versões)
      .filter((k) => (v as any)[k] !== undefined && (v as any)[k] !== null)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as any)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const contentHash = (v: unknown) => sha256(stableStringify(v)).slice(0, 32);
