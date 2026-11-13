/**
 * Tokens de design tirados do protótipo do cliente (universo-folks.html).
 * O visual fica como no protótipo: tema espacial escuro, Plus Jakarta Sans, âmbar como destaque.
 */
export const colors = {
  bg: '#03040f',
  bgElevated: '#0b0d22',
  card: '#12142e',
  cardBorder: 'rgba(170,167,208,0.16)',
  ink: '#f4f2ff',
  muted: '#aaa7d0',
  dim: '#7a77a3',
  amber: '#ffb020',
  amberDark: '#c97f00',
  green: '#45d483',
  greenDark: '#23a35c',
  red: '#ff5c6c',
  redDark: '#cc3445',
  blue: '#3d8bff',
  blueDark: '#2462c9',
  purple: '#9b7bff',
  pink: '#ff5fa2',
  gold: '#ffc83d',
  /** texto sobre botão âmbar */
  onAmber: '#2a1700',
} as const;

export const font = {
  family: 'Plus Jakarta Sans',
  weights: { medium: '500', semibold: '600', bold: '700', extrabold: '800' },
  googleUrl: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Cor do selo de cada etiqueta de planeta. */
export const badgeColor: Record<string, string> = { GRATIS: colors.green, PREMIUM: colors.amber, EM_BREVE: colors.dim, CERTIFICADO: colors.purple };
export const badgeLabel: Record<string, string> = { GRATIS: 'Grátis', PREMIUM: 'Premium', EM_BREVE: 'Em breve', CERTIFICADO: 'Certificado' };

/** Cor principal do planeta (visual do catálogo > themeColor > âmbar). */
export const planetColor = (p: { themeColor?: string | null; visual?: { colors?: string[] } | null }) => p.visual?.colors?.[0] ?? p.themeColor ?? colors.amber;
