/**
 * Visual de uma questão em dados, sem injetar HTML na tela (as duas plataformas desenham igual).
 * Formatos do conteúdo do Claude: SVG; HTML com frase de lacuna (gapln/gapb) ou diálogo (dlgq: dlgctx + dlgb them/me).
 */
export type QuestionVisual =
  | { kind: 'svg'; svg: string }
  | { kind: 'image'; url: string }
  | { kind: 'gap'; parts: Array<{ text: string } | { blank: true }> }
  | { kind: 'dialog'; context?: string; lines: Array<{ who: 'them' | 'me'; text: string }> }
  | { kind: 'text'; text: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
/** Tira as tags e decodifica as entidades mais comuns. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function parseVisual(v?: { kind: string; svg?: string; html?: string; url?: string } | null): QuestionVisual | null {
  if (!v) return null;
  if (v.kind === 'SVG' && v.svg) return { kind: 'svg', svg: v.svg };
  if ((v.kind === 'IMAGE' || v.kind === 'URL') && v.url) return { kind: 'image', url: v.url };
  const html = v.html ?? '';
  if (!html) return null;
  if (/class="gapln"/.test(html)) {
    const inner = html.replace(/^[\s\S]*?<div class="gapln">/, '').replace(/<\/div>\s*$/, '');
    const parts: Array<{ text: string } | { blank: true }> = [];
    for (const [k, seg] of inner.split(/<b class="gapb">[\s\S]*?<\/b>/).entries()) {
      if (k > 0) parts.push({ blank: true });
      const t = htmlToText(seg);
      if (t) parts.push({ text: t });
    }
    return { kind: 'gap', parts };
  }
  if (/class="dlgq"/.test(html)) {
    const ctx = html.match(/<div class="dlgctx">([\s\S]*?)<\/div>/);
    const lines = [...html.matchAll(/<div class="dlgb (them|me)">([\s\S]*?)<\/div>/g)].map((m) => ({ who: m[1] as 'them' | 'me', text: htmlToText(m[2]) }));
    return { kind: 'dialog', context: ctx ? htmlToText(ctx[1]) : undefined, lines };
  }
  const text = htmlToText(html);
  return text ? { kind: 'text', text } : null;
}
