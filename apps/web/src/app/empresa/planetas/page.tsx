'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { CompanyPlanets } from '@/components/company/planets';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Planetas liberados" subtitle="Escolha quais temas a equipe vê, para todos ou por setor." />
      <CompanyPlanets tenantId={context!.tenantId!} />
    </>
  );
}
