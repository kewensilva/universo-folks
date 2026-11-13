import { Stack } from 'expo-router';
import { colors } from '@folks/shared';

export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
