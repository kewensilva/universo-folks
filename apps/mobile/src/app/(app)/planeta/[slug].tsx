import { useQuery } from '@tanstack/react-query';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors } from '@folks/shared';
import { useSession } from '@/lib/session';
import { PlanetOrb } from '@/components/planet';
import { Card, ErrorBox, Loading, Progress, Screen, Text } from '@/components/ui';

export default function Planeta() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { api } = useSession();
  const q = useQuery({ queryKey: ['catalog', 'planet', slug], queryFn: () => api.catalog.planet(slug) });
  return (
    <Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar"><Text tone="muted" weight="bold">← Voltar</Text></Pressable>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <PlanetOrb visual={q.data!.visual} themeColor={q.data!.themeColor} size={110} />
            <Text weight="black" size={28}>{q.data!.name}</Text>
            <Text tone="muted" style={{ textAlign: 'center', marginTop: 4 }}>{q.data!.description}</Text>
          </View>
          <View style={{ gap: 10, marginTop: 20 }}>
            {q.data!.courses.map((c) => {
              const soon = c.status === 'COMING_SOON';
              const body = (
                <Card style={{ opacity: soon ? 0.6 : 1 }}>
                  <Text weight="black" size={17}>{c.title}</Text>
                  <Text tone="muted" size={13}>{c.meta ?? `${c.units} unidades`}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                    {soon && <Text tone="dim" weight="black" size={11}>EM BREVE</Text>}
                    {c.locked && <Text tone="amber" weight="black" size={11}>🔒 PREMIUM</Text>}
                    {!c.locked && !soon && c.freeUnits > 0 && c.accessTier === 'FREE' && <Text tone="green" weight="black" size={11}>{c.freeUnits} GRÁTIS</Text>}
                    {c.hasCertificate && <Text tone="purple" weight="black" size={11}>CERTIFICADO</Text>}
                  </View>
                  {!soon && <View style={{ marginTop: 10 }}><Progress value={c.progressPct} color={colors.amber} /></View>}
                </Card>
              );
              return soon ? <View key={c.id}>{body}</View> : (
                <Link key={c.id} href={{ pathname: '/curso/[id]', params: { id: c.id } }} asChild>
                  <Pressable accessibilityRole="button">{body}</Pressable>
                </Link>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}
