import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, errorMessage } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Astronaut } from '@/components/space/astronaut';
import { Field, PasswordField, brDateToIso, maskBrDate } from '@/components/fields';
import { Button, Card, Screen, Text } from '@/components/ui';

const PASSWORD_OK = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cadastro gratuito de quem baixou o app (B2C). A conta nasce no plano Básico (cursos e unidades
 * gratuitos); o Premium é contratado depois, dentro do app. Quem tem o código da empresa já entra nela.
 */
export default function Cadastro() {
  const { register } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birth, setBirth] = useState('');
  const [password, setPassword] = useState('');
  const [withCode, setWithCode] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function problem(): string | null {
    if (name.trim().length < 2) return 'Diga como quer ser chamado (pelo menos 2 letras).';
    if (!EMAIL_OK.test(email.trim())) return 'Confira o e-mail.';
    if (!brDateToIso(birth)) return 'Data de nascimento inválida. Use DD/MM/AAAA.';
    if (!PASSWORD_OK.test(password)) return 'A senha precisa ter pelo menos 8 caracteres, com letras e números.';
    if (withCode && code.trim().length < 4) return 'Digite o código da empresa ou desmarque a opção.';
    return null;
  }

  async function submit() {
    const p = problem();
    if (p) { setError(p); return; }
    setBusy(true);
    setError(null);
    try {
      await register({ name, email, password, birthDate: brDateToIso(birth)!, ...(withCode && code.trim() ? { companyCode: code.trim().toUpperCase() } : {}) });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/entrar'))} accessibilityRole="button" accessibilityLabel="Voltar para o login" hitSlop={10} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
          <Text tone="muted" weight="bold">‹ Voltar</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 14 }}>
          <Astronaut mood="wave" width={86} />
          <View style={{ flex: 1 }}>
            <Text weight="black" size={26}>Criar conta</Text>
            <Text tone="muted" style={{ marginTop: 2 }}>É grátis. Depois, se quiser, você vira Premium aqui no app.</Text>
          </View>
        </View>
        <Card style={{ gap: 14 }}>
          <Field label="Como quer ser chamado?" value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={60} placeholder="Seu nome ou apelido" />
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="voce@email.com" />
          <Field label="Data de nascimento" value={birth} onChangeText={(v) => setBirth(maskBrDate(v))} keyboardType="number-pad" placeholder="DD/MM/AAAA" maxLength={10} autoComplete="birthdate-full" hint="Usamos para adequar o app à sua idade." />
          <PasswordField label="Senha" value={password} onChangeText={setPassword} autoComplete="new-password" textContentType="newPassword" hint="Pelo menos 8 caracteres, com letras e números." />
          <Pressable onPress={() => setWithCode((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: withCode }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: withCode ? colors.amber : colors.dim, backgroundColor: withCode ? colors.amber : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {withCode && <Text weight="black" size={13} style={{ color: colors.onAmber }}>✓</Text>}
            </View>
            <Text weight="bold">Tenho um código da minha empresa</Text>
          </Pressable>
          {withCode && <Field label="Código da empresa" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="EX.: ORBITA-2026" />}
          {error && <Text tone="red" weight="bold" accessibilityRole="alert">{error}</Text>}
          <Button title="Criar conta grátis" onPress={submit} loading={busy} />
          <Text tone="dim" size={12} style={{ textAlign: 'center' }}>Ao criar a conta você concorda com os Termos de uso e a Política de privacidade da Folks.</Text>
        </Card>
        <View style={{ alignItems: 'center', marginTop: 18 }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/entrar'))} accessibilityRole="button" hitSlop={8}>
            <Text tone="muted">Já tem conta? <Text weight="black" tone="amber">Entrar</Text></Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
