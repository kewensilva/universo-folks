import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, View, type PressableProps, type TextProps, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { badgeColor, badgeLabel, colors, errorMessage, radius } from '@folks/shared';
import { SpaceBackground } from './space/space-background';

/** Fontes carregadas no _layout (Plus Jakarta Sans, como no protótipo). */
export const F = { medium: 'PlusJakartaSans_500Medium', semibold: 'PlusJakartaSans_600SemiBold', bold: 'PlusJakartaSans_700Bold', black: 'PlusJakartaSans_800ExtraBold' };

type Tone = 'ink' | 'muted' | 'dim' | 'amber' | 'green' | 'red' | 'blue' | 'purple';
export function Text({ style, tone = 'ink', weight = 'medium', size = 15, ...p }: TextProps & { tone?: Tone; weight?: keyof typeof F; size?: number }) {
  return <RNText {...p} style={[{ color: colors[tone], fontFamily: F[weight], fontSize: size }, style]} />;
}

/** Tela com o fundo escuro do protótipo. */
export function Screen({ children, scroll = true, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={padded ? s.padded : undefined}>{children}</View>;
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <SpaceBackground />
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function Card({ style, ...p }: ViewProps) {
  return <View {...p} style={[s.card, style]} />;
}

export function Button({ title, onPress, loading, disabled, variant = 'primary', style }: { title: string; onPress?: PressableProps['onPress']; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'ghost'; style?: ViewProps['style'] }) {
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }} onPress={onPress} disabled={off}
      style={({ pressed }) => [variant === 'primary' ? s.btn : s.btnGhost, pressed && !off && { transform: [{ translateY: 3 }], shadowOffset: { width: 0, height: 1 } }, off && { opacity: 0.6 }, style]}>
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.onAmber : colors.ink} /> : <Text weight="black" size={16} style={{ color: variant === 'primary' ? colors.onAmber : colors.ink }}>{title}</Text>}
    </Pressable>
  );
}

export function Progress({ value, color = colors.amber, height = 8 }: { value: number; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v) }} style={{ height, borderRadius: height, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      <View style={{ width: `${v}%`, height: '100%', backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function Badge({ code }: { code: string }) {
  const c = badgeColor[code] ?? colors.dim;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: `${c}22`, borderWidth: 1, borderColor: `${c}55` }}>
      <Text weight="black" size={10} style={{ color: c, letterSpacing: 0.5 }}>{(badgeLabel[code] ?? code).toUpperCase()}</Text>
    </View>
  );
}

export function Loading() {
  return <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={colors.amber} size="large" /></View>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: `${colors.red}66`, backgroundColor: `${colors.red}1a` }}>
      <Text tone="red" weight="bold">{errorMessage(error)}</Text>
      {onRetry && <Pressable onPress={onRetry} accessibilityRole="button"><Text weight="bold" style={{ marginTop: 8, textDecorationLine: 'underline' }}>Tentar de novo</Text></Pressable>}
    </Card>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: 16, paddingTop: 12 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 16 },
  btn: { backgroundColor: colors.amber, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', shadowColor: colors.amberDark, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  btnGhost: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  input: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: 16, paddingVertical: 14, color: colors.ink, fontFamily: F.medium, fontSize: 16 },
});
