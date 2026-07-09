import {
  LayoutDashboard, FolderKanban, Wallet, CalendarRange, FileBarChart,
  Receipt, FileSignature, Users, Calculator, ShieldCheck, Target, FileText, UserCog, type LucideIcon,
} from 'lucide-react'
export interface NavItem {
  key: string
  label: string
  path: string
  icon: LucideIcon
}
export interface NavGroup {
  label: string
  items: NavItem[]
}
// Agrupado por finalidade em vez de uma lista plana — com 11 telas, uma
// parede única de itens idênticos dificulta achar o que se procura.
// Cada grupo carrega um pequeno cabeçalho (sem caixa, só tipografia) para
// quebrar a repetição visual sem adicionar mais ruído de UI.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { key: 'cadastros', label: 'Cadastros', path: '/cadastros', icon: FolderKanban },
      { key: 'contas', label: 'Transações', path: '/contas', icon: Wallet },
      { key: 'extrato', label: 'Extrato OFX', path: '/extrato', icon: FileText },
      { key: 'fluxo', label: 'Fluxo de Caixa', path: '/fluxo', icon: CalendarRange },
    ],
  },
  {
    label: 'Documentos',
    items: [
      { key: 'recibos', label: 'Recibos/Orç', path: '/recibos', icon: Receipt },
      { key: 'contratos', label: 'Contratos', path: '/contratos', icon: FileSignature },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { key: 'bi-concorrencia', label: 'BI Concorrência', path: '/bi-concorrencia', icon: Target },
      { key: 'relatorios', label: 'Relatórios', path: '/relatorios', icon: FileBarChart },
      { key: 'funcionarios', label: 'Funcionários', path: '/funcionarios', icon: Users },
      { key: 'contabilidade', label: 'Contabilidade', path: '/contabilidade', icon: Calculator },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { key: 'usuarios', label: 'Usuários', path: '/usuarios', icon: UserCog },
      { key: 'diagnostico', label: 'Diagnóstico', path: '/diagnostico', icon: ShieldCheck },
    ],
  },
]
// Mantido para qualquer código que ainda dependa da lista plana.
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)
