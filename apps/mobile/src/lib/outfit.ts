import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { outfitOf, type AstronautOutfit } from '@folks/shared';
import { useSession } from './session';

/** Roupa que a pessoa escolheu no Hangar (todas as telas mostram o astronauta com ela). */
export function useMyOutfit(): AstronautOutfit {
  const { api, status, canStudy } = useSession();
  const q = useQuery({ queryKey: ['hangar'], queryFn: () => api.me.hangar(), enabled: status === 'auth' && canStudy, staleTime: 5 * 60_000 });
  return useMemo(() => outfitOf(q.data), [q.data]);
}
