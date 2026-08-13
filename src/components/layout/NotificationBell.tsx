import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertOctagon, FileWarning, Clock, Globe, Send } from 'lucide-react'
import { useSessoesDeRisco } from '../../hooks/useSessoesDeRisco'
import { useAllClientDocuments } from '../../hooks/useClientDocuments'
import { useTransactions } from '../../hooks/useTransactions'
import { useAllClientPlatforms, calcPlatformStatus } from '../../hooks/useClientPlatforms'
import { useOpportunities, calcOpportunityStatus } from '../../hooks/useOpportunities'
import { useClients } from '../../hooks/useClients'

// Central de Alertas — consolida num sino só o que hoje aparece espalhado
// por página (Central de Prazos, Dashboard, Oportunidades): sessões de
// risco, certidões vencendo, financeiro atrasado, plataformas vencendo e
// oportunidades aguardando resposta. Não inventa nenhum dado novo — cada
// hook usado aqui já alimenta a tela onde aquele alerta normalmente
// aparece; isso só junta tudo num único lugar visível em qualquer página.
// Self-contido de propósito (busca os próprios dados) — o React Query
// dedupe as queries que já rodam em AppShell.tsx pela mesma queryKey, então
// isso não gera nenhuma consulta extra ao banco.
export default function NotificationBell() {
  const navigate = useNavigate()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { sessoesDeRisco } = useSessoesDeRisco()
  const { documents: clientDocuments } = useAllClientDocuments()
  const { transactions } = useTransactions()
  const { clientPlatforms } = useAllClientPlatforms()
  const { opportunities } = useOpportunities()
  const { clients } = useClients()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const certidoesVencendo = clientDocuments.filter((d) => d.status === 'vencendo' || d.status === 'vencido').length
  const financeiroAtrasado = transactions.filter((t) => t.status === 'Atrasado').length
  const plataformasVencendo = clientPlatforms.filter((cp) => {
    const status = calcPlatformStatus(cp.dataVencimento, cp.diasAvisoVencimento)
    return status === 'vencendo' || status === 'vencida'
  }).length
  const oportunidadesUrgentes = opportunities.filter((o) => {
    const status = calcOpportunityStatus(o)
    return status === 'urgente' || status === 'vencida'
  }).length

  const total = sessoesDeRisco.length + certidoesVencendo + financeiroAtrasado + plataformasVencendo + oportunidadesUrgentes
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'

  const irPara = (path: string) => {
    setAberto(false)
    navigate(path)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className="relative p-2 text-base-400 hover:text-base-100 hover:bg-base-800 rounded-lg transition"
        title="Central de Alertas"
      >
        <Bell className="w-4 h-4" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold bg-negative-500 text-white rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-80 bg-base-900 border border-base-700 rounded-xl shadow-xl z-50 max-h-[420px] overflow-y-auto">
          <div className="px-3.5 py-2.5 border-b border-base-800">
            <p className="text-[12px] font-bold text-base-100">Central de Alertas</p>
          </div>
          {total === 0 ? (
            <p className="text-[12px] text-base-500 italic px-3.5 py-6 text-center">Tudo em dia — nenhum alerta no momento.</p>
          ) : (
            <div className="flex flex-col divide-y divide-base-800">
              {sessoesDeRisco.length > 0 && (
                <div className="px-3.5 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-negative-400 font-bold mb-1.5 flex items-center gap-1.5">
                    <AlertOctagon className="w-3 h-3" /> Sessões de Risco
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {sessoesDeRisco.map(({ bidding: b, dias, status }) => (
                      <button key={b.id} onClick={() => irPara(`/licitacoes/${b.id}`)} className="text-left text-[11.5px] text-base-300 hover:text-base-100 transition">
                        <span className="block truncate">{b.objeto} — {clientName(b.clientId)}</span>
                        <span className="text-[10px] text-negative-400 font-semibold">{status} · {dias === 0 ? 'sessão hoje' : `sessão em ${dias}d`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {certidoesVencendo > 0 && (
                <button onClick={() => irPara('/central-prazos')} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-base-850/60 transition">
                  <span className="flex items-center gap-1.5 text-[12px] text-base-300"><FileWarning className="w-3.5 h-3.5 text-warning-400" /> Certidões vencendo/vencidas</span>
                  <span className="text-[11px] font-bold text-warning-400">{certidoesVencendo}</span>
                </button>
              )}
              {financeiroAtrasado > 0 && (
                <button onClick={() => irPara('/central-prazos')} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-base-850/60 transition">
                  <span className="flex items-center gap-1.5 text-[12px] text-base-300"><Clock className="w-3.5 h-3.5 text-negative-400" /> Lançamentos financeiros atrasados</span>
                  <span className="text-[11px] font-bold text-negative-400">{financeiroAtrasado}</span>
                </button>
              )}
              {plataformasVencendo > 0 && (
                <button onClick={() => irPara('/central-prazos')} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-base-850/60 transition">
                  <span className="flex items-center gap-1.5 text-[12px] text-base-300"><Globe className="w-3.5 h-3.5 text-warning-400" /> Plataformas vencendo</span>
                  <span className="text-[11px] font-bold text-warning-400">{plataformasVencendo}</span>
                </button>
              )}
              {oportunidadesUrgentes > 0 && (
                <button onClick={() => irPara('/cadastros?tab=oportunidades')} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-base-850/60 transition">
                  <span className="flex items-center gap-1.5 text-[12px] text-base-300"><Send className="w-3.5 h-3.5 text-warning-400" /> Oportunidades aguardando resposta</span>
                  <span className="text-[11px] font-bold text-warning-400">{oportunidadesUrgentes}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
