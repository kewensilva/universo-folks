'use client';

import { useSession } from '@/lib/session';
import { CompanyDashboard } from '@/components/company/dashboard';

export default function EmpresaHome() {
  const { context } = useSession();
  return <CompanyDashboard tenantId={context!.tenantId!} />;
}
