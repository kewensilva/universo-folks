import { StudyShell } from '@/components/shells';

export default function EstudarLayout({ children }: LayoutProps<'/estudar'>) {
  return <StudyShell>{children}</StudyShell>;
}
