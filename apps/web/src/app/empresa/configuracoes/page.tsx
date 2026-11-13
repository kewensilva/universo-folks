'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { CompanySettings } from '@/components/company/settings';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Regras da empresa" subtitle="Nota mínima, tentativas e fluxo da trilha. As cotas de licença são da Folks." />
      <CompanySettings tenantId={context!.tenantId!} variant="admin" />
    </>
  );
}
