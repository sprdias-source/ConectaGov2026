import { useMemo } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Card, EmptyState } from '../ui/Primitives'
import TopScrollTable from '../ui/TopScrollTable'
import { formatBRL } from '../../hooks/useAccountBalances'
import { useContractMarcosPorContratos } from '../../hooks/useContractMarcos'
import { calcContratoStatus } from '../../hooks/useContracts'
import { todayLocalISO } from '../../lib/dateUtils'
import type { Client, Contract, ContractMarco, Bidding } from '../../types/domain'

// Mesmo cálculo de ExecucaoContratosPage.tsx (ContratoCard/statusReal) — só
// 'Concluído' é gravado pelo usuário, 'Atrasado' é sempre derivado da data
// prevista vs. hoje, nunca lido de um campo parado no tempo.
function statusRealMarco(m: ContractMarco, hoje: string): 'Pendente' | 'Concluído' | 'Atrasado' {
  if (m.status === 'Concluído') return 'Concluído'
  if (m.dataPrevista && m.dataPrevista < hoje) return 'Atrasado'
  return 'Pendente'
}

const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  vencendo: 'Vencendo',
  vencido: 'Vencido',
  rescindido: 'Rescindido',
  sem_vigencia: 'Sem vigência',
  licitacao: 'Vinculado à licitação',
}

const STATUS_COR: Record<string, string> = {
  ativo: 'text-positive-400',
  vencendo: 'text-warning-400',
  vencido: 'text-negative-400',
  rescindido: 'text-base-500',
  sem_vigencia: 'text-base-500',
  licitacao: 'text-accent-400',
}

// Esse relatório existe pra achado da simulação de processos: marcos e
// status de Execução de Contrato (ativo/vencendo/vencido/rescindido) não
// apareciam em nenhum relatório — ficavam isolados só na própria tela
// (ExecucaoContratosPage.tsx). Reúne o panorama (contagem por status de
// contrato + contagem de marcos por status) e a lista por contrato, sem
// duplicar a tela de execução (sem edição aqui, só leitura consolidada).
export default function RelatorioContratos({ clients, contracts, biddings }: { clients: Client[]; contracts: Contract[]; biddings: Bidding[] }) {
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '—'
  const biddingById = useMemo(() => new Map(biddings.map((b) => [b.id, b])), [biddings])

  const contractIds = useMemo(() => contracts.map((c) => c.id), [contracts])
  const { marcosPorContrato } = useContractMarcosPorContratos(contractIds)

  const hoje = todayLocalISO()

  const statusPorContrato = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const c of contracts) {
      const bidding = c.biddingId ? biddingById.get(c.biddingId) ?? null : null
      mapa.set(c.id, calcContratoStatus(c, bidding).tipo)
    }
    return mapa
  }, [contracts, biddingById])

  const statsContratos = useMemo(() => {
    const porStatus: Record<string, number> = {}
    for (const tipo of statusPorContrato.values()) {
      porStatus[tipo] = (porStatus[tipo] ?? 0) + 1
    }
    return porStatus
  }, [statusPorContrato])

  const statsMarcos = useMemo(() => {
    let pendente = 0, atrasado = 0, concluido = 0
    let valorPendente = 0, valorAtrasado = 0
    for (const marcos of marcosPorContrato.values()) {
      for (const m of marcos) {
        const s = statusRealMarco(m, hoje)
        if (s === 'Pendente') { pendente++; valorPendente += m.valor ?? 0 }
        else if (s === 'Atrasado') { atrasado++; valorAtrasado += m.valor ?? 0 }
        else concluido++
      }
    }
    return { pendente, atrasado, concluido, valorPendente, valorAtrasado }
  }, [marcosPorContrato, hoje])

  if (contracts.length === 0) {
    return (
      <Card className="screen-only">
        <EmptyState icon={ClipboardCheck} title="Nenhum contrato cadastrado" description="Gere contratos em Clientes/Licitações para acompanhar a execução aqui." />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 screen-only">
        {(['ativo', 'vencendo', 'vencido', 'rescindido', 'licitacao'] as const).map((tipo) => (
          <Card key={tipo} className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">{STATUS_LABEL[tipo]}</p>
            <p className={`text-lg font-extrabold ${STATUS_COR[tipo]}`}>{(statsContratos[tipo] ?? 0) + (tipo === 'ativo' ? (statsContratos['sem_vigencia'] ?? 0) : 0)}</p>
          </Card>
        ))}
      </div>

      <div>
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-base-500 mb-2 screen-only">Marcos de Execução (todos os contratos)</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 screen-only">
          <Card className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Concluídos</p>
            <p className="text-lg font-extrabold text-positive-400">{statsMarcos.concluido}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Pendentes</p>
            <p className="text-lg font-extrabold text-accent-400">{statsMarcos.pendente}<span className="text-[11px] text-base-500 font-normal ml-1.5">{formatBRL(statsMarcos.valorPendente)}</span></p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Atrasados</p>
            <p className="text-lg font-extrabold text-negative-400">{statsMarcos.atrasado}<span className="text-[11px] text-base-500 font-normal ml-1.5">{formatBRL(statsMarcos.valorAtrasado)}</span></p>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden screen-only">
        <TopScrollTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-800 text-left">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Tipo</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Marcos Concluídos</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Marcos Atrasados</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const marcos = marcosPorContrato.get(c.id) ?? []
                const concluidos = marcos.filter((m) => statusRealMarco(m, hoje) === 'Concluído').length
                const atrasados = marcos.filter((m) => statusRealMarco(m, hoje) === 'Atrasado').length
                const tipoStatus = statusPorContrato.get(c.id) ?? 'sem_vigencia'
                return (
                  <tr key={c.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                    <td className="px-4 py-2.5 font-semibold text-base-200 text-[12px]">{clientName(c.clientId)}</td>
                    <td className="px-4 py-2.5 text-base-400 text-[12px] capitalize">{c.tipo}</td>
                    <td className={`px-4 py-2.5 text-[12px] font-bold ${STATUS_COR[tipoStatus]}`}>{STATUS_LABEL[tipoStatus]}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] text-positive-400">{marcos.length > 0 ? `${concluidos}/${marcos.length}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] bg-base-850/25 text-negative-400">{atrasados > 0 ? atrasados : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TopScrollTable>
      </Card>
    </div>
  )
}
