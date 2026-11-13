// Ícones dos acessórios do Hangar (ACCI do protótipo universo-folks.html), em SVG para o SvgXml.
const STAR = '<path d="M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.5 6.7L12 17.3l-6.1 3.4 1.5-6.7-5.1-4.6 6.8-.7z" fill="#fff"/>';

const ACCI: Record<string, string> = {
  nada: '<svg viewBox="0 0 24 24" fill="none" stroke="#aaa7d0" stroke-width="2.4"><circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/></svg>',
  antena: '<svg viewBox="0 0 24 24"><path d="M12 22V9" stroke="#fff" stroke-width="2.6"/><circle cx="12" cy="6" r="4" fill="#fff"/></svg>',
  fones: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="7" rx="2" fill="#fff"/><rect x="16.5" y="14" width="4.5" height="7" rx="2" fill="#fff"/></svg>',
  festa: '<svg viewBox="0 0 24 24"><path d="M6 21L12 3l6 18z" fill="#fff"/><circle cx="12" cy="3" r="2.5" fill="#ffe680"/></svg>',
  estrela: `<svg viewBox="0 0 24 24">${STAR}</svg>`,
  mochila: '<svg viewBox="0 0 24 24"><rect x="5" y="6" width="14" height="15" rx="4" fill="#fff"/><path d="M9 6V4h6v2" stroke="#fff" stroke-width="2.2" fill="none"/></svg>',
  violao: '<svg viewBox="0 0 24 24"><circle cx="9" cy="16" r="5.5" fill="#fff"/><circle cx="9" cy="16" r="1.6" fill="#9b7bff"/><path d="M12.5 12.5L20 5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>',
  jetpack: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="6" height="13" rx="3" fill="#fff"/><rect x="14" y="3" width="6" height="13" rx="3" fill="#fff"/><path d="M5 17l2 5 2-5M15 17l2 5 2-5" fill="#ffe680"/></svg>',
  capa: '<svg viewBox="0 0 24 24"><path d="M8 3h8l4 18H4z" fill="#fff"/></svg>',
};

/** Ícone do acessório (cabeça e costas); itens de cor não têm ícone. */
export function accessorySvg(key: string): string | null {
  return ACCI[key] ?? null;
}

/** Cadeado pequeno para itens ainda bloqueados. */
export const LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="3" fill="#fff"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#fff" stroke-width="2.4" fill="none"/></svg>';
