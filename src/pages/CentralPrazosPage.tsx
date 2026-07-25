import { useMemo } from 'react'
import { AlarmClock, Gavel, ShieldAlert, Wallet } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { useTransactions } from '../hooks/useTransactions'
import { useAllBiddingChecklistItems } from '../hooks/useBiddingChecklist'
import { useAllClientDocuments, calcDocStatus, diasRestantes } from '../hooks/useClientDocuments'
import { formatBRL } from '../hooks/useAccountBalances'
import { CERT_CONFIG } from '../types/domain'
import { todayLocalISO } from '../lib/dateUtils'

type ItemPrazo = {
  key: string
  tipo: 'Pregão' | 'Certidão' | 'Financeiro'
  titulo: string
  subtitulo: string
  data: string
  dias: number
  valor?: number
}

// Janela de antecedência pra considerar um pregão "próximo" — mesma lógica
// de urgência usada nas certidões (15 dias), pra manter consistência.
const JANELA_PREGOES_DIAS = 15

export default function CentralPrazosPage() {
  const { biddings, isLoading: loadingBiddings } = useBiddings()
  const { clients } = useClients()
  const { transactions, isLoading: loadingTransactions } = useTransactions()
  const { documents, isLoading: loadingDocuments } = useAllClientDocuments()
  const { items: allChecklistItems, isLoading: loadingChecklist } = useAllBiddingChecklistItems()

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'

  const itens = useMemo(() => {
    const hoje = todayLocalISO()
    const lista: ItemPrazo[] = []

    // Pregões em andamento com data de abertura próxima
    for (const b of biddings) {
      if (!b.isActive || b.status !== 'Em Andamento') continue
      const dias = Math.floor(
        (new Date(b.dataAbertura + 'T00:00:00').getTime() - new Date(hoje + 'T00:00:00').getTime())
        / (1000 * 60 * 60 * 24)
      )
      if (dias > JANELA_PREGOES_DIAS) continue
      lista.push({
        key: `bidding-${b.id}`,
        tipo: 'Pregão',
        titulo: b.objeto,
        subtitulo: `${clientName(b.clientId)} — ${b.orgao}`,
        data: b.dataAbertura,
        dias,
      })
    }

    // Certidões vencendo ou já vencidas — mas se a certidão está vinculada
    // (via checklist) a uma licitação ativa com sessão marcada, o prazo que
    // importa de verdade é a DATA DA SESSÃO, não o padrão genérico de 15
    // dias: de nada adianta a certidão "ainda não estar vencendo" se ela
    // expira antes da disputa acontecer.
    for (const doc of documents) {
      const label = doc.tipo === 'manual' ? doc.nome : CERT_CONFIG[doc.tipo]?.label ?? doc.nome

      const biddingVinculada = doc.tipo !== 'manual'
        ? biddings.find((b) =>
            b.isActive && b.status === 'Em Andamento' && b.clientId === doc.clientId && b.dataAbertura >= hoje &&
            allChecklistItems.some((i) => i.biddingId === b.id && i.clientDocumentTipo === doc.tipo)
          )
        : undefined

      if (biddingVinculada) {
        const diasAteSessao = Math.floor(
          (new Date(biddingVinculada.dataAbertura + 'T00:00:00').getTime() - new Date(hoje + 'T00:00:00').getTime())
          / (1000 * 60 * 60 * 24)
        )
        const statusVsSessao = calcDocStatus(doc.dataValidade, diasAteSessao)
        if (statusVsSessao !== 'vencendo' && statusVsSessao !== 'vencido') continue
        const venceAntesDaSessao = !!doc.dataValidade && doc.dataValidade < biddingVinculada.dataAbertura
        lista.push({
          key: `doc-${doc.id}`,
          tipo: 'Certidão',
          titulo: label,
          subtitulo: venceAntesDaSessao
            ? `${clientName(doc.clientId)} — vence antes da sessão de "${biddingVinculada.objeto.slice(0, 40)}"`
            : `${clientName(doc.clientId)} — vinculada à sessão de "${biddingVinculada.objeto.slice(0, 40)}"`,
          data: doc.dataValidade ?? hoje,
          dias: diasRestantes(doc.dataValidade) ?? 0,
        })
        continue
      }

      if (doc.status !== 'vencendo' && doc.status !== 'vencido') continue
      lista.push({
        key: `doc-${doc.id}`,
        tipo: 'Certidão',
        titulo: label,
        subtitulo: clientName(doc.clientId),
        data: doc.dataValidade ?? hoje,
        dias: diasRestantes(doc.dataValidade) ?? 0,
      })
    }

    // Contas a pagar/receber vencidas, vencendo hoje, ou nos próximos 15 dias
    for (const t of transactions) {
      if (t.status === 'Pago') continue
      const dias = Math.floor(
        (new Date(t.dueDate + 'T00:00:00').getTime() - new Date(hoje + 'T00:00:00').getTime())
        / (1000 * 60 * 60 * 24)
      )
      if (dias > JANELA_PREGOES_DIAS) continue
      lista.push({
        key: `tx-${t.id}`,
        tipo: 'Financeiro',
        titulo: t.description,
        subtitulo: `${t.type === 'Pagar' ? 'A pagar' : 'A receber'} — ${t.category}${t.clientId ? ` — ${clientName(t.clientId)}` : ''}`,
        data: t.dueDate,
        dias,
        valor: t.value,
      })
    }

    return lista.sort((a, b) => a.dias - b.dias)
  }, [biddings, documents, allChecklistItems, transactions, clients])

  const isLoading = loadingBiddings || loadingTransactions || loadingDocuments || loadingChecklist

  const iconFor = (tipo: ItemPrazo['tipo']) => {
    if (tipo === 'Pregão') return Gavel
    if (tipo === 'Certidão') return ShieldAlert
    return Wallet
  }

  const corFor = (dias: number) => {
    if (dias < 0) return 'text-negative-400 bg-negative-500/10 border-negative-500/25'
    if (dias <= 3) return 'text-warning-400 bg-warning-500/10 border-warning-500/25'
    return 'text-base-300 bg-base-850/60 border-base-700/50'
  }

  const labelDias = (dias: number) => {
    if (dias < 0) return `Vencido há ${Math.abs(dias)} dia(s)`
    if (dias === 0) return 'Vence hoje'
    if (dias === 1) return 'Vence amanhã'
    return `Vence em ${dias} dias`
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Central de Prazos"
        subtitle="Tudo que tem data marcada num só lugar: pregões próximos, certidões e financeiro"
        icon={AlarmClock}
      />

      <div className="px-6 mt-4">
        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando prazos...</div>
        ) : itens.length === 0 ? (
          <Card>
            <EmptyState icon={AlarmClock} title="Nenhum prazo urgente" description="Nada vencendo nos próximos 15 dias, nem certidões críticas. Tudo em dia." />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {itens.map((item) => {
              const Icon = iconFor(item.tipo)
              return (
                <Card key={item.key} className={`p-3.5 flex items-center gap-3 border ${corFor(item.dias)}`}>
                  <div className="p-2 rounded-lg bg-base-900/60 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{item.tipo}</span>
                    </div>
                    <p className="text-[13px] font-semibold text-base-100 truncate">{item.titulo}</p>
                    <p className="text-[11px] text-base-500 truncate">{item.subtitulo}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] font-bold">{labelDias(item.dias)}</p>
                    <p className="text-[10px] text-base-500">
                      {new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                      {item.valor !== undefined && ` — ${formatBRL(item.valor)}`}
                    </p>
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
