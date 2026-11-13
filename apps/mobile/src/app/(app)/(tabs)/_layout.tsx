import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@folks/shared';
import { useSession } from '@/lib/session';
import { F } from '@/components/ui';

const icon = (glyph: string) => function TabIcon({ focused }: { focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>{glyph}</Text>;
};

/**
 * Abas do protótipo: Início, Cursos, Hangar, Empresa (colaborador) ou Premium (aluno B2C) e Ajustes.
 * Quem estuda pela empresa não vê o Premium: a empresa já libera a biblioteca.
 */
export default function TabsLayout() {
  const { context } = useSession();
  const inCompany = context?.mode === 'TENANT';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.dim,
        tabBarStyle: { backgroundColor: colors.bgElevated, borderTopColor: colors.cardBorder },
        tabBarLabelStyle: { fontFamily: F.bold, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Início', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="planetas" options={{ title: 'Cursos', tabBarIcon: icon('🪐') }} />
      <Tabs.Screen name="hangar" options={{ title: 'Hangar', tabBarIcon: icon('🧑‍🚀') }} />
      <Tabs.Screen name="empresa" options={{ title: 'Empresa', tabBarIcon: icon('🏢'), href: inCompany ? undefined : null }} />
      <Tabs.Screen name="premium" options={{ title: 'Premium', tabBarIcon: icon('👑'), href: inCompany ? null : undefined }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
