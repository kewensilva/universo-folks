/** Mistura duas cores hex (como o color-mix do CSS do protótipo). p = quanto de `b` entra (0..1). */
export function mix(a: string, b: string, p: number) {
  const h = (c: string) => {
    const s = c.replace('#', '');
    const f = s.length === 3 ? s.split('').map((x) => x + x).join('') : s.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
  };
  const [x, y] = [h(a), h(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * p).toString(16).padStart(2, '0')).join('');
}

/** Versão mais escura da cor, para texto sobre branco (ex.: balão "COMEÇAR"). */
export const shade = (c: string, p = 0.28) => mix(c, '#000000', p);
