/**
 * Ícones do protótipo do cliente (universo-folks.html), copiados como SVG em texto para o
 * react-native-svg (SvgXml): ícones das etapas da trilha e figurinhas dos planetas.
 */

const circ = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
function gearD(cx: number, cy: number, r1: number, r2: number, n: number) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n, r = i % 2 ? r1 : r2, a2 = a + Math.PI / n;
    d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2) + 'L' + (cx + r * Math.cos(a2)).toFixed(2) + ' ' + (cy + r * Math.sin(a2)).toFixed(2);
  }
  return d + 'Z' + circ(cx, cy, 3);
}

/** Ícones brancos 24×24 dos nós da trilha (aula, vídeo, prática, prova, concluído, bloqueado...). */
export const NODE_ICONS: Record<string, string> = {
 tx:'<path d="M7.5 3.5v6M4.5 6.5h6M13.5 6.5h6M5 14.5l5 5M10 14.5l-5 5M13.5 17h6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="16.5" cy="14" r="1.3" fill="#fff"/><circle cx="16.5" cy="20" r="1.3" fill="#fff"/>',
 rev:'<path d="M19 12a7 7 0 1 1-2.1-5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M19 4v4h-4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
 inf:'<path d="M12 12c-2-2.6-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.4 5.5-4s3.6-4 5.5-4a4 4 0 0 1 0 8c-1.9 0-3.5-1.4-5.5-4z" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>',
 note:'<path d="M9 18V6l10-2v12" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="3" fill="#fff"/><circle cx="16.5" cy="16" r="3" fill="#fff"/>',
 chord:'<rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M5 9h14M5 15h14M10 3v18M14 3v18" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="2" fill="#fff"/>',
 pct:'<circle cx="7" cy="7" r="3" fill="none" stroke="#fff" stroke-width="2.6"/><circle cx="17" cy="17" r="3" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M18 5L6 19" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>',
 gear:'<circle cx="12" cy="12" r="6" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="3 2.3"/><circle cx="12" cy="12" r="2.5" fill="#fff"/>',
 coin:'<circle cx="12" cy="12" r="8.5" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M14.5 9c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2.2 2.6 1 2.6 2.3-1.2 2.1-2.6 2.1c-1.2 0-2.2-.6-2.6-1.5M12 6v12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
 chat:'<path d="M4 5h16v11H10l-5 4v-4H4z" fill="#fff"/>',
 mega:'<path d="M3 10v4h3l7 4V6L6 10z" fill="#fff"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
 flag:'<path d="M6 21V4" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M6 4h12l-3 4 3 4H6z" fill="#fff"/>',
 heart:'<path d="M12 20s-8-4.6-8-10.2A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.8C20 15.4 12 20 12 20z" fill="#fff"/>',
 deal:'<path d="M4 8h12l-3-3M20 16H8l3 3" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>',
 clock:'<circle cx="12" cy="12" r="8.5" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M12 7v5l3.5 2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
 book:'<path d="M2.5 5.5Q7 3.5 11.2 6v14Q7 17.8 2.5 19.5z" fill="#fff"/><path d="M21.5 5.5Q17 3.5 12.8 6v14q4.2-2.2 8.7-.5z" fill="#fff" opacity=".75"/>',
 play:'<path d="M8 4.5l12 7.5-12 7.5z" fill="#fff"/>',
 cards:'<rect x="3" y="7" width="12" height="14" rx="2.5" fill="#fff" opacity=".6"/><rect x="9" y="3" width="12" height="14" rx="2.5" fill="#fff"/>',
 ear:'<path d="M6 10a6 6 0 0 1 12 0c0 3-2 4-3 5.5S14 19 12 20a3 3 0 0 1-4-2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M9.5 10a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-1.5 3.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
 trophy:'<path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#fff"/><path d="M7 5H4v2a3.5 3.5 0 0 0 3.5 3.5M17 5h3v2a3.5 3.5 0 0 1-3.5 3.5" fill="none" stroke="#fff" stroke-width="2"/><rect x="10.5" y="12" width="3" height="5" fill="#fff"/><rect x="7" y="17" width="10" height="3.5" rx="1.2" fill="#fff"/>',
 medal:'<path d="M7 2h4l2 6H9zM13 2h4l-2 6h-4z" fill="#fff" opacity=".7"/><circle cx="12" cy="15" r="6.5" fill="#fff"/><path d="M12 11.6l1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z" fill="#ffb020"/>',
 check:'<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2.5" fill="#fff"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#fff" stroke-width="2.6" fill="none"/>',
 star:'<path d="M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.5 6.7L12 17.3l-6.1 3.4 1.5-6.7-5.1-4.6 6.8-.7z" fill="#fff"/>'};

export const nodeIconSvg = (k: string) => `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${NODE_ICONS[k] ?? NODE_ICONS.star}</svg>`;

/** Ícone da etapa pelo tipo da lição (como o nodeIcon do protótipo). */
export function lessonIcon(l: { type: string; isReview?: boolean; questionSource?: string }) {
  if (l.isReview) return 'rev';
  return ({ LESSON: 'book', VIDEO: 'play', PRACTICE: l.questionSource === 'GENERATED' ? 'ear' : 'cards', INTERACTIVE: 'star', EXAM: 'trophy' } as Record<string, string>)[l.type] ?? 'star';
}

/** Figurinhas dos planetas (visual.orbitIcons): ícone conhecido ou o próprio texto (ex.: "%", "π"). */
const ORB: Record<string, [string, string, number?, number?][]> = {
 note:[[`M9 18V6l10-2v12`,'s',2.6],[circ(6.5,18,3),'f'],[circ(16.5,16,3),'f']],
 notes2:[[`M8 18V7l10-3v11`,'s',2.6],[`M8 9.5l10-3`,'s',3.6],[circ(5.5,18,2.8),'f'],[circ(15.5,15,2.8),'f']],
 pick:[[`M12 21.5C7 16 3.5 10.5 3.5 7.5c0-3 4-4.5 8.5-4.5s8.5 1.5 8.5 4.5c0 3-3.5 8.5-8.5 14z`,'f']],
 gear:[[gearD(12,12,6.5,9.5,8),'fe']],
 wrench:[[`M14.5 3a5 5 0 0 0-4.6 6.9L3 16.8 7.2 21l6.9-6.9A5 5 0 0 0 21 9.5l-3 3-3.5-1-1-3.5 3-3A5 5 0 0 0 14.5 3z`,'f']],
 bolt:[[`M13 2L4 14h7l-1 8 9-12h-7z`,'f']],
 coin:[[circ(12,12,9),'f'],[circ(12,12,5.8),'s',1.8,1]],
 chat:[[`M4 5h16v11H10l-5 4v-4H4z`,'f']],
 chatok:[[`M4 5h16v11H10l-5 4v-4H4z`,'f'],[`M8 10.5l2.5 2.5 5-5`,'s',2.2,1]],
 star:[[`M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.5 6.7L12 17.3l-6.1 3.4 1.5-6.7-5.1-4.6 6.8-.7z`,'f']],
 mega:[[`M3 10v4h3l7 4V6L6 10z`,'f'],[`M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11`,'s',2.2]],
 mic:[[`M9 3h6v10a3 3 0 0 1-6 0z`,'f'],[`M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8 21h8`,'s',2.2]],
 flag:[[`M6 21V4`,'s',2.6],[`M6 4h12l-3 4 3 4H6z`,'f']],
 crown:[[`M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z`,'f']],
 heart:[[`M12 20s-8-4.6-8-10.2A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.8C20 15.4 12 20 12 20z`,'f']],
 deal:[[`M4 8h12l-3-3M20 16H8l3 3`,'s',2.8]],
 briefcase:[[`M3 8h18v12H3z`,'f'],[`M9 8V5h6v3`,'s',2.2]],
 clock:[[circ(12,12,8.5),'s',2.6],[`M12 7v5l3.5 2`,'s',2.6]],
 hourglass:[[`M6 3h12M6 21h12`,'s',2.6],[`M7 3c0 5 5 6 5 9s-5 4-5 9h10c0-5-5-6-5-9s5-4 5-9z`,'f']]};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function orbSvg(k: string, col: string, col2 = '#1b1840') {
  const sp = ORB[k];
  if (!sp) return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="12" y="18.5" text-anchor="middle" font-size="19" font-weight="800" fill="${col}">${esc(k)}</text></svg>`;
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${sp
    .map(([d, m, w, c2]) => {
      const c = c2 ? col2 : col;
      return m === 's'
        ? `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${d}" fill="${c}"${m === 'fe' ? ' fill-rule="evenodd"' : ''}/>`;
    })
    .join('')}</svg>`;
}
