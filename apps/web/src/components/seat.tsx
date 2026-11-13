'use client';

import { Progress } from './ui';

/** Uso de licenças: verde, âmbar a partir de 85%, vermelho no limite. */
export function Seat({ used, max }: { used: number; max: number }) {
  const pct = max ? (used / max) * 100 : 0;
  return <div><div className="text-xs"><b>{used}</b><span className="text-dim"> de {max}</span></div><Progress value={pct} className="mt-1" color={pct >= 100 ? 'var(--color-red)' : pct >= 85 ? 'var(--color-amber)' : 'var(--color-green)'} /></div>;
}

