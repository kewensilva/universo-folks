import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { colors, errorMessage } from '@folks/shared';
import { useSession } from '@/lib/session';
import { PlanetOrb } from '@/components/planet';
import { Field, PasswordField } from '@/components/fields';
import { Button, Card, Screen, Text } from '@/components/ui';

export default function Entrar() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!email || !password) return;
    setBusy(true);
    setError(null);
    try { await login(email, password); } catch (e) { setError(errorMessage(e)); setBusy(false); }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 24 }}>
          <PlanetOrb size={84} visual={{ colors: [colors.purple, '#1a1240'], ring: true }} />
          <Text weight="black" size={30} style={{ marginTop: 8 }}>Universo <Text weight="black" size={30} tone="amber">Folks</Text></Text>
          <Text tone="muted" style={{ marginTop: 4 }}>Aprender um pouco todo dia.</Text>
        </View>
        <Card style={{ gap: 14 }}>
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
          <PasswordField label="Senha" value={password} onChangeText={setPassword} autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
          {error && <Text tone="red" weight="bold" accessibilityRole="alert">{error}</Text>}
          <Button title="Entrar" onPress={submit} loading={busy} disabled={!email || !password} />
        </Card>
        <View style={{ alignItems: 'center', marginTop: 22, gap: 10 }}>
          <Text tone="muted">Ainda não tem conta?</Text>
          <Link href="/cadastro" asChild>
            <Pressable accessibilityRole="button" style={{ paddingVertical: 12, paddingHorizontal: 24, borderRadius: 99, borderWidth: 1.5, borderColor: colors.amber }}>
              <Text weight="black" tone="amber" size={16}>Criar conta grátis</Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
