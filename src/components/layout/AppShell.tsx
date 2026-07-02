import { type ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Eye, EyeOff, Menu, X, ChevronLeft, ChevronRight, Wallet,
  CreditCard, ShieldCheck, LogOut, Download,
} from 'lucide-react'
import { NAV_GROUPS } from './navConfig'
import { useAuth } from '../../hooks/useAuth'
import { useFinancialAccounts } from '../../hooks/useFinancialAccounts'
import { useTransactions } from '../../hooks/useTransactions'
import { useAccountBalances, formatBRL } from '../../hooks/useAccountBalances'
import { useBackup } from '../../hooks/useBackup'

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { accounts } = useFinancialAccounts()
  const { transactions } = useTransactions()
  const { standardAccounts, creditCards, balances, patrimonioTotal, unlinkedPaidCount } = useAccountBalances(accounts, transactions)
  const { exportBackup, isExporting } = useBackup()

  const [patrimonioVisible, setPatrimonioVisible] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cg_sidebar_collapsed') === 'true')

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('cg_sidebar_collapsed', String(next))
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-base-950 flex flex-col lg:flex-row text-base-100 font-sans antialiased selection:bg-accent-500/30">
      {/* Mobile header */}
      <div className="lg:hidden bg-base-900 border-b border-base-700/60 px-4 py-3 flex justify-between items-center z-50 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-500 to-accent-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-base-950" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-sm">ConectaGov</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPatrimonioVisible((v) => !v)}
            className="p-1.5 text-base-400 hover:text-base-100 rounded"
          >
            {patrimonioVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 text-base-300 hover:text-base-100 hover:bg-base-800 rounded-lg transition"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 bg-base-950 border-r border-base-700/50 flex flex-col justify-between z-40 transition-all duration-300
          ${collapsed ? 'w-16 p-3' : 'w-64 p-4'}
          lg:static lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:flex'}`}
      >
        {collapsed ? (
          <div className="flex flex-col gap-5 items-center flex-1 py-1 overflow-y-auto">
            <div className="pb-4 border-b border-base-800 w-full flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-400 flex items-center justify-center">
                <ShieldCheck className="w-4.5 h-4.5 text-base-950" strokeWidth={2.5} />
              </div>
              <button
                onClick={toggleCollapsed}
                className="p-1 rounded bg-base-850 hover:bg-base-800 text-base-400 hover:text-base-100 border border-base-700 transition"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div
              onClick={() => setPatrimonioVisible((v) => !v)}
              className="bg-base-900/60 border border-base-700/50 rounded-xl p-2.5 text-center cursor-pointer hover:bg-base-900 transition w-full flex flex-col items-center gap-1"
              title={`Patrimônio: ${patrimonioVisible ? formatBRL(patrimonioTotal) : '••••'}`}
            >
              <Wallet className="w-4 h-4 text-accent-400" />
              <span className={`text-[8px] font-bold ${patrimonioTotal >= 0 ? 'text-positive-400' : 'text-negative-400'}`}>
                {patrimonioVisible ? (patrimonioTotal >= 0 ? '+' : '−') : '••'}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 flex-1 overflow-y-auto">
            <div className="pb-3 border-b border-base-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-400 flex items-center justify-center">
                  <ShieldCheck className="w-4.5 h-4.5 text-base-950" strokeWidth={2.5} />
                </div>
                <span className="font-display font-bold text-sm tracking-tight">ConectaGov</span>
              </div>
              <button
                onClick={toggleCollapsed}
                className="p-1 rounded bg-base-850 hover:bg-base-800 text-base-400 hover:text-base-100 border border-base-700 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="bg-base-900/60 border border-base-700/50 rounded-xl p-3">
              <div className="flex justify-between items-center text-base-400">
                <span className="text-[9px] font-bold tracking-widest uppercase">Patrimônio Total</span>
                <button onClick={() => setPatrimonioVisible((v) => !v)} className="text-base-500 hover:text-base-200 transition">
                  {patrimonioVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
              </div>
              <div className={`text-xl font-extrabold mt-1 font-mono tabular-nums tracking-tight ${patrimonioTotal >= 0 ? 'text-positive-400' : 'text-negative-400'}`}>
                {patrimonioVisible ? formatBRL(patrimonioTotal) : 'R$ ••••••'}
              </div>
              {unlinkedPaidCount > 0 && (
                <p className="text-[9px] text-warning-400 mt-1.5 leading-tight">
                  {unlinkedPaidCount} lançamento(s) pago(s) sem conta vinculada não entram nesse total.
                </p>
              )}
            </div>

            <NavSection
              icon={<Wallet className="w-3.5 h-3.5 text-accent-400" />}
              label="Contas"
              empty="Nenhuma conta"
              items={standardAccounts.map((a) => ({
                key: a.id,
                name: a.name,
                value: balances.get(a.id) ?? 0,
                positiveColor: 'text-positive-400',
                negativeColor: 'text-negative-400',
              }))}
              visible={patrimonioVisible}
            />

            <NavSection
              icon={<CreditCard className="w-3.5 h-3.5 text-accent-400" />}
              label="Cartões"
              empty="Nenhum cartão"
              items={creditCards.map((a) => ({
                key: a.id,
                name: a.name,
                value: -(balances.get(a.id) ?? 0),
                positiveColor: 'text-negative-400',
                negativeColor: 'text-negative-400',
              }))}
              visible={patrimonioVisible}
            />

            {accounts.filter((a) => a.type === 'INTERNO').length > 0 && (
              <div className="mt-1">
                <p className="px-2.5 text-[9px] font-bold uppercase tracking-widest text-base-600 mb-1">Caixa Interno</p>
                {accounts.filter((a) => a.type === 'INTERNO').map((a) => {
                  // Calcula o saldo desta conta interna isoladamente —
                  // nunca entra no patrimônio nem em qualquer outro cálculo.
                  const saldoInterno = transactions
                    .filter((t) => t.status === 'Pago' && t.accountId === a.id)
                    .reduce((s, t) => s + (t.type === 'Receber' ? t.value : -t.value), a.startingBalance)
                  return (
                    <div key={a.id} className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-[12px] text-base-500 truncate">{a.name}</span>
                      <span className={`text-[12px] font-mono font-semibold ml-2 shrink-0 ${saldoInterno >= 0 ? 'text-base-400' : 'text-negative-400'}`}>
                        {formatBRL(saldoInterno)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <nav className="flex flex-col gap-3 mt-1">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-0.5">
                  <span className="px-2.5 text-[9px] font-bold uppercase tracking-widest text-base-600 mb-0.5">
                    {group.label}
                  </span>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.key}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition ${
                          isActive
                            ? 'bg-accent-500/10 text-accent-300 border border-accent-500/20'
                            : 'text-base-400 hover:text-base-100 hover:bg-base-850 border border-transparent'
                        }`
                      }
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
          </div>
        )}

        <div className="pt-3 border-t border-base-800 flex flex-col gap-2 shrink-0">
          {collapsed ? (
            <div className="flex flex-col gap-2 items-center">
              <button onClick={() => exportBackup()} disabled={isExporting} title="Exportar backup" className="p-2 rounded-lg bg-base-850 text-base-400 hover:text-accent-300 border border-base-700">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={handleSignOut} title="Sair" className="p-2 rounded-lg bg-base-850 text-base-400 hover:text-negative-400 border border-base-700">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="bg-positive-500/10 border border-positive-500/25 rounded-lg p-2.5 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-positive-400 shrink-0" />
                <div className="text-xs leading-tight min-w-0">
                  <div className="font-semibold text-base-200 truncate">{user?.email}</div>
                  <p className="text-[10px] text-base-500 mt-0.5">Sessão segura e ativa</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => exportBackup()}
                  disabled={isExporting}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-accent-300 bg-base-850 hover:bg-base-800 border border-base-700 rounded-lg py-1.5 transition disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isExporting ? 'Exportando...' : 'Backup'}
                </button>
                <button
                  onClick={handleSignOut}
                  className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-negative-400 bg-base-850 hover:bg-base-800 border border-base-700 rounded-lg py-1.5 px-3 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="flex-1 min-w-0 min-h-screen">
        <div key="content" className="animate-fade-in w-full min-h-full">
          {children}
        </div>
      </main>
    </div>
  )
}

interface NavSectionItem {
  key: string
  name: string
  value: number
  positiveColor: string
  negativeColor: string
}

function NavSection({
  icon, label, items, empty, visible,
}: { icon: ReactNode; label: string; items: NavSectionItem[]; empty: string; visible: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-1">
        {icon}
        <span className="text-[9px] font-extrabold text-base-500 uppercase tracking-widest">{label}</span>
      </div>
      <div className="flex flex-col gap-1 bg-base-900/40 border border-base-800/60 rounded-lg p-2">
        {items.length === 0 ? (
          <div className="text-[10px] text-base-500 italic px-1 py-0.5">{empty}</div>
        ) : (
          items.map((it) => {
            const isPositive = it.value >= 0
            return (
              <div key={it.key} className="flex justify-between items-center text-xs py-1 px-1 hover:bg-base-850 rounded transition">
                <span className="text-base-300 font-medium truncate max-w-[120px]">{it.name}</span>
                <span className={`font-bold font-mono tabular-nums ${isPositive ? it.positiveColor : it.negativeColor}`}>
                  {visible ? formatBRL(it.value) : 'R$ •••'}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
