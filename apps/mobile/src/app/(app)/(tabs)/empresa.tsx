import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { COMPANY_STATUS_LABEL, colors, fmt, radius } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Guide } from '@/components/space/guide';
import { Card, ErrorBox, Loading, Progress, Screen, Text } from '@/components/ui';

/** Aba Empresa do colaborador (protótipo): empresa, áreas, trilhas obrigatórias e ranking das áreas. */
export default function Empresa() {
  const { api, user } = useSession();
  const q = useQuery({ queryKey: ['me', 'company'], queryFn: () => api.me.company() });
  if (q.isLoading) return <Screen><Loading /></Screen>;
  if (q.error) return <Screen><ErrorBox error={q.error} onRetry={() => q.refetch()} /></Screen>;
  const c = q.data!;
  const brand = c.company.color ?? colors.purple;
  const pending = c.tracks.filter((t) => t.progress < 1).length;
  const first = (user?.name ?? '').split(' ')[0];

  return (
    <Screen>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: brand, alignItems: 'center', justifyContent: 'center' }}>
          <Text weight="black" size={18} style={{ color: '#fff' }}>{c.company.initials ?? c.company.tradeName.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text weight="black" size={19}>{c.company.tradeName}</Text>
          <Text tone="muted" size={13}>Biblioteca liberada pela empresa · com certificado</Text>
        </View>
      </Card>

      <View style={{ marginTop: 14 }}>
        <Guide
          mood={pending ? 'wave' : 'celebrate'}
          size={84}
          text={c.tracks.length === 0
            ? `Oi${first ? `, ${first}` : ''}! Sua empresa ainda não definiu trilhas para você. Enquanto isso, explore os cursos.`
            : pending ? `Você tem ${pending} ${pending === 1 ? 'trilha' : 'trilhas'} pra concluir. Bora?` : 'Todas as trilhas concluídas. Mandou bem!'}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Card style={{ flex: 1, gap: 2 }}>
          <Text tone="muted" size={12} weight="bold">SITUAÇÃO</Text>
          <Text weight="black">{c.status ? COMPANY_STATUS_LABEL[c.status] ?? c.status : '—'}</Text>
        </Card>
        <Card style={{ flex: 1, gap: 2 }}>
          <Text tone="muted" size={12} weight="bold">{c.departments.length > 1 ? 'ÁREAS' : 'ÁREA'}</Text>
          <Text weight="black" numberOfLines={2}>{c.departments.map((d) => d.name).join(', ') || 'Sem área'}</Text>
        </Card>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22 }}>
        <Text weight="black" size={19}>Trilhas obrigatórias</Text>
        <Text tone="muted" size={13}>{c.tracks.length} {c.tracks.length === 1 ? 'trilha' : 'trilhas'}</Text>
      </View>
      <View style={{ gap: 10, marginTop: 10 }}>
        {c.tracks.length === 0 && <Card><Text tone="muted">Nenhuma trilha atribuída ainda.</Text></Card>}
        {c.tracks.map((t) => {
          const late = t.due && t.progress < 1 && new Date(`${t.due.slice(0, 10)}T23:59:59`) < new Date();
          return (
            <Pressable key={t.assignmentId} disabled={!t.courseIds[0]} onPress={() => router.push(`/curso/${t.courseIds[0]}`)} accessibilityRole="button" accessibilityLabel={`${t.title}, ${t.progressPct}%`}>
              <Card style={{ gap: 8 }}>
                <Text size={12} weight="bold" tone={late ? 'red' : 'amber'}>
                  {t.mandatory ? 'Obrigatória' : 'Recomendada'}{t.due ? ` · até ${fmt.dateOnly(t.due)}` : ''}{late ? ' · atrasada' : ''}
                </Text>
                <Text weight="black" size={16}>{t.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}><Progress value={t.progressPct} color={t.progress >= 1 ? colors.green : colors.amber} /></View>
                  <Text weight="black" size={13}>{t.progressPct}%</Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      {c.ranking.length > 0 && (
        <>
          <Text weight="black" size={19} style={{ marginTop: 22 }}>Ranking das áreas</Text>
          <Card style={{ gap: 12, marginTop: 10 }}>
            {c.ranking.map((r, i) => (
              <View key={r.departmentId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text weight="black" tone={i === 0 ? 'amber' : 'muted'} style={{ width: 22 }}>{i + 1}º</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text weight={r.isMine ? 'black' : 'bold'}>{r.name}{r.isMine ? ' (sua área)' : ''}</Text>
                  <Progress value={r.completionPct} color={r.isMine ? colors.amber : colors.blue} height={6} />
                </View>
                <Text weight="black" size={13}>{r.completionPct}%</Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
