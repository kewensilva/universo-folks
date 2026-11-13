import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Svg, { Defs, Ellipse, RadialGradient, Stop, SvgXml } from 'react-native-svg';
import { HANGAR_SLOTS, colors, errorMessage, outfitOf, radius, type AvatarSlot, type HangarItem } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Astronaut, type AstroMood } from '@/components/space/astronaut';
import { LOCK_SVG, accessorySvg } from '@/components/space/hangar-icons';
import { Chip } from '@/components/fields';
import { Card, ErrorBox, Loading, Progress, Screen, Text } from '@/components/ui';

/**
 * Hangar (personalização do astronauta), como no protótipo: traje, detalhes, viseira, cabeça e costas.
 * Os itens liberam por nível (cada 200 XP sobe um nível); alguns podem ser exclusivos do Premium.
 * A roupa escolhida aparece no astronauta de todas as telas.
 */
export default function HangarScreen() {
  const { api } = useSession();
  const qc = useQueryClient();
  const hangar = useQuery({ queryKey: ['hangar'], queryFn: () => api.me.hangar() });
  const progress = useQuery({ queryKey: ['me', 'progress'], queryFn: () => api.me.progress() });
  const [slot, setSlot] = useState<AvatarSlot>('SUIT');
  const [mood, setMood] = useState<AstroMood>('wave');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setMood('idle'), 1600);
    return () => clearTimeout(t);
  }, [mood]);

  const equip = useMutation({
    mutationFn: (item: HangarItem) => api.me.equip(item.id),
    onSuccess: (h) => { qc.setQueryData(['hangar'], h); setMood('celebrate'); setMsg(null); },
    onError: (e) => setMsg(errorMessage(e)),
  });

  if (hangar.isLoading) return <Screen><Loading /></Screen>;
  if (hangar.error) return <Screen><ErrorBox error={hangar.error} onRetry={() => hangar.refetch()} /></Screen>;
  const h = hangar.data!;
  const items = h.slots.find((s) => s.slot === slot)?.items ?? [];
  const p = progress.data;

  function pick(item: HangarItem) {
    if (item.equipped) { setMood('wave'); return; }
    if (!item.unlocked) {
      setMsg(item.premiumOnly && h.level >= item.requiredLevel ? `${item.name} é exclusivo do Premium.` : `${item.name} libera no nível ${item.requiredLevel}. Cada 200 XP sobe um nível.`);
      return;
    }
    equip.mutate(item);
  }

  return (
    <Screen>
      <Text weight="black" size={26}>Hangar</Text>
      <Text tone="muted" size={14}>Monte o visual do seu astronauta.</Text>

      <Pressable onPress={() => setMood((m) => (m === 'celebrate' ? 'wave' : 'celebrate'))} accessibilityRole="button" accessibilityLabel="Tocar no astronauta" style={{ height: 270, alignItems: 'center', justifyContent: 'flex-end', marginTop: 6 }}>
        <Svg width={280} height={70} style={{ position: 'absolute', bottom: 0 }}>
          <Defs>
            <RadialGradient id="plat" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#9b7bff" stopOpacity={0.55} />
              <Stop offset="0.7" stopColor="#9b7bff" stopOpacity={0.08} />
              <Stop offset="1" stopColor="#9b7bff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={140} cy={35} rx={140} ry={35} fill="url(#plat)" />
          <Ellipse cx={140} cy={35} rx={100} ry={17} stroke="rgba(255,255,255,0.25)" strokeWidth={2} fill="none" />
        </Svg>
        <Astronaut mood={mood} outfit={outfitOf(h)} width={180} style={{ marginBottom: 18 }} />
      </Pressable>

      <Card style={{ gap: 8, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text weight="black">Nível {h.level}</Text>
          {p && <Text tone="muted" weight="bold">{p.xpInLevel}/{p.xpForNextLevel} XP</Text>}
        </View>
        <Progress value={p?.levelProgressPct ?? 0} height={10} />
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        {HANGAR_SLOTS.map((c) => <Chip key={c.slot} label={c.label} on={c.slot === slot} onPress={() => { setSlot(c.slot); setMsg(null); }} />)}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        {items.map((it) => <ItemCard key={it.id} item={it} busy={equip.isPending && equip.variables?.id === it.id} onPress={() => pick(it)} />)}
      </View>

      {msg && <Text tone="amber" weight="bold" style={{ marginTop: 12 }} accessibilityRole="alert">{msg}</Text>}
      <Text tone="dim" size={13} style={{ marginTop: 14, textAlign: 'center' }}>Cada 200 XP sobe um nível e libera roupas e acessórios novos. Toque no astronauta pra ver ele reagir.</Text>
    </Screen>
  );
}

function ItemCard({ item, onPress, busy }: { item: HangarItem; onPress: () => void; busy: boolean }) {
  const icon = item.colorHex ? null : accessorySvg(item.key);
  const status = item.equipped ? 'Usando' : item.unlocked ? 'Liberado' : item.premiumOnly ? 'Premium' : `Nível ${item.requiredLevel}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${status}`}
      accessibilityState={{ selected: item.equipped, disabled: !item.unlocked, busy }}
      style={({ pressed }) => [{
        width: '31%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 6,
        borderRadius: radius.lg, borderWidth: item.equipped ? 2 : 1,
        borderColor: item.equipped ? colors.amber : colors.cardBorder,
        backgroundColor: item.equipped ? 'rgba(255,176,32,0.1)' : colors.card,
        opacity: item.unlocked ? (busy ? 0.6 : 1) : 0.45,
      }, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={{
        width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
        backgroundColor: item.colorHex ?? (item.key === 'nada' ? 'rgba(255,255,255,0.08)' : '#6a4de0'),
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
      }}>
        {icon && <SvgXml xml={icon} width={24} height={24} />}
        {!item.unlocked && (
          <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' }}>
            <SvgXml xml={LOCK_SVG} width={12} height={12} />
          </View>
        )}
      </View>
      <Text weight="black" size={14} numberOfLines={1} style={{ textAlign: 'center' }}>{item.name}</Text>
      <Text tone={item.equipped ? 'amber' : 'dim'} size={12} weight={item.equipped ? 'bold' : 'medium'}>{status}</Text>
    </Pressable>
  );
}
