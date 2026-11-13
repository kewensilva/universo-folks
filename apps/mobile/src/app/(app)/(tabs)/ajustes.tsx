import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DAILY_GOALS, PROFILE_LABEL, contextTitle, errorMessage, isStudyContext, profileOf, sameContext, type Preferences } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Astronaut } from '@/components/space/astronaut';
import { Chip, Field, LinkRow, PasswordField, SwitchRow } from '@/components/fields';
import { Button, Card, Screen, Text } from '@/components/ui';

const PASSWORD_OK = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/** Ajustes do protótipo: perfil, experiência, empresa, trocar perfil e conta. */
export default function Ajustes() {
  const { api, user, context, switchContext, joinCompany, logout } = useSession();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.me.get() });
  const progress = useQuery({ queryKey: ['me', 'progress'], queryFn: () => api.me.progress() });
  const prefs = useQuery({ queryKey: ['me', 'preferences'], queryFn: () => api.me.preferences() });
  const contexts = useQuery({ queryKey: ['contexts'], queryFn: () => api.auth.contexts() });
  const [err, setErr] = useState<string | null>(null);

  const inCompany = context?.mode === 'TENANT';
  const others = (contexts.data ?? []).filter((c) => isStudyContext({ mode: c.mode, role: c.role }) && !(context && sameContext(context, c)));
  const hasCompany = (contexts.data ?? []).some((c) => c.mode === 'TENANT');

  const savePrefs = useMutation({
    mutationFn: (b: Partial<Preferences>) => api.me.updatePreferences(b),
    onMutate: (b) => { qc.setQueryData<Preferences>(['me', 'preferences'], (old) => (old ? { ...old, ...b } : old)); },
    onSuccess: (p) => { qc.setQueryData(['me', 'preferences'], p); void qc.invalidateQueries({ queryKey: ['catalog', 'home'] }); },
    onError: (e) => { setErr(errorMessage(e)); void prefs.refetch(); },
  });
  const p = prefs.data;
  const lv = progress.data;

  return (
    <Screen>
      <Text weight="black" size={26}>Ajustes</Text>

      <Card style={{ marginTop: 14, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Astronaut width={64} />
          <View style={{ flex: 1 }}>
            <Text tone="amber" weight="black" size={12}>{context ? PROFILE_LABEL[profileOf(context)].toUpperCase() : 'PERFIL'}</Text>
            <Text weight="black" size={18}>{me.data?.displayName || user?.name}</Text>
            <Text tone="muted" size={13}>{lv ? `Nível ${lv.level} · Jornada de ${lv.streakDays} ${lv.streakDays === 1 ? 'dia' : 'dias'}` : user?.email}</Text>
          </View>
        </View>
        {me.data && <ProfileForm key={me.data.displayName || me.data.name} initial={me.data.displayName || me.data.name} email={me.data.email} />}
      </Card>

      <Section title="Experiência">
        {p ? (
          <>
            <SwitchRow label="Efeitos sonoros" sub="Sons de acerto e erro. O áudio das aulas continua tocando." value={p.soundEffects} onChange={(v) => savePrefs.mutate({ soundEffects: v })} />
            <SwitchRow label="Cronômetro nas perguntas" sub="Responder rápido vale mais XP. Desligado, todo acerto vale 10 XP." value={p.questionTimer} onChange={(v) => savePrefs.mutate({ questionTimer: v })} />
            <SwitchRow label="Reduzir animações" sub="Deixa o astronauta e a tela mais quietos." value={p.reduceAnimations} onChange={(v) => savePrefs.mutate({ reduceAnimations: v })} />
            <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 4 }}>
              <Text weight="bold">Meta diária</Text>
              <Text tone="muted" size={13}>Quanto XP você quer fazer por dia.</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16 }}>
              {DAILY_GOALS.map((g) => <Chip key={g} label={`${g} XP`} on={p.dailyGoalXp === g} onPress={() => savePrefs.mutate({ dailyGoalXp: g })} />)}
            </View>
            <SwitchRow label="Lembrete diário" sub="Chega como notificação no celular." value={p.dailyReminder} onChange={(v) => savePrefs.mutate({ dailyReminder: v })} />
            {p.dailyReminder && <ReminderTime key={p.reminderTime} value={p.reminderTime} onSave={(t) => savePrefs.mutate({ reminderTime: t })} />}
          </>
        ) : <Text tone="muted" style={{ padding: 16 }}>Carregando…</Text>}
      </Section>

      {!inCompany && !hasCompany && (
        <Section title="Empresa" padded>
          <Text tone="muted" size={14}>Sua empresa usa a Folks? Digite o código que ela enviou pra liberar a biblioteca e as trilhas da empresa.</Text>
          <JoinCompany onJoin={joinCompany} />
        </Section>
      )}

      {others.length > 0 && (
        <Section title="Trocar perfil" padded>
          {others.map((c) => {
            const t = contextTitle(c);
            return (
              <Pressable key={`${c.mode}:${c.tenantId ?? ''}`} accessibilityRole="button"
                onPress={async () => { setErr(null); try { await switchContext(c.mode, c.tenantId); } catch (e) { setErr(errorMessage(e)); } }}>
                <Card><Text weight="black">{t.title}</Text><Text tone="muted" size={13}>{t.subtitle}</Text></Card>
              </Pressable>
            );
          })}
        </Section>
      )}

      <Section title="Conta">
        <ChangePassword />
        {!inCompany && <LinkRow label="Assinatura" sub={me.data?.entitlements?.plan?.name ?? (me.data?.premium ? 'Folks Premium ativo' : 'Plano grátis')} onPress={() => router.navigate('/premium')} />}
        <LinkRow label="Sair da conta" onPress={logout} />
      </Section>

      {err && <Text tone="red" weight="bold" style={{ marginTop: 10 }} accessibilityRole="alert">{err}</Text>}
    </Screen>
  );
}

function Section({ title, children, padded }: { title: string; children: React.ReactNode; padded?: boolean }) {
  return (
    <>
      <Text weight="black" size={19} style={{ marginTop: 22, marginBottom: 10 }}>{title}</Text>
      <Card style={padded ? { gap: 12 } : { padding: 0, overflow: 'hidden' }}>{children}</Card>
    </>
  );
}

function ProfileForm({ initial, email }: { initial: string; email: string }) {
  const { api } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => api.me.update({ displayName: name.trim() }),
    onSuccess: () => { setMsg({ ok: true, text: 'Perfil salvo.' }); void qc.invalidateQueries({ queryKey: ['me'] }); void qc.invalidateQueries({ queryKey: ['catalog', 'home'] }); },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });
  return (
    <View style={{ gap: 12 }}>
      <Field label="Como quer ser chamado?" value={name} onChangeText={(v) => { setName(v); setMsg(null); }} maxLength={20} placeholder="Seu nome ou apelido" autoComplete="nickname" />
      <Field label="E-mail da conta" value={email} editable={false} style={{ opacity: 0.6 }} />
      {msg && <Text tone={msg.ok ? 'green' : 'red'} weight="bold">{msg.text}</Text>}
      <Button title="Salvar perfil" onPress={() => save.mutate()} loading={save.isPending} disabled={!name.trim() || name.trim() === initial} style={{ alignSelf: 'flex-start', paddingVertical: 10 }} />
    </View>
  );
}

function ReminderTime({ value, onSave }: { value: string; onSave: (t: string) => void }) {
  const [t, setT] = useState(value);
  const ok = /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 16 }}>
      <View style={{ flex: 1 }}>
        <Field label="Horário do lembrete" value={t} onChangeText={(v) => { const d = v.replace(/\D/g, '').slice(0, 4); setT(d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d); }} keyboardType="number-pad" placeholder="19:00" maxLength={5} />
      </View>
      <Button title="Salvar" variant="ghost" onPress={() => onSave(t)} disabled={!ok || t === value} style={{ paddingVertical: 12 }} />
    </View>
  );
}

function JoinCompany({ onJoin }: { onJoin: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <View style={{ gap: 10 }}>
      <Field label="Código da empresa" value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setErr(null); }} autoCapitalize="characters" autoCorrect={false} placeholder="EX.: ORBITA-2026" />
      {err && <Text tone="red" weight="bold" accessibilityRole="alert">{err}</Text>}
      <Button title="Entrar na empresa" loading={busy} disabled={code.trim().length < 4}
        onPress={async () => { setBusy(true); try { await onJoin(code); } catch (e) { setErr(errorMessage(e)); setBusy(false); } }}
        style={{ alignSelf: 'flex-start', paddingVertical: 10 }} />
    </View>
  );
}

function ChangePassword() {
  const { api } = useSession();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = useMutation({
    mutationFn: () => api.auth.changePassword(cur, next),
    onSuccess: () => { setMsg({ ok: true, text: 'Senha alterada.' }); setCur(''); setNext(''); setAgain(''); },
    onError: (e) => setMsg({ ok: false, text: errorMessage(e) }),
  });
  function submit() {
    if (!PASSWORD_OK.test(next)) return setMsg({ ok: false, text: 'A nova senha precisa ter pelo menos 8 caracteres, com letras e números.' });
    if (next !== again) return setMsg({ ok: false, text: 'As duas senhas novas não são iguais.' });
    save.mutate();
  }
  return (
    <>
      <LinkRow label="Trocar senha" sub="Use pelo menos 8 caracteres, com letras e números." onPress={() => { setOpen((v) => !v); setMsg(null); }} />
      {open && (
        <View style={{ padding: 16, gap: 12 }}>
          <PasswordField label="Senha atual" value={cur} onChangeText={setCur} autoComplete="current-password" textContentType="password" />
          <PasswordField label="Nova senha" value={next} onChangeText={setNext} autoComplete="new-password" textContentType="newPassword" />
          <PasswordField label="Repita a nova senha" value={again} onChangeText={setAgain} autoComplete="new-password" textContentType="newPassword" />
          {msg && <Text tone={msg.ok ? 'green' : 'red'} weight="bold" accessibilityRole="alert">{msg.text}</Text>}
          <Button title="Salvar nova senha" onPress={submit} loading={save.isPending} disabled={!cur || !next || !again} />
        </View>
      )}
    </>
  );
}
