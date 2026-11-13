import type { PlanetVisual } from '@folks/shared';

/**
 * Planeta no estilo do protótipo: esfera com gradiente nas cores do tema e anel opcional.
 * (A arte completa com astronauta, em SVG, está na pendência da ADR 0012.)
 */
export function PlanetOrb({ visual, themeColor, size = 120, label }: { visual?: PlanetVisual | null; themeColor?: string | null; size?: number; label?: string }) {
  const [c1, c2, c3] = [visual?.colors?.[0] ?? themeColor ?? '#ffb020', visual?.colors?.[1] ?? '#1a1240', visual?.colors?.[2] ?? '#ffffff'];
  return (
    <div className="relative grid place-items-center" style={{ width: size * 1.5, height: size * 1.15 }} role="img" aria-label={label ? `Planeta ${label}` : 'Planeta'}>
      <div
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 32% 28%, ${c3}cc 0%, ${c1} 32%, ${c2} 100%)`,
          boxShadow: `0 0 ${size / 3}px ${c1}55, inset -${size / 8}px -${size / 10}px ${size / 5}px rgba(0,0,0,.45)`,
        }}
      />
      {visual?.ring !== false && (
        <div
          className="pointer-events-none absolute rounded-[50%]"
          style={{ width: size * 1.45, height: size * 0.42, border: `${Math.max(3, size / 24)}px solid ${c1}aa`, transform: 'rotate(-14deg)', boxShadow: `0 0 18px ${c1}44` }}
        />
      )}
    </div>
  );
}
