import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useStill } from '@/lib/motion';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Fundo do app como no protótipo (initSpace/spaceFrame): espaço escuro com nebulosas,
 * estrelas em três profundidades andando devagar (paralaxe), algumas piscando e um cometa.
 * Com "reduzir movimento" ligado no aparelho, fica parado.
 */

// posições fixas (semente) para o céu não mudar a cada render
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Star = { x: number; y: number; r: number; o: number };
const makeStars = (n: number, seed: number, rMin: number, rMax: number, oMin: number, oMax: number): Star[] => {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ x: r(), y: r(), r: rMin + r() * (rMax - rMin), o: oMin + r() * (oMax - oMin) }));
};
const LAYERS = [
  { stars: makeStars(70, 11, 0.5, 0.9, 0.25, 0.5), duration: 240_000 },
  { stars: makeStars(45, 23, 0.8, 1.3, 0.4, 0.7), duration: 150_000 },
  { stars: makeStars(22, 37, 1.2, 1.9, 0.6, 0.95), duration: 90_000 },
];
const TWINKLE = makeStars(10, 51, 1.4, 2.2, 0.9, 1);
const NEBULAS: [string, number, number, number, number][] = [
  // cor, x, y (fração da tela), raio (fração da largura), opacidade — as do protótipo
  ['#6a3df0', 0.1, 0.12, 0.9, 0.22],
  ['#2b5bd8', 0.95, 0.45, 0.85, 0.18],
  ['#c23a8a', 0.05, 0.85, 0.7, 0.14],
  ['#ff9f4f', 0.85, 0.05, 0.45, 0.07],
];

export const SpaceBackground = memo(function SpaceBackground() {
  const { width: W, height: H } = useWindowDimensions();
  const still = useStill();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          {NEBULAS.map(([c], i) => (
            <RadialGradient key={i} id={`neb${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c} stopOpacity="1" />
              <Stop offset="1" stopColor={c} stopOpacity="0" />
            </RadialGradient>
          ))}
        </Defs>
        {NEBULAS.map(([, x, y, r, o], i) => <Circle key={i} cx={x * W} cy={y * H} r={r * W} fill={`url(#neb${i})`} opacity={o} />)}
      </Svg>
      {LAYERS.map((l, i) => <StarLayer key={i} stars={l.stars} duration={l.duration} W={W} H={H} still={still} />)}
      {TWINKLE.map((s, i) => <Twinkle key={i} s={s} i={i} W={W} H={H} still={still} />)}
      {!still && <Comet W={W} H={H} />}
    </View>
  );
});

/** Uma camada de estrelas desenhada duas vezes (uma embaixo da outra) para o loop não ter emenda. */
function StarLayer({ stars, duration, W, H, still }: { stars: Star[]; duration: number; W: number; H: number; still: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!still) t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [still, duration, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -t.value * H }] }));
  const dots = useMemo(() => [0, 1].flatMap((copy) => stars.map((s, k) => <Circle key={`${copy}-${k}`} cx={s.x * W} cy={(s.y + copy) * H} r={s.r} fill="#e6e8ff" opacity={s.o} />)), [stars, W, H]);
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: W, height: H * 2 }, style]}>
      <Svg width={W} height={H * 2}>{dots}</Svg>
    </Animated.View>
  );
}

function Twinkle({ s, i, W, H, still }: { s: Star; i: number; W: number; H: number; still: boolean }) {
  const o = useSharedValue(0.25);
  useEffect(() => {
    if (still) return;
    const d = 1400 + (i % 4) * 500;
    o.value = withDelay(i * 380, withRepeat(withSequence(withTiming(1, { duration: d }), withTiming(0.2, { duration: d })), -1, false));
  }, [still, i, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  const size = s.r * 2 + 6;
  return (
    <Animated.View style={[{ position: 'absolute', left: s.x * W - size / 2, top: s.y * H - size / 2, width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`tw${i}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <Stop offset="0.35" stopColor="#cfd8ff" stopOpacity="0.8" />
            <Stop offset="1" stopColor="#cfd8ff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#tw${i})`} />
      </Svg>
    </Animated.View>
  );
}

/** Cometa do protótipo: cabeça brilhante com cauda, cruzando a tela de vez em quando. */
function Comet({ W, H }: { W: number; H: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withSequence(withDelay(5000, withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.quad) })), withTiming(0, { duration: 0 })), -1, false);
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value > 0.02 && p.value < 0.98 ? 1 : 0,
    transform: [{ translateX: -200 + p.value * (W + 400) }, { translateY: H * 0.12 + p.value * H * 0.18 }, { rotate: '10deg' }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 170, height: 14 }, style]}>
      <Svg width={170} height={14}>
        <Defs>
          <LinearGradient id="tail" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ffb15c" stopOpacity="0" />
            <Stop offset="1" stopColor="#ffb15c" stopOpacity="0.9" />
          </LinearGradient>
          <RadialGradient id="head" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
            <Stop offset="0.4" stopColor="#ffb15c" stopOpacity="0.9" />
            <Stop offset="1" stopColor="#ffb15c" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={5.5} width={158} height={3} rx={1.5} fill="url(#tail)" />
        <Circle cx={158} cy={7} r={7} fill="url(#head)" />
      </Svg>
    </Animated.View>
  );
}
