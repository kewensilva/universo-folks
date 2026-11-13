import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { AstroLook } from './astro-art';
import { Astronaut, type AstroMood } from './astronaut';
import { Text } from '@/components/ui';

/**
 * Astronauta guia com balão de fala (.guide/.bubble do protótipo): aparece nas aulas,
 * nos vídeos e nos resultados. O balão "salta" de leve quando o texto muda.
 */
export function Guide({ text, mood = 'idle', look, size = 96 }: { text: string; mood?: AstroMood; look?: AstroLook | null; size?: number }) {
  const pop = useSharedValue(1);
  useEffect(() => {
    pop.value = 0;
    pop.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.back(2)) });
  }, [text, pop]);
  const style = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * pop.value, transform: [{ scale: 0.92 + 0.08 * pop.value }, { translateY: 6 * (1 - pop.value) }] }));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      <Astronaut mood={mood} look={look} width={size} />
      <Animated.View style={[{ flex: 1, marginBottom: size * 0.32 }, style]}>
        <View style={{ position: 'absolute', left: -8, bottom: 16, width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderRightWidth: 9, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: '#fff' }} />
        <View accessibilityRole="text" style={{ backgroundColor: '#fff', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 15, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}>
          <Text weight="bold" size={15} style={{ color: '#22204a', lineHeight: 21 }}>{text}</Text>
        </View>
      </Animated.View>
    </View>
  );
}
