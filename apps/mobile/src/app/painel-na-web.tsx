import { useQuery } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';
import { useState } from 'react';
import { PROFILE_LABEL, contextTitle, errorMessage, isStudyContext, profileOf } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, Loading, Screen, Text } from '@/components/ui';

/** MASTER e ADMIN da empresa usam o painel na web. No app, podem trocar para um perfil de estudo. */
export default function PainelNaWeb() {
  const { api, context, user, switchContext, logout } = useSession();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['contexts'], queryFn: () => api.auth.contexts() });
  const study = (q.data ?? []).filter((c) => isStudyContext({ mode: c.mode, role: c.role }));
  return (
    <Screen>
      <Text weight="black" size={26} style={{ marginTop: 24 }}>Olá, {user?.name.split(' ')[0]}</Text>
      <Text tone="muted" style={{ marginTop: 6 }}>
        Você entrou como <Text weight="bold">{context ? PROFILE_LABEL[profileOf(context)] : ''}</Text>. O painel de gestão fica na versão web do Universo Folks.
      </Text>
      <Text weight="bold" size={17} style={{ marginTop: 28, marginBottom: 10 }}>Estudar pelo app</Text>
      {q.isLoading ? <Loading /> : (
        <View style={{ gap: 10 }}>
          {study.map((c) => {
            const key = `${c.mode}:${c.tenantId ?? ''}`;
            const t = contextTitle(c);
            return (
              <Pressable key={key} accessibilityRole="button" disabled={!!busy}
                onPress={async () => { setBusy(key); setErr(null); try { await switchContext(c.mode, c.tenantId); } catch (e) { setErr(errorMessage(e)); setBusy(null); } }}>
                <Card><Text weight="black">{t.title}</Text><Text tone="muted" size={13}>{busy === key ? 'Abrindo…' : t.subtitle}</Text></Card>
              </Pressable>
            );
          })}
        </View>
      )}
      {err && <Text tone="red" weight="bold" style={{ marginTop: 10 }}>{err}</Text>}
      <Button title="Sair" variant="ghost" onPress={logout} style={{ marginTop: 28 }} />
    </Screen>
  );
}
