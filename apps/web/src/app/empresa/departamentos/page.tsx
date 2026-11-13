'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { CompanyDepartments } from '@/components/company/departments';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Departamentos" subtitle="Os setores da empresa. Cada pessoa pode estar em um ou mais." />
      <CompanyDepartments tenantId={context!.tenantId!} />
    </>
  );
}
