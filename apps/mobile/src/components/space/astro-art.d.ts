export interface AstroLook { head?: string; pose?: string; prop?: string; back?: string; chest?: boolean }
export function astroSvg(o?: { mood?: 'idle' | 'wave' | 'celebrate'; look?: AstroLook | null; suit?: Record<string, string> }): string;
