'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AREA_HOME, useSession } from '@/lib/session';
import { Loading } from '@/components/ui';
import { Offline } from '@/components/guard';

/** Raiz: leva cada perfil para a sua área (ou para o login). */
export default function Home() {
  const { status, area, retry } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anon') router.replace('/entrar');
    if (status === 'auth' && area) router.replace(AREA_HOME[area]);
  }, [status, area, router]);
  if (status === 'offline') return <Offline onRetry={retry} />;
  return <Loading label="Abrindo o Universo…" />;
}
