import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, fmt } from '@folks/shared';
import { useSession } from '@/lib/session';
import { PlanetGrid } from '@/components/planet-card';
import { Card, ErrorBox, Loading, Progress, Screen, Text } from '@/components/ui';

export default function Inicio() {
  const { api } = useSession();
  const home = useQuery({ queryKey: ['catalog', 'home'], queryFn: () => api.catalog.home() });
  const planets = useQuery({ queryKey: ['catalog', 'planets'], queryFn: () => api.catalog.planets() });
  const [cat, setCat] = useState<string | null>(null);

  if (home.isLoading) return <Screen><Loading /></Screen>;
  if (home.error) return <Screen><ErrorBox error={home.error} onRetry={() => home.refetch()} /></Screen>;
  const h = home.data!;
  const cats = h.categories.filter((c) => (c.planetCount ?? 1) > 0);
  const active = cat ?? cats[0]?.slug ?? null;
  const list = (planets.data?.items ?? []).filter((p) => !active || p.category.slug === active);

  return (
    <Screen>
      <Text tone="muted">{fmt.greeting()},</Text>
      <Text weight="black" size={28}>{h.greetingName} 👋</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <Chip color={colors.amber} label={`🔥 ${h.progress.streakDays} ${h.progress.streakDays === 1 ? 'dia' : 'dias'}`} />
        <Chip color={colors.blue} label={`⭐ Nível ${h.progress.level}`} />
        <Chip color={colors.green} label={`${fmt.num(h.progress.totalXp)} XP`} />
        {h.premium && <Chip color={colors.gold} label="👑 Premium" />}
      </View>

      <Card style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text weight="black">Meta de hoje</Text>
          <Text tone="muted" size={13}>{h.progress.todayXp}/{h.progress.dailyGoalXp} XP</Text>
        </View>
        <View style={{ marginTop: 10 }}><Progress value={h.progress.dailyGoalPct} color={colors.green} height={10} /></View>
      </Card>

      {h.assignments.length > 0 && (
        <View style={{ marginTop: 24, gap: 10 }}>
          <Text weight="black" size={18}>Trilhas da empresa</Text>
          {h.assignments.map((a) => (
            <Link key={a.id} href={a.courseId ? { pathname: '/curso/[id]', params: { id: a.courseId } } : a.planetSlug ? { pathname: '/planeta/[slug]', params: { slug: a.planetSlug } } : '/planetas'} asChild>
              <Pressable accessibilityRole="button">
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text weight="bold" style={{ flex: 1 }}>{a.title}</Text>
                    {a.mandatory && <Text tone="red" weight="black" size={10}>OBRIGATÓRIA</Text>}
                  </View>
                  <View style={{ marginTop: 10 }}><Progress value={a.progressPct} /></View>
                  <Text tone={a.overdue ? 'red' : 'dim'} size={12} style={{ marginTop: 4 }}>
                    {a.completed ? 'Concluída ✓' : a.overdue ? 'Atrasada' : a.dueDate ? `Prazo ${fmt.dateOnly(a.dueDate)}` : 'Sem prazo'}
                  </Text>
                </Card>
              </Pressable>
            </Link>
          ))}
        </View>
      )}

      <Text weight="black" size={18} style={{ marginTop: 24, marginBottom: 10 }}>Explore os planetas</Text>
      {cats.length > 1 && (
        <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, padding: 4, marginBottom: 12 }}>
          {cats.map((c) => (
            <Pressable key={c.slug} onPress={() => setCat(c.slug)} accessibilityRole="tab" accessibilityState={{ selected: active === c.slug }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: active === c.slug ? '#191c3d' : 'transparent' }}>
              <Text weight="bold" size={13} tone={active === c.slug ? 'ink' : 'muted'}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {planets.isLoading ? <Loading /> : planets.error ? <ErrorBox error={planets.error} /> : <PlanetGrid items={list} />}
    </Screen>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return <View style={{ backgroundColor: `${color}26`, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 }}><Text weight="bold" size={13} style={{ color }}>{label}</Text></View>;
}
