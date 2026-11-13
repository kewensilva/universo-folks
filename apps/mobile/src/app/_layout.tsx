import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts } from '@expo-google-fonts/plus-jakarta-sans';
import { colors } from '@folks/shared';
import { Providers, useSession } from '@/lib/session';
import { Offline } from '@/components/offline';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  if (!loaded && !error) return null;
  return (
    <Providers>
      <StatusBar style="light" />
      <RootNavigator />
    </Providers>
  );
}

/**
 * Rotas por estado da sessão (Stack.Protected, padrão do expo-router SDK 58):
 * - sem sessão: entrar e cadastro gratuito
 * - colaborador ou aluno: área de estudo (app)
 * - MASTER ou ADMIN da empresa: aviso de que o painel é na web, com troca de perfil (ADR 0012)
 */
function RootNavigator() {
  const { status, canStudy, retry } = useSession();
  useEffect(() => { if (status !== 'loading') void SplashScreen.hideAsync(); }, [status]);
  if (status === 'loading') return null;
  if (status === 'offline') return <Offline onRetry={retry} />;
  const authed = status === 'auth';
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={authed && canStudy}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={authed && !canStudy}>
        <Stack.Screen name="painel-na-web" />
      </Stack.Protected>
      <Stack.Protected guard={!authed}>
        <Stack.Screen name="entrar" />
        <Stack.Screen name="cadastro" />
      </Stack.Protected>
    </Stack>
  );
}
