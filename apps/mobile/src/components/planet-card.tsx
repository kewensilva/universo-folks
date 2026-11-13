import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { PlanetCard as Planet } from '@folks/shared';
import { PlanetOrb } from './planet';
import { Badge, Card, Progress, Text } from './ui';

export function PlanetCard({ p }: { p: Planet }) {
  const body = (
    <Card style={{ alignItems: 'center', opacity: p.comingSoon ? 0.6 : 1, flex: 1 }}>
      <PlanetOrb visual={p.visual} themeColor={p.themeColor} size={64} />
      <Text weight="black" size={16} style={{ marginTop: 2, textAlign: 'center' }}>{p.name}</Text>
      <Text tone="muted" size={12} numberOfLines={2} style={{ textAlign: 'center', marginTop: 2 }}>{p.description}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 8 }}>{p.badges.map((b) => <Badge key={b} code={b} />)}</View>
      {p.progressPct > 0 && <View style={{ alignSelf: 'stretch', marginTop: 10 }}><Progress value={p.progressPct} /></View>}
    </Card>
  );
  if (p.comingSoon) return <View style={{ flex: 1 }}>{body}</View>;
  return (
    <Link href={{ pathname: '/planeta/[slug]', params: { slug: p.slug } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`Planeta ${p.name}`} style={{ flex: 1 }}>{body}</Pressable>
    </Link>
  );
}

/** Grade de 2 colunas sem FlatList aninhada em ScrollView. */
export function PlanetGrid({ items }: { items: Planet[] }) {
  const rows: Planet[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          {r.map((p) => <PlanetCard key={p.id} p={p} />)}
          {r.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  );
}
