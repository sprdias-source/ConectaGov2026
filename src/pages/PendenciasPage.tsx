import { useMemo } from 'react'
import { ClipboardList, AlertTriangle, User } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { usePendenciasChecklist } from '../hooks/useBiddingChecklist'
import { todayLocalISO } from '../lib/dateUtils'

export default function PendenciasPage() {
  const { pendencias, isLoading } = usePendenciasChecklist()

  const diasRestantes = (prazo: string | null): number | null => {
    if (!prazo) return null
    const hoje = new Date(todayLocalISO() + 'T00:00:00')
    const data = new Date(prazo + 'T00:00:00')
    return Math.floor((data.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  }

  const pendenciasOrdenadas = useMemo(() => {
    // Já vem ordenado por prazo do hook (prazo mais próximo primeiro,
    // sem prazo por último) — só separa obrigatórios de opcionais aqui.
    return pendencias
  }, [pendencias])

  const corFor = (dias: number | null) => {
    if (dias === null) return 'text-base-400 bg-base-850/60 border-base-700/50'
    if (dias < 0) return 'text-negative-400 bg-negative-500/10 border-negative-500/25'
    if (dias <= 3) return 'text-warning-400 bg-warning-500/10 border-warning-500/25'
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
        title="Painel de Pendências"
        subtitle="Tudo que falta resolver em todas as licitações, num lugar só"
        icon={ClipboardList}
      />

      <div className="px-6 mt-4">
        <p className="text-[11px] text-base-500 mb-3">
          Itens ligados a certidões automáticas são conferidos sozinhos (na hora que a certidão é renovada, e também de hora em hora) — se a certidão está válida, o item some daqui sozinho; se está vencendo, o prazo aparece automaticamente.
        </p>
        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando pendências...</div>
        ) : pendenciasOrdenadas.length === 0 ? (
          <Card>
            <EmptyState icon={ClipboardList} title="Nenhuma pendência" description="Todos os itens de checklist das licitações ativas estão atendidos ou já têm documento anexado." />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {pendenciasOrdenadas.map((p) => {
              const dias = diasRestantes(p.prazo)
              return (
                <Card key={p.id} className={`p-3.5 flex items-center gap-3 border ${corFor(dias)}`}>
                  <div className="p-2 rounded-lg bg-base-900/60 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{p.categoria ?? 'Geral'}</span>
                      {p.obrigatorio && <span className="text-[9px] font-bold uppercase tracking-wider text-warning-400">obrigatório</span>}
                    </div>
                    <p className="text-[13px] font-semibold text-base-100 truncate">{p.descricao}</p>
                    <p className="text-[11px] text-base-500 truncate">
                      {p.clientName} — {p.biddingObjeto.slice(0, 60)} ({p.biddingOrgao})
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] font-bold">{labelDias(dias)}</p>
                    {p.responsavelNome && (
                      <p className="text-[10px] text-base-500 flex items-center justify-end gap-1 mt-0.5">
                        <User className="w-3 h-3" /> {p.responsavelNome}
                      </p>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
