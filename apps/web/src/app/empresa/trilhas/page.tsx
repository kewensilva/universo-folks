'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { CompanyAssignments } from '@/components/company/assignments';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Trilhas obrigatórias" subtitle="Cursos e planetas com prazo e prioridade para a equipe." />
      <CompanyAssignments tenantId={context!.tenantId!} />
    </>
  );
}
