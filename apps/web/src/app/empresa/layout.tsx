import { PanelShell } from '@/components/shells';

/** Menu completo do administrador da empresa (Cliente-Folks B2B). */
const NAV = [
  { href: '/empresa', label: 'Visão geral', icon: '📊', exact: true },
  { href: '/empresa/pessoas', label: 'Pessoas', icon: '👥' },
  { href: '/empresa/departamentos', label: 'Departamentos', icon: '🗂️' },
  { href: '/empresa/planetas', label: 'Planetas liberados', icon: '🪐' },
  { href: '/empresa/trilhas', label: 'Trilhas obrigatórias', icon: '🧭' },
  { href: '/empresa/engajamento', label: 'Engajamento e relatórios', icon: '📈' },
  { href: '/empresa/configuracoes', label: 'Regras da empresa', icon: '⚙️' },
];

export default function EmpresaLayout({ children }: LayoutProps<'/empresa'>) {
  return <PanelShell area="empresa" title="Painel da empresa" nav={NAV}>{children}</PanelShell>;
}
