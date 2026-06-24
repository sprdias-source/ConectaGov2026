import { useState } from 'react'
import { Wallet, Receipt, FileSpreadsheet } from 'lucide-react'
import { PageHeader } from '../components/ui/Primitives'
import { useTransactions } from '../hooks/useTransactions'
import { useEmpenhos } from '../hooks/useEmpenhos'
import ContasLancamentosTab from '../components/contas/ContasLancamentosTab'
import EmpenhosTab from '../components/contas/EmpenhosTab'

type Tab = 'lancamentos' | 'empenhos'

export default function ContasPage() {
  const [tab, setTab] = useState<Tab>('lancamentos')
  const { transactions } = useTransactions()
  const { empenhos } = useEmpenhos()

  const tabs: { key: Tab; label: string; icon: typeof Receipt; count: number }[] = [
    { key: 'lancamentos', label: 'Contas & Lançamentos', icon: Receipt, count: transactions.length },
    { key: 'empenhos', label: 'Gestão de Empenhos', icon: FileSpreadsheet, count: empenhos.length },
  ]

  return (
    <div className="pb-10">
      <PageHeader title="Transações" subtitle="Lançamentos financeiros e gestão de empenhos" icon={Wallet} />

      <div className="px-6 mt-3">
        <div className="flex gap-1.5 border-b border-base-800 mb-5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition border-b-2 -mb-px ${
                tab === t.key ? 'text-accent-300 border-accent-400' : 'text-base-400 border-transparent hover:text-base-200'
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

        {tab === 'lancamentos' && <ContasLancamentosTab />}
        {tab === 'empenhos' && <EmpenhosTab />}
      </div>
    </div>
  )
}
