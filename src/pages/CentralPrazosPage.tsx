import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, ChevronRight, Gavel, Globe, ShieldAlert, Wallet, Send } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { SkeletonList } from '../components/ui/Skeleton'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { useTransactions } from '../hooks/useTransactions'
import { useAllBiddingChecklistItems } from '../hooks/useBiddingChecklist'
import { useAllClientDocuments, calcDocStatus, diasRestantes } from '../hooks/useClientDocuments'
import { useAllClientPlatforms, calcPlatformStatus, diasParaVencer } from '../hooks/useClientPlatforms'
import { usePlatforms } from '../hooks/usePlatforms'
import { useOpportunities, calcOpportunityStatus, diasParaSessao } from '../hooks/useOpportunities'
import { formatBRL } from '../hooks/useAccountBalances'
import { CERT_CONFIG } from '../types/domain'
import { todayLocalISO } from '../lib/dateUtils'

type ItemPrazo = {
  key: string
  tipo: 'Pregão' | 'Certidão' | 'Financeiro' | 'Plataforma' | 'Oportunidade'
  titulo: string
  subtitulo: string
  data: string
  dias: number
  valor?: number
  // Rota que leva direto pra tela onde esse prazo pode ser resolvido —
  // cada tipo aponta pra um lugar diferente (ver comentários no useMemo
  // abaixo).
  link: string
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
  const { clientPlatforms, isLoading: loadingPlatforms } = useAllClientPlatforms()
  const { platforms } = usePlatforms()
  const { opportunities, isLoading: loadingOpportunities } = useOpportunities()

  const clientName = (id: string | null) => id ? (clients.find((c) => c.id === id)?.name ?? 'Cliente removido') : 'Sem cliente definido'

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
        link: `/licitacoes/${b.id}`,
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
          // Vinculada a uma sessão: o lugar certo pra resolver é o
          // checklist DAQUELA licitação, não o repositório genérico do
          // cliente — é lá que o vínculo é cobrado.
          link: `/licitacoes/${biddingVinculada.id}?aba=checklist`,
        })
        continue
      }

      // Recalcula pela data de validade em vez de confiar na coluna
      // `status` gravada no banco — ela só é escrita no momento do
      // upload/upsert e nunca é atualizada depois, então uma certidão
      // avulsa (sem sessão vinculada) salva como "válido" meses atrás
      // nunca aparecia aqui de novo, mesmo já tendo vencido de verdade.
      const statusAtual = calcDocStatus(doc.dataValidade)
      if (statusAtual !== 'vencendo' && statusAtual !== 'vencido') continue
      lista.push({
        key: `doc-${doc.id}`,
        tipo: 'Certidão',
        titulo: label,
        subtitulo: clientName(doc.clientId),
        data: doc.dataValidade ?? hoje,
        dias: diasRestantes(doc.dataValidade) ?? 0,
        // Sem sessão vinculada: o lugar certo é o repositório do cliente
        // em Cadastros, já com o cliente selecionado.
        link: `/cadastros?tab=documentos&clientId=${doc.clientId}`,
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
      const vencimento = new Date(t.dueDate + 'T12:00:00')
      lista.push({
        key: `tx-${t.id}`,
        tipo: 'Financeiro',
        titulo: t.description,
        subtitulo: `${t.type === 'Pagar' ? 'A pagar' : 'A receber'} — ${t.category}${t.clientId ? ` — ${clientName(t.clientId)}` : ''}`,
        data: t.dueDate,
        dias,
        valor: t.value,
        // Leva pro mês do vencimento (senão o lançamento fica invisível,
        // já que a tela só mostra o mês atual por padrão) e destaca a
        // linha certa.
        link: `/contas?mes=${vencimento.getMonth()}&ano=${vencimento.getFullYear()}&highlight=${t.id}`,
      })
    }

    // Plataformas (assinaturas ativas) vencendo ou já vencidas — mesma
    // régua de calcDocStatus, mas com a antecedência de aviso vindo do
    // próprio registro (dias_aviso_vencimento), não de um valor fixo.
    for (const cp of clientPlatforms) {
      const status = calcPlatformStatus(cp.dataVencimento, cp.diasAvisoVencimento)
      if (status !== 'vencendo' && status !== 'vencida') continue
      lista.push({
        key: `platform-${cp.id}`,
        tipo: 'Plataforma',
        titulo: platforms.find((p) => p.id === cp.platformId)?.nome ?? 'Plataforma removida',
        subtitulo: clientName(cp.clientId),
        data: cp.dataVencimento ?? hoje,
        dias: diasParaVencer(cp.dataVencimento) ?? 0,
        valor: cp.tipo === 'paga' ? cp.valorMensalidade ?? undefined : undefined,
        link: `/cadastros?tab=plataformas&clientId=${cp.clientId}`,
      })
    }

    // Oportunidades (editais enviados pro cliente avaliar, antes de virar
    // licitação de verdade) urgentes ou vencidas — mesma régua de
    // calcOpportunityStatus/diasParaSessao usada na aba Oportunidades, com a
    // antecedência de aviso vindo do próprio registro (dias_aviso_prazo).
    for (const o of opportunities) {
      const status = calcOpportunityStatus(o)
      if (status !== 'urgente' && status !== 'vencida') continue
      lista.push({
        key: `opportunity-${o.id}`,
        tipo: 'Oportunidade',
        titulo: o.titulo,
        subtitulo: `${clientName(o.clientId)} — aguardando resposta`,
        data: o.dataSessao ?? hoje,
        dias: diasParaSessao(o.dataSessao) ?? 0,
        link: `/cadastros?tab=oportunidades`,
      })
    }

    return lista.sort((a, b) => a.dias - b.dias)
  }, [biddings, documents, allChecklistItems, transactions, clients, clientPlatforms, platforms, opportunities])

  const isLoading = loadingBiddings || loadingTransactions || loadingDocuments || loadingChecklist || loadingPlatforms || loadingOpportunities

  const iconFor = (tipo: ItemPrazo['tipo']) => {
    if (tipo === 'Pregão') return Gavel
    if (tipo === 'Certidão') return ShieldAlert
    if (tipo === 'Plataforma') return Globe
    if (tipo === 'Oportunidade') return Send
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
          <SkeletonList itens={5} />
        ) : itens.length === 0 ? (
          <Card>
            <EmptyState icon={AlarmClock} title="Nenhum prazo urgente" description="Nada vencendo nos próximos 15 dias, nem certidões críticas. Tudo em dia." />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {itens.map((item) => {
              const Icon = iconFor(item.tipo)
              return (
                <Link key={item.key} to={item.link} className="block">
                  <Card className={`p-3.5 flex items-center gap-3 border transition hover:brightness-125 cursor-pointer ${corFor(item.dias)}`}>
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
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="text-[12px] font-bold">{labelDias(item.dias)}</p>
                        <p className="text-[10px] text-base-500">
                          {new Date(item.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                          {item.valor !== undefined && ` — ${formatBRL(item.valor)}`}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-40" />
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
