import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, errorMessage, fmt, radius, type PublicTier, type PublicTierPrice } from '@folks/shared';
import { useSession } from '@/lib/session';
import { storePurchases } from '@/lib/purchases';
import { Astronaut } from '@/components/space/astronaut';
import { Button, Card, ErrorBox, Loading, Screen, Text } from '@/components/ui';

const PER: Record<string, string> = { MONTHLY: 'por mês', QUARTERLY: 'por trimestre', YEARLY: 'por ano', ONE_TIME: 'pagamento único' };

const BENEFITS: [string, string, string][] = [
  ['🪐', 'Galáxias completas.', 'Todas as unidades e o desafio final dos cursos das galáxias do seu plano.'],
  ['🎓', 'Certificados.', 'Comunicação, Liderança, Feedback e mais, com certificado.'],
  ['♾️', 'Prática infinita sem limite.', 'Em todos os cursos, sem esperar o dia seguinte.'],
  ['🚫', 'Sem anúncios.', 'Estude sem interrupção.'],
];

/**
 * Aba Premium do aluno (B2C): planos de acesso por galáxia (Básico, Premium, Premium Plus) definidos
 * pelo MASTER no menu Planos. A compra é pelas lojas (RevenueCat); o acesso só muda quando a API
 * recebe o aviso da loja.
 */
export default function Premium() {
  const { api, user } = useSession();
  const tiers = useQuery({ queryKey: ['billing', 'tiers'], queryFn: () => api.billing.tiers() });
  const ent = useQuery({ queryKey: ['me', 'entitlements'], queryFn: () => api.me.entitlements() });
  // mensagem perto de onde a pessoa tocou: no card do plano ou embaixo (restaurar compras)
  const [msg, setMsg] = useState<{ at: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (tiers.isLoading || ent.isLoading) return <Screen><Loading /></Screen>;
  if (tiers.error) return <Screen><ErrorBox error={tiers.error} onRetry={() => tiers.refetch()} /></Screen>;
  const list = tiers.data ?? [];
  const e = ent.data;
  // plano atual: o da assinatura; sem plano informado, Premium antigo (libera tudo) ou o Básico
  const current = e?.plan?.code ?? (e?.premium ? null : list.find((t) => t.isDefault)?.code ?? null);
  const currentName = e?.plan?.name ?? (e?.premium ? 'Premium' : list.find((t) => t.isDefault)?.name ?? 'Básico');

  async function buy(tier: PublicTier, price: PublicTierPrice | undefined) {
    setMsg(null);
    if (!storePurchases.available || !price || !user) { setMsg({ at: tier.code, text: storePurchases.reason ?? 'Preço ainda não disponível para este plano.' }); return; }
    setBusy(tier.code);
    try {
      await storePurchases.buy(price, user.id);
      setMsg({ at: tier.code, text: 'Compra enviada. O Premium é liberado assim que a loja confirmar.' });
      void ent.refetch();
    } catch (err) {
      setMsg({ at: tier.code, text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingTop: 4 }}>
        <Astronaut mood="celebrate" width={130} />
        <Text weight="black" size={13} style={{ color: '#ffe08a', letterSpacing: 1, marginTop: 4 }}>FOLKS PREMIUM</Text>
        <Text weight="black" size={28} style={{ textAlign: 'center' }}>Explore o universo inteiro</Text>
        <Text weight="semibold" tone="muted" style={{ textAlign: 'center', marginTop: 4 }}>Tudo que é grátis continua grátis. O Premium abre o resto.</Text>
      </View>

      <Card style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: `${colors.amber}55` }}>
        <Text size={26}>{e?.premium ? '👑' : '🌱'}</Text>
        <View style={{ flex: 1 }}>
          <Text tone="muted" size={12} weight="bold">SEU PLANO</Text>
          <Text weight="black" size={17}>{currentName}</Text>
          {e?.premiumUntil && <Text tone="muted" size={13}>Válido até {fmt.date(e.premiumUntil)}</Text>}
        </View>
      </Card>

      <Card style={{ marginTop: 14, gap: 12 }}>
        {BENEFITS.map(([ic, b, t]) => (
          <View key={b} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Text size={20}>{ic}</Text>
            <Text style={{ flex: 1 }} tone="muted"><Text weight="black">{b}</Text> {t}</Text>
          </View>
        ))}
      </Card>

      <Text weight="black" size={19} style={{ marginTop: 22 }}>Planos</Text>
      <View style={{ gap: 12, marginTop: 10 }}>
        {list.map((t) => {
          const isCurrent = t.code === current;
          const prices = t.plans.filter((p) => p.priceCents > 0);
          const best = prices.find((p) => p.interval === 'YEARLY') ?? prices[0];
          return (
            <Card key={t.code} style={[{ gap: 10 }, isCurrent && { borderColor: colors.amber, borderWidth: 2 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text weight="black" size={18}>{t.name}</Text>
                {isCurrent && <Pill label="Seu plano" color={colors.amber} />}
              </View>
              {t.description ? <Text tone="muted" size={14}>{t.description}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {t.isDefault
                  ? <Pill label="Cursos e unidades gratuitos" color={colors.green} />
                  : t.categories.map((c) => <Pill key={c.slug} label={c.name} color={colors.purple} />)}
              </View>
              {t.isDefault ? (
                <Text weight="black" size={20} tone="green">Grátis</Text>
              ) : prices.length ? (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {prices.map((p) => (
                    <View key={p.id} style={{ flex: 1, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: p === best ? colors.amber : colors.cardBorder }}>
                      <Text weight="black" size={18}>{fmt.money(p.priceCents, p.currency)}</Text>
                      <Text tone="muted" size={12}>{PER[p.interval] ?? ''}{p.trialDays ? ` · ${p.trialDays} dias grátis` : ''}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text tone="dim" weight="bold">Preço em breve</Text>
              )}
              {!t.isDefault && !isCurrent && (
                <Button title={`Assinar ${t.name}`} onPress={() => buy(t, best)} loading={busy === t.code} />
              )}
              {msg?.at === t.code && <Text tone="amber" weight="bold" size={14} accessibilityRole="alert">{msg.text}</Text>}
            </Card>
          );
        })}
      </View>


      <Pressable onPress={async () => { setMsg(null); try { await storePurchases.restore(user?.id ?? ''); void ent.refetch(); } catch (err) { setMsg({ at: 'restore', text: errorMessage(err) }); } }} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 18, padding: 8 }}>
        <Text weight="bold" tone="muted" style={{ textDecorationLine: 'underline' }}>Restaurar compras</Text>
      </Pressable>
      {msg?.at === 'restore' && <Text tone="amber" weight="bold" size={14} style={{ textAlign: 'center' }} accessibilityRole="alert">{msg.text}</Text>}
      <Text tone="dim" size={12} style={{ textAlign: 'center', marginTop: 6 }}>A assinatura renova sozinha e pode ser cancelada a qualquer momento na loja (App Store ou Google Play).</Text>
    </Screen>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: `${color}22`, borderWidth: 1, borderColor: `${color}55` }}>
      <Text weight="black" size={12} style={{ color }}>{label}</Text>
    </View>
  );
}
