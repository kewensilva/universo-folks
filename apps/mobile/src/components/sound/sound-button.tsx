import { useEffect } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';
import { colors, radius, type SoundSpec } from '@folks/shared';
import { useStill } from '@/lib/motion';
import { Text } from '@/components/ui';

/** Barrinhas de equalizador que pulam enquanto o som toca. */
export function SoundBars({ on, color = colors.amber }: { on: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 18 }}>
      {[0, 1, 2, 3].map((i) => <Bar key={i} i={i} on={on} color={color} />)}
    </View>
  );
}
function Bar({ i, on, color }: { i: number; on: boolean; color: string }) {
  const still = useStill();
  const h = useSharedValue(0.35);
  useEffect(() => {
    if (!on || still) { cancelAnimation(h); h.value = withTiming(0.35, { duration: 150 }); return; }
    const d = 260 + i * 70;
    h.value = withRepeat(withSequence(withTiming(1, { duration: d, easing: Easing.inOut(Easing.quad) }), withTiming(0.25, { duration: d, easing: Easing.inOut(Easing.quad) })), -1, false);
  }, [on, still, i, h]);
  const st = useAnimatedStyle(() => ({ height: 18 * h.value }));
  return <Animated.View style={[{ width: 4, borderRadius: 2, backgroundColor: color }, st]} />;
}

/**
 * Botão "ouvir" de uma tela de aula ou questão (como os .demo do protótipo):
 * rótulo, legenda e as barrinhas animadas enquanto toca. Tocar de novo enquanto toca, para.
 */
export function SoundButton({ label, caption, playing, onPress, big, style }: { label: string; caption?: string; spec?: SoundSpec; playing: boolean; onPress: () => void; big?: boolean; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={playing ? `Parar: ${label}` : `Ouvir: ${label}`}
      accessibilityState={{ busy: playing }}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: big ? 16 : 12, paddingHorizontal: 14, borderRadius: radius.md,
        backgroundColor: playing ? `${colors.amber}1f` : 'rgba(255,255,255,0.05)',
        borderWidth: 1.5, borderColor: playing ? colors.amber : colors.cardBorder,
      }, pressed && { transform: [{ scale: 0.98 }] }, style]}>
      <View style={{ width: big ? 46 : 38, height: big ? 46 : 38, borderRadius: 99, backgroundColor: colors.amber, alignItems: 'center', justifyContent: 'center' }}>
        <Text weight="black" size={big ? 18 : 15} style={{ color: colors.onAmber, marginLeft: playing ? 0 : 2 }}>{playing ? '■' : '▶'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text weight="black" size={big ? 16 : 15}>{label}</Text>
        {caption ? <Text tone="muted" size={13}>{caption}</Text> : null}
      </View>
      <SoundBars on={playing} />
    </Pressable>
  );
}
