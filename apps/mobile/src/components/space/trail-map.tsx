import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useStill } from '@/lib/motion';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';
import { colors, planetColor, type Trail, type TrailLesson, type TrailUnit } from '@folks/shared';
import { Text } from '@/components/ui';
import { Astronaut } from './astronaut';
import { lessonIcon, nodeIconSvg, orbSvg } from './icons';
import { mix, shade } from './color';

/**
 * Trilha no formato do protótipo (course() em universo-folks.html): faixa colorida da unidade,
 * etapas em zigue-zague, a etapa atual maior com anel pulsando e o balão "COMEÇAR"/"CONTINUAR",
 * figurinhas do planeta flutuando e o astronauta ao lado da etapa atual.
 */
const OFF = [0, -62, -88, -62, 0, 62, 88, 62];
const TYPE_LABEL: Record<string, string> = { LESSON: 'Aula', VIDEO: 'Vídeo', PRACTICE: 'Prática', INTERACTIVE: 'Interativo' };

type NodeState = 'done' | 'cur' | 'open' | 'lock';

export function TrailMap({ trail }: { trail: Trail }) {
  const base = planetColor(trail.planet);
  const orbit = trail.planet.visual?.orbitIcons?.length ? trail.planet.visual.orbitIcons : ['star'];
  const accents = [trail.planet.visual?.colors?.[2] ?? '#ffe2a6', trail.planet.visual?.colors?.[3] ?? colors.pink];
  const all = trail.units.flatMap((u) => u.lessons);
  const firstId = all[0]?.id;
  let k = 0;
  return (
    <View style={{ gap: 18 }}>
      {trail.units.map((u, ui) => {
        const col = u.themeColor ?? base;
        const nodes = u.lessons.map((l) => {
          const x = OFF[k++ % OFF.length];
          const st: NodeState = l.state === 'COMPLETED' ? 'done' : u.locked || l.state === 'LOCKED' ? 'lock' : trail.currentLessonId === l.id ? 'cur' : 'open';
          return { l, x, st };
        });
        const buddy = nodes.find((n) => n.st === 'cur');
        return (
          <View key={u.id}>
            <UnitBanner u={u} col={col} orbit={orbit[ui % orbit.length]} requiredPlan={trail.requiredPlan} />
            <View style={{ alignItems: 'center', gap: 46, paddingTop: 44, paddingBottom: 10 }}>
              {!buddy && nodes.map((n, j) => <Sticker key={`s${j}`} icon={orbit[(j + ui) % orbit.length]} color={j % 2 ? accents[1] : accents[0]} side={n.x <= 0 ? 'right' : 'left'} top={30 + j * 128} delay={j * 1300} />)}
              {nodes.map((n) => <TrailNode key={n.l.id} l={n.l} x={n.x} st={n.st} col={col} first={n.l.id === firstId} />)}
              {buddy && (
                <View pointerEvents="none" style={{ position: 'absolute', top: 40, [buddy.x <= 0 ? 'right' : 'left']: -4 }}>
                  <Astronaut look={trail.planet.visual?.look} width={104} />
                </View>
              )}
            </View>
          </View>
        );
      })}
      {trail.exam && <ExamNode exam={trail.exam} x={OFF[k % OFF.length]} col={base} />}
    </View>
  );
}

function UnitBanner({ u, col, orbit, requiredPlan }: { u: TrailUnit; col: string; orbit: string; requiredPlan?: string | null }) {
  const [a, b, sh] = u.locked ? ['#3a3c66', '#25264a', '#15162e'] : [col, mix(col, '#000000', 0.4), mix(col, '#000000', 0.55)];
  return (
    <View style={{ borderRadius: 20, backgroundColor: sh, paddingBottom: 5 }}>
      <View style={{ borderRadius: 20, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 18 }}>
        <Svg style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`ub${u.id}`} x1="0" y1="0" x2="1" y2="0.6">
              <Stop offset="0" stopColor={a} />
              <Stop offset="1" stopColor={b} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#ub${u.id})`} />
        </Svg>
        <View style={{ flex: 1 }}>
          <Text weight="black" size={11} style={{ color: '#fff', opacity: 0.8, letterSpacing: 1.2 }}>UNIDADE {u.number}</Text>
          <Text weight="black" size={20} style={{ color: '#fff', marginTop: 2 }}>{u.title}</Text>
        </View>
        {u.locked ? (
          <View style={{ backgroundColor: colors.amber, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
            <Text weight="black" size={11} style={{ color: '#3b2300', letterSpacing: 0.6 }}>{(requiredPlan ?? 'Premium').toUpperCase()}</Text>
          </View>
        ) : (
          <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
            <SvgXml xml={orbSvg(orbit, '#fff')} width={24} height={24} />
          </View>
        )}
      </View>
    </View>
  );
}

function TrailNode({ l, x, st, col, first }: { l: TrailLesson; x: number; st: NodeState; col: string; first: boolean }) {
  const off = st === 'lock';
  const label = l.title;
  const type = TYPE_LABEL[l.type] ?? 'Etapa';
  return (
    <View style={{ alignItems: 'center', gap: 7, transform: [{ translateX: x }], zIndex: 1 }}>
      {st === 'cur' && <StartBubble text={first ? 'COMEÇAR' : 'CONTINUAR'} color={col} />}
      <Pressable disabled={off} onPress={() => router.push(`/etapa/${l.id}`)} accessibilityRole="button" accessibilityState={{ disabled: off }}
        accessibilityLabel={`${label.toLowerCase().startsWith(type.toLowerCase()) ? '' : `${type}: `}${label}${st === 'done' ? ' (concluída)' : off ? ' (bloqueada)' : ''}`}>
        {({ pressed }) => <NodeButton icon={st === 'done' ? 'check' : off ? 'lock' : lessonIcon(l)} st={st} col={col} pressed={pressed} />}
      </Pressable>
      <Text weight={st === 'cur' ? 'black' : 'bold'} size={13} numberOfLines={2}
        style={{ color: st === 'done' ? '#ffdc85' : st === 'cur' ? '#fff' : colors.dim, textAlign: 'center', maxWidth: 170, lineHeight: 16 }}>{label}</Text>
    </View>
  );
}

/** Botão redondo com volume (gradiente radial + "sombra" sólida embaixo), como o .nb do protótipo. */
function NodeButton({ icon, st, col, pressed }: { icon: string; st: NodeState; col: string; pressed?: boolean }) {
  const big = st === 'cur';
  const w = big ? 86 : 72, h = big ? 80 : 68, depth = big ? 8 : 7;
  const c = st === 'done' ? '#ffc83d' : col;
  const [hi, mid, lo, sh] = st === 'lock' ? ['#34365e', '#2a2c52', '#23254a', '#17183a'] : [mix(c, '#ffffff', 0.5), c, mix(c, '#000000', 0.25), mix(c, '#000000', 0.5)];
  const pad = big ? 18 : 0; // espaço para o anel e o brilho da etapa atual
  const dy = pressed ? depth - 2 : 0;
  let xml = nodeIconSvg(icon);
  if (st === 'done') xml = xml.replace(/stroke="#fff"/g, 'stroke="#6b4100"');
  const is = big ? 38 : 32;
  return (
    <View style={{ width: w + pad * 2, height: h + depth + pad * 2, alignItems: 'center', justifyContent: 'center', margin: -pad }}>
      {big && <Pulse w={w} h={h} color={mix(c, '#ffffff', 0.4)} />}
      <Svg width={w + pad * 2} height={h + depth + pad * 2} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id={`nb-${st}-${c}`} cx="35%" cy="28%" r="80%">
            <Stop offset="0" stopColor={hi} />
            <Stop offset="0.5" stopColor={mid} />
            <Stop offset="1" stopColor={lo} />
          </RadialGradient>
          {big && (
            <RadialGradient id={`glow-${c}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0.55" stopColor={c} stopOpacity="0.55" />
              <Stop offset="1" stopColor={c} stopOpacity="0" />
            </RadialGradient>
          )}
        </Defs>
        {big && <Ellipse cx={w / 2 + pad} cy={h / 2 + pad} rx={w / 2 + pad} ry={h / 2 + pad} fill={`url(#glow-${c})`} />}
        {big && <Ellipse cx={w / 2 + pad} cy={h / 2 + pad + dy} rx={w / 2 + 6} ry={h / 2 + 6} fill={c} opacity={0.3} />}
        <Ellipse cx={w / 2 + pad} cy={h / 2 + pad + depth} rx={w / 2} ry={h / 2} fill={sh} />
        <Ellipse cx={w / 2 + pad} cy={h / 2 + pad + dy} rx={w / 2} ry={h / 2} fill={`url(#nb-${st}-${c})`} stroke={st === 'lock' ? 'rgba(255,255,255,0.08)' : undefined} />
      </Svg>
      <View style={{ position: 'absolute', top: pad + h / 2 - is / 2 + dy, opacity: st === 'lock' ? 0.35 : 1 }}>
        <SvgXml xml={xml} width={is} height={is} />
      </View>
    </View>
  );
}

/** Anel que pulsa em volta da etapa atual (ring do protótipo). */
function Pulse({ w, h, color }: { w: number; h: number; color: string }) {
  const still = useStill();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!still) t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
  }, [still, t]);
  const style = useAnimatedStyle(() => ({ opacity: still ? 0.5 : 0.9 * (1 - t.value), transform: [{ scale: 0.9 + 0.4 * t.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: w + 24, height: h + 24, borderRadius: 999, borderWidth: 3, borderColor: color, top: 6 }, style]} />;
}

/** Balão branco "COMEÇAR"/"CONTINUAR" balançando em cima da etapa atual. */
function StartBubble({ text, color }: { text: string; color: string }) {
  const still = useStill();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!still) t.value = withRepeat(withSequence(withTiming(1, { duration: 650, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 650, easing: Easing.inOut(Easing.sin) })), -1, false);
  }, [still, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -5 * t.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', top: -46, alignItems: 'center', zIndex: 2 }, style]}>
      <View style={{ backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 0, elevation: 4 }}>
        <Text weight="black" size={14} style={{ color: shade(color), letterSpacing: 0.6 }}>{text}</Text>
      </View>
      <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff' }} />
    </Animated.View>
  );
}

/** Figurinha do planeta flutuando ao lado da trilha (sticker do protótipo). */
function Sticker({ icon, color, side, top, delay }: { icon: string; color: string; side: 'left' | 'right'; top: number; delay: number }) {
  const still = useStill();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!still) t.value = withDelay(delay % 5000, withRepeat(withSequence(withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2500, easing: Easing.inOut(Easing.sin) })), -1, false));
  }, [still, delay, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * t.value }, { rotate: `${8 * t.value}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, [side]: '4%', width: 44, height: 44, opacity: 0.55 }, style]}>
      <SvgXml xml={orbSvg(icon, color)} width={44} height={44} />
    </Animated.View>
  );
}

function ExamNode({ exam, x, col }: { exam: NonNullable<Trail['exam']>; x: number; col: string }) {
  const done = exam.passed;
  const st: NodeState = done ? 'done' : exam.state === 'LOCKED' ? 'lock' : 'open';
  return (
    <View style={{ alignItems: 'center', gap: 7, paddingTop: 8, transform: [{ translateX: x }] }} accessible accessibilityLabel={`Desafio final: ${exam.title}${done ? ' (aprovado)' : st === 'lock' ? ' (bloqueado)' : ''}`}>
      <NodeButton icon={done ? 'check' : st === 'lock' ? 'lock' : 'trophy'} st={st} col={col} />
      <Text weight="bold" size={13} style={{ color: done ? '#ffdc85' : colors.dim, textAlign: 'center', maxWidth: 170 }}>{exam.title}</Text>
      {st === 'open' && <Text tone="dim" size={11}>Desafio final em breve no app</Text>}
    </View>
  );
}
