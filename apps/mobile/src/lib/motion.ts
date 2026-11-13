import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'react-native-reanimated';
import { useSession } from './session';

/** Animações paradas: "reduzir movimento" do aparelho OU "Reduzir animações" nos Ajustes do app. */
export function useStill(): boolean {
  const system = useReducedMotion();
  const { api, status, canStudy } = useSession();
  const prefs = useQuery({ queryKey: ['me', 'preferences'], queryFn: () => api.me.preferences(), enabled: status === 'auth' && canStudy, staleTime: 5 * 60_000 });
  return system || !!prefs.data?.reduceAnimations;
}
