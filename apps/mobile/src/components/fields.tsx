import { useState } from 'react';
import { Pressable, Switch, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, radius } from '@folks/shared';
import { Text, s } from './ui';

/** Campo com rótulo em cima (.fld do protótipo). */
export function Field({ label, hint, style, ...p }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text tone="muted" weight="bold" size={13}>{label}</Text>
      <TextInput placeholderTextColor={colors.dim} accessibilityLabel={label} {...p} style={[s.input, style]} />
      {hint ? <Text tone="dim" size={12}>{hint}</Text> : null}
    </View>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <Circle cx={12} cy={12} r={3} />
      {!open && <Path d="M4 4l16 16" />}
    </Svg>
  );
}

/** Senha com o botão de mostrar/ocultar (olho), como nos apps de banco e lojas. */
export function PasswordField({ label, hint, ...p }: Omit<TextInputProps, 'secureTextEntry'> & { label: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text tone="muted" weight="bold" size={13}>{label}</Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          placeholderTextColor={colors.dim}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          {...p}
          secureTextEntry={!show}
          style={[s.input, { paddingRight: 52 }]}
        />
        <Pressable
          onPress={() => setShow((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'}
          hitSlop={8}
          style={{ position: 'absolute', right: 6, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}>
          <EyeIcon open={show} />
        </Pressable>
      </View>
      {hint ? <Text tone="dim" size={12}>{hint}</Text> : null}
    </View>
  );
}

/** "25/12/1990" → "1990-12-25" (null se a data não existe). */
export function brDateToIso(v: string): string | null {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +mo - 1 || date.getUTCDate() !== +d) return null;
  if (date.getTime() > Date.now() || +y < 1900) return null;
  return `${y}-${mo}-${d}`;
}

/** Máscara DD/MM/AAAA enquanto digita. */
export function maskBrDate(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
}

/** Linha de ajuste com chave liga/desliga (.setrow + .switch). */
export function SwitchRow({ label, sub, value, onChange, disabled }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={rowStyle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="bold">{label}</Text>
        {sub ? <Text tone="muted" size={13}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.green }}
        thumbColor="#fff"
      />
    </View>
  );
}

/** Linha que abre algo (seta à direita). */
export function LinkRow({ label, sub, onPress, danger }: { label: string; sub?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [rowStyle, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="bold" tone={danger ? 'red' : 'ink'}>{label}</Text>
        {sub ? <Text tone="muted" size={13}>{sub}</Text> : null}
      </View>
      <Text tone="dim" size={20}>›</Text>
    </Pressable>
  );
}

/** Opção em pílula (.chip). */
export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 99, borderWidth: 1.5, borderColor: on ? colors.amber : colors.cardBorder, backgroundColor: on ? `${colors.amber}22` : colors.card }}>
      <Text weight="black" size={14} style={{ color: on ? colors.amber : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

const rowStyle: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.cardBorder };
