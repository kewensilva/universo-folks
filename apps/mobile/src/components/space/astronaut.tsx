import { memo, useEffect, useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useStill } from '@/lib/motion';
import { SvgXml } from 'react-native-svg';
import type { AstronautOutfit } from '@folks/shared';
import { useMyOutfit } from '@/lib/outfit';
import { astroSvg, type AstroLook } from './astro-art';

export type AstroMood = 'idle' | 'wave' | 'celebrate';

/**
 * Astronauta da Folks (desenho do protótipo). `look` vem do visual do planeta (cabeça, pose, objeto),
 * ex.: no Feedback ele segura a placa com o ✓. A roupa é a do Hangar da pessoa (ou `outfit`, para experimentar).
 *  - idle: flutua no espaço (a-float do protótipo);
 *  - wave: acena, balançando;
 *  - celebrate: pula comemorando (a-hop).
 */
export const Astronaut = memo(function Astronaut({ mood = 'idle', look, outfit, width = 110, style }: { mood?: AstroMood; look?: AstroLook | null; outfit?: AstronautOutfit; width?: number; style?: ViewStyle }) {
  const mine = useMyOutfit();
  const suit = outfit ?? mine;
  const xml = useMemo(() => astroSvg({ mood, look: look ?? undefined, suit }), [mood, look, suit]);
  const still = useStill();
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    t.value = 0;
    t.value =
      mood === 'celebrate'
        ? withRepeat(withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }), -1, false)
        : withRepeat(withSequence(withTiming(1, { duration: mood === 'wave' ? 700 : 1600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: mood === 'wave' ? 700 : 1600, easing: Easing.inOut(Easing.sin) })), -1, false);
  }, [mood, still, t]);
  const anim = useAnimatedStyle(() => {
    if (mood === 'celebrate') {
      // pulo: sobe e desce com "amassadinha" no chão
      const up = Math.sin(t.value * Math.PI);
      return { transform: [{ translateY: -20 * up }, { scaleX: 1 + 0.05 * (1 - up) - 0.03 * up }, { scaleY: 1 - 0.06 * (1 - up) + 0.04 * up }] };
    }
    const k = t.value * 2 - 1; // -1..1
    return { transform: [{ translateY: -7 * t.value }, { rotate: `${(mood === 'wave' ? 4 : 1.5) * k}deg` }] };
  });
  const height = (width * 222) / 160;
  return (
    <Animated.View style={[{ width, height }, style, anim]} accessible accessibilityRole="image" accessibilityLabel="Astronauta da Folks">
      <SvgXml xml={xml} width={width} height={height} />
    </Animated.View>
  );
});
