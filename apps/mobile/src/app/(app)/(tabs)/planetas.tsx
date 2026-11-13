import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors } from '@folks/shared';
import { useSession } from '@/lib/session';
import { PlanetGrid } from '@/components/planet-card';
import { ErrorBox, Loading, Screen, Text } from '@/components/ui';

const FILTERS = [{ id: '', label: 'Todos' }, { id: 'in_progress', label: 'Em andamento' }, { id: 'free', label: 'Grátis' }, { id: 'premium', label: 'Premium' }];

export default function Planetas() {
  const { api } = useSession();
  const [filter, setFilter] = useState('');
  const q = useQuery({ queryKey: ['catalog', 'planets', filter], queryFn: () => api.catalog.planets({ filter: filter || undefined }) });
  return (
    <Screen>
      <Text weight="black" size={26}>Cursos</Text>
      <Text tone="muted" style={{ marginBottom: 12 }}>Cada planeta é um tema.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <Pressable key={f.id} onPress={() => setFilter(f.id)} accessibilityRole="button" accessibilityState={{ selected: filter === f.id }}
            style={{ borderRadius: 99, borderWidth: 1, borderColor: filter === f.id ? colors.amber : colors.cardBorder, backgroundColor: filter === f.id ? `${colors.amber}26` : 'transparent', paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text weight="bold" size={13} tone={filter === f.id ? 'amber' : 'muted'}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} onRetry={() => q.refetch()} /> : q.data!.items.length === 0 ? <Text tone="muted">Nenhum planeta aqui ainda.</Text> : <PlanetGrid items={q.data!.items} />}
    </Screen>
  );
}
