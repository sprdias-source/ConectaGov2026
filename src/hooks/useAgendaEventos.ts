import { useMemo } from 'react'
import { useBiddings } from './useBiddings'
import { useClients } from './useClients'
import { usePendenciasChecklist } from './useBiddingChecklist'
import { useTransactions } from './useTransactions'
import { formatBRL } from './useAccountBalances'

export type TipoEventoAgenda = 'pregao' | 'checklist' | 'financeiro'

export interface EventoAgenda {
  tipo: TipoEventoAgenda
  data: string
  titulo: string
  subtitulo: string
}

// Junta os 3 tipos de evento (pregões em andamento, prazos de checklist,
// contas a pagar/receber) numa lista só, indexada por data (YYYY-MM-DD) —
// extraído de AgendaPage.tsx pra ser reaproveitado também em HojePage.tsx,
// sem duplicar a lógica de cruzamento.
export function useAgendaEventos() {
  const { biddings, isLoading: loadingBiddings } = useBiddings()
  const { clients } = useClients()
  const { pendencias, isLoading: loadingPendencias } = usePendenciasChecklist()
  const { transactions, isLoading: loadingTransactions } = useTransactions()

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '—'

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, EventoAgenda[]>()
    const add = (data: string | null, evento: EventoAgenda) => {
      if (!data) return
      const lista = mapa.get(data) ?? []
      lista.push(evento)
      mapa.set(data, lista)
    }

    for (const b of biddings) {
      if (!b.isActive || b.status !== 'Em Andamento') continue
      add(b.dataAbertura, {
        tipo: 'pregao',
        data: b.dataAbertura,
        titulo: b.objeto,
        subtitulo: `${clientName(b.clientId)} — ${b.orgao}`,
      })
    }

    for (const p of pendencias) {
      if (!p.prazo) continue
      add(p.prazo, {
        tipo: 'checklist',
        data: p.prazo,
        titulo: p.descricao,
        subtitulo: `${p.clientName} — ${p.biddingObjeto.slice(0, 40)}`,
      })
    }

    for (const t of transactions) {
      if (t.status === 'Pago') continue
      add(t.dueDate, {
        tipo: 'financeiro',
        data: t.dueDate,
        titulo: t.description,
        subtitulo: `${t.type === 'Pagar' ? 'A pagar' : 'A receber'} — ${formatBRL(t.value)}`,
      })
    }

    return mapa
  }, [biddings, pendencias, transactions, clients])

  return {
    eventosPorDia,
    isLoading: loadingBiddings || loadingPendencias || loadingTransactions,
  }
}
