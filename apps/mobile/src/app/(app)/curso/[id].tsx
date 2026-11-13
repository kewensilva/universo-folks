import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors, planetColor } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Card, ErrorBox, Loading, Progress, Screen, Text } from '@/components/ui';
import { PlanetOrb } from '@/components/planet';
import { mix } from '@/components/space/color';
import { TrailMap } from '@/components/space/trail-map';

/** Trilha do curso como no protótipo: cabeçalho do planeta, unidades e etapas em caminho. */
export default function Curso() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const q = useQuery({ queryKey: ['trail', id], queryFn: () => api.learning.trail(id) });
  const t = q.data;
  return (
    <Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar ao planeta"
        style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingLeft: 10, paddingRight: 14, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.cardBorder }}>
        <Text weight="bold" size={14}>‹  {t ? `Planeta ${t.planet.name}` : 'Voltar'}</Text>
      </Pressable>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : t && (
        <>
          <Hero title={t.course.title} planet={t.planet} progress={t.progressPct} />
          {t.access.locked && t.access.reason === 'PREMIUM_REQUIRED' && (
            <Card style={{ marginBottom: 16, gap: 6 }}>
              <Text weight="black" size={11} tone="amber" style={{ letterSpacing: 1 }}>{(t.access.requiredPlan ?? t.requiredPlan ?? 'Premium').toUpperCase()}</Text>
              <Text tone="muted">Este curso faz parte do plano {t.access.requiredPlan ?? t.requiredPlan ?? 'Premium'}. Dá uma olhada na trilha e libere quando quiser.</Text>
            </Card>
          )}
          <TrailMap trail={t} />
        </>
      )}
    </Screen>
  );
}

/** Cartão do curso com a cor do planeta (thero/chero do protótipo). */
function Hero({ title, planet, progress }: { title: string; planet: { name: string; themeColor?: string | null; visual?: import('@folks/shared').PlanetVisual | null }; progress: number }) {
  const a = planetColor(planet);
  const b = mix(planet.visual?.colors?.[1] ?? '#1a1240', '#ffffff', 0.1);
  return (
    <View style={{ marginTop: 14, marginBottom: 20, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: `${a}55`, flexDirection: 'row', alignItems: 'center', padding: 18, gap: 8 }}>
      <Svg style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={b} stopOpacity="0.95" />
            <Stop offset="1" stopColor={a} stopOpacity="0.45" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero)" />
      </Svg>
      <View style={{ flex: 1, gap: 4 }}>
        <Text weight="black" size={11} style={{ color: '#fff', opacity: 0.8, letterSpacing: 1.2 }}>PLANETA {planet.name.toUpperCase()}</Text>
        <Text weight="black" size={24} style={{ color: '#fff' }}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Progress value={progress} height={10} /></View>
          <Text weight="bold" size={13} style={{ color: '#fff' }}>{progress}%</Text>
        </View>
      </View>
      <PlanetOrb visual={planet.visual} themeColor={planet.themeColor} size={70} />
    </View>
  );
}
