'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { CompanyPeople } from '@/components/company/people';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Pessoas" subtitle="Convide, organize por setor, acompanhe o progresso e envie lembretes." />
      <CompanyPeople tenantId={context!.tenantId!} />
    </>
  );
}
