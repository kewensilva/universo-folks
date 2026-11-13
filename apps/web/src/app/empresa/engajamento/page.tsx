'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { CompanyEngagement } from '@/components/company/engagement';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Engajamento e relatórios" subtitle="Quem estudou em cada semana ou mês, e o relatório completo em Excel." />
      <CompanyEngagement tenantId={context!.tenantId!} />
    </>
  );
}
