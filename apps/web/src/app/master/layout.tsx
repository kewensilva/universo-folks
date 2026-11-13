import { PanelShell } from '@/components/shells';

/** Menu completo do MASTER (gestão de toda a plataforma). */
const NAV = [
  { href: '/master', label: 'Visão geral', icon: '📊', exact: true },
  { href: '/master/empresas', label: 'Empresas', icon: '🏢' },
  { href: '/master/alunos', label: 'Pessoas e alunos', icon: '🧑‍🚀' },
  { href: '/master/conteudo', label: 'Conteúdo', icon: '🪐' },
  { href: '/master/metodologia', label: 'Metodologia', icon: '🧪' },
  { href: '/master/personalizacao-trilha', label: 'Personalização de trilha', icon: '🧭' },
  { href: '/master/importacoes', label: 'Importações', icon: '📥' },
  { href: '/master/vimeo', label: 'Vídeos (Vimeo)', icon: '🎬' },
  { href: '/master/certificados', label: 'Certificados', icon: '🏆' },
  { href: '/master/planos', label: 'Planos', icon: '💎' },
  { href: '/master/financeiro', label: 'Financeiro', icon: '💳' },
  { href: '/master/masters', label: 'Masters', icon: '🛰️' },
  { href: '/master/integracoes', label: 'Integração Claude', icon: '🤖' },
  { href: '/master/configuracoes', label: 'Configurações', icon: '⚙️' },
];

export default function MasterLayout({ children }: LayoutProps<'/master'>) {
  return <PanelShell area="master" title="Master Folks" nav={NAV}>{children}</PanelShell>;
}
