import { View } from 'react-native';
import type { PlanetVisual } from '@folks/shared';
import { colors } from '@folks/shared';

/** Planeta no estilo do protótipo (esfera + brilho + anel). A arte SVG completa é pendência da ADR 0012. */
export function PlanetOrb({ visual, themeColor, size = 80 }: { visual?: PlanetVisual | null; themeColor?: string | null; size?: number }) {
  const c1 = visual?.colors?.[0] ?? themeColor ?? colors.amber;
  const c2 = visual?.colors?.[1] ?? '#1a1240';
  return (
    <View style={{ width: size * 1.5, height: size * 1.15, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="image">
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: c1, overflow: 'hidden', shadowColor: c1, shadowOpacity: 0.6, shadowRadius: size / 3, elevation: 8 }}>
        <View style={{ position: 'absolute', right: -size * 0.25, bottom: -size * 0.25, width: size * 0.9, height: size * 0.9, borderRadius: size, backgroundColor: c2, opacity: 0.55 }} />
        <View style={{ position: 'absolute', left: size * 0.18, top: size * 0.14, width: size * 0.28, height: size * 0.2, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.45)' }} />
      </View>
      {visual?.ring !== false && (
        <View pointerEvents="none" style={{ position: 'absolute', width: size * 1.45, height: size * 0.42, borderRadius: size, borderWidth: Math.max(3, size / 24), borderColor: `${c1}aa`, transform: [{ rotate: '-14deg' }] }} />
      )}
    </View>
  );
}
