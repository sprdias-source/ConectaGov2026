import { useState } from 'react'
import { FolderKanban, Users, Gavel, Wallet } from 'lucide-react'
import { PageHeader } from '../components/ui/Primitives'
import { useClients } from '../hooks/useClients'
import { useBiddings } from '../hooks/useBiddings'
import { useFinancialAccounts } from '../hooks/useFinancialAccounts'
import ClientsTab from '../components/cadastros/ClientsTab'
import BiddingsTab from '../components/cadastros/BiddingsTab'
import AccountsTab from '../components/cadastros/AccountsTab'

type Tab = 'clientes' | 'licitacoes' | 'contas'

export default function CadastrosPage() {
  const [tab, setTab] = useState<Tab>('clientes')
  const { clients } = useClients()
  const { biddings } = useBiddings()
  const { accounts } = useFinancialAccounts()

  const tabs: { key: Tab; label: string; icon: typeof Users; count: number }[] = [
    { key: 'clientes', label: 'Clientes', icon: Users, count: clients.length },
    { key: 'licitacoes', label: 'Licitações', icon: Gavel, count: biddings.length },
    { key: 'contas', label: 'Contas & Cartões', icon: Wallet, count: accounts.length },
  ]

  return (
    <div className="pb-10">
      <PageHeader title="Cadastros" subtitle="Clientes, licitações e contas financeiras" icon={FolderKanban} />

      <div className="px-6 mt-3">
        <div className="flex gap-1.5 border-b border-base-800 mb-5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition border-b-2 -mb-px ${
                tab === t.key
                  ? 'text-accent-300 border-accent-400'
                  : 'text-base-400 border-transparent hover:text-base-200'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-accent-500/15 text-accent-300' : 'bg-base-800 text-base-500'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {tab === 'clientes' && <ClientsTab />}
        {tab === 'licitacoes' && <BiddingsTab />}
        {tab === 'contas' && <AccountsTab />}
      </div>
    </div>
  )
}
