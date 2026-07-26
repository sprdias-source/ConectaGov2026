import { useMemo } from 'react'
import { Sun, Gavel, ClipboardList, Wallet, AlertTriangle, User } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { SkeletonList } from '../components/ui/Skeleton'
import AlertaSessaoRisco from '../components/dashboard/AlertaSessaoRisco'
import { useAgendaEventos } from '../hooks/useAgendaEventos'
import { usePendenciasChecklist } from '../hooks/useBiddingChecklist'
import { todayLocalISO } from '../lib/dateUtils'

const JANELA_PENDENCIAS_SEMANA_DIAS = 7

const ICONE_POR_TIPO = { pregao: Gavel, checklist: ClipboardList, financeiro: Wallet }
const COR_POR_TIPO = { pregao: 'text-accent-400', checklist: 'text-warning-400', financeiro: 'text-positive-400' }

// Tudo que precisa de atenção HOJE, numa tela só — junta o que já existe
// espalhado em três telas (Agenda, Pendências e o alerta do Dashboard) sem
// duplicar a lógica de nenhuma delas (todas vêm de hooks compartilhados).
// O Dashboard continua intacto — esta é uma tela adicional.
export default function HojePage() {
  const hoje = todayLocalISO()
  const { eventosPorDia, isLoading: loadingAgenda } = useAgendaEventos()
  const { pendencias, isLoading: loadingPendencias } = usePendenciasChecklist()

  const eventosDeHoje = eventosPorDia.get(hoje) ?? []

  const pendenciasDaSemana = useMemo(() => {
    const hojeMemo = todayLocalISO()
    return pendencias
      .filter((p) => {
        if (!p.prazo) return false
        const dias = Math.floor(
          (new Date(p.prazo + 'T00:00:00').getTime() - new Date(hojeMemo + 'T00:00:00').getTime())
          / (1000 * 60 * 60 * 24)
        )
        return dias <= JANELA_PENDENCIAS_SEMANA_DIAS
      })
      .sort((a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? ''))
  }, [pendencias])

  const diasRestantes = (prazo: string | null): number | null => {
    if (!prazo) return null
    return Math.floor((new Date(prazo + 'T00:00:00').getTime() - new Date(hoje + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
  }

  const corFor = (dias: number | null) => {
    if (dias === null) return 'text-base-400 bg-base-850/60 border-base-700/50'
    if (dias < 0) return 'text-negative-400 bg-negative-500/10 border-negative-500/25'
    if (dias <= 1) return 'text-warning-400 bg-warning-500/10 border-warning-500/25'
    return 'text-base-300 bg-base-850/60 border-base-700/50'
  }

  const labelDias = (dias: number | null) => {
    if (dias === null) return 'Sem prazo'
    if (dias < 0) return `Vencido há ${Math.abs(dias)} dia(s)`
    if (dias === 0) return 'Vence hoje'
    if (dias === 1) return 'Vence amanhã'
    return `${dias} dias`
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Hoje"
        subtitle={new Date(hoje + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        icon={Sun}
      />

      <AlertaSessaoRisco />

      <div className="px-6 mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-[13px] font-bold text-base-100 mb-3">Agenda de Hoje</p>
          {loadingAgenda ? (
            <SkeletonList itens={3} />
          ) : eventosDeHoje.length === 0 ? (
            <p className="text-[12px] text-base-500 italic py-6 text-center">Nenhum evento pra hoje.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {eventosDeHoje.map((e, idx) => {
                const Icone = ICONE_POR_TIPO[e.tipo]
                return (
                  <div key={idx} className="flex items-start gap-2.5 bg-base-850/60 border border-base-800 rounded-lg p-2.5">
                    <Icone className={`w-4 h-4 shrink-0 mt-0.5 ${COR_POR_TIPO[e.tipo]}`} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-base-200 truncate">{e.titulo}</p>
                      <p className="text-[11px] text-base-500 truncate">{e.subtitulo}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[13px] font-bold text-base-100 mb-3">Pendências Vencendo Esta Semana</p>
          {loadingPendencias ? (
            <SkeletonList itens={3} />
          ) : pendenciasDaSemana.length === 0 ? (
            <p className="text-[12px] text-base-500 italic py-6 text-center">Nenhuma pendência de checklist nos próximos {JANELA_PENDENCIAS_SEMANA_DIAS} dias.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pendenciasDaSemana.map((p) => {
                const dias = diasRestantes(p.prazo)
                return (
                  <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${corFor(dias)}`}>
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-base-200 truncate">{p.descricao}</p>
                      <p className="text-[11px] text-base-500 truncate">{p.clientName} — {p.biddingObjeto.slice(0, 40)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-bold">{labelDias(dias)}</p>
                      {p.responsavelNome && (
                        <p className="text-[10px] text-base-500 flex items-center justify-end gap-1 mt-0.5">
                          <User className="w-3 h-3" /> {p.responsavelNome}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
