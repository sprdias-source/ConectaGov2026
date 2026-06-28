import {
  LayoutDashboard, FolderKanban, Wallet, CalendarRange, FileBarChart,
  Receipt, FileSignature, Users, Calculator, type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  key: string
  label: string
  path: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { key: 'cadastros', label: 'Cadastros', path: '/cadastros', icon: FolderKanban },
  { key: 'contas', label: 'Transações', path: '/contas', icon: Wallet },
  { key: 'fluxo', label: 'Fluxo de Caixa', path: '/fluxo', icon: CalendarRange },
  { key: 'relatorios', label: 'Relatórios', path: '/relatorios', icon: FileBarChart },
  { key: 'recibos', label: 'Recibos/Orç', path: '/recibos', icon: Receipt },
  { key: 'contratos', label: 'Contratos', path: '/contratos', icon: FileSignature },
  { key: 'funcionarios', label: 'Funcionários', path: '/funcionarios', icon: Users },
  { key: 'contabilidade', label: 'Contabilidade', path: '/contabilidade', icon: Calculator },
]
