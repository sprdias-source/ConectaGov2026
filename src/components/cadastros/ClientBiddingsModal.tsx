import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Gavel } from 'lucide-react'
import Modal from '../ui/Modal'
import { Card, EmptyState } from '../ui/Primitives'
import SeloHabilitacao from '../ui/SeloHabilitacao'
import EditaisAnaliseSection from './EditaisAnaliseSection'
import { useBiddings } from '../../hooks/useBiddings'
import { formatBRL } from '../../hooks/useAccountBalances'
import type { Client } from '../../types/domain'

export default function ClientBiddingsModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const { biddings, isLoading } = useBiddings()

  const biddingsDoCliente = useMemo(
    () => biddings.filter((b) => b.clientId === client.id).sort((a, b) => b.dataAbertura.localeCompare(a.dataAbertura)),
    [biddings, client.id]
  )

  const resumo = useMemo(() => {
    const ganhou = biddingsDoCliente.filter((b) => b.status === 'Ganhou').length
    const perdeu = biddingsDoCliente.filter((b) => b.status === 'Perdeu').length
    const andamento = biddingsDoCliente.filter((b) => b.status === 'Em Andamento').length
    // Cancelada não entra no denominador — não representa uma disputa
    // finalizada, então distorceria a taxa de êxito real do cliente.
    const finalizadas = ganhou + perdeu
    const taxaExito = finalizadas > 0 ? Math.round((ganhou / finalizadas) * 100) : null
    return { total: biddingsDoCliente.length, ganhou, perdeu, andamento, taxaExito }
  }, [biddingsDoCliente])

  return (
    <Modal open onClose={onClose} title={`Licitações — ${client.name}`} maxWidth="max-w-3xl">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Total</p>
          <p className="text-lg font-extrabold font-mono text-base-100">{resumo.total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Ganhou</p>
          <p className="text-lg font-extrabold font-mono text-positive-400">{resumo.ganhou}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Perdeu</p>
          <p className="text-lg font-extrabold font-mono text-negative-400">{resumo.perdeu}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Em Andamento</p>
          <p className="text-lg font-extrabold font-mono text-accent-400">{resumo.andamento}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Taxa de Êxito</p>
          <p className="text-lg font-extrabold font-mono text-base-100">{resumo.taxaExito !== null ? `${resumo.taxaExito}%` : '—'}</p>
        </Card>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-base-500 text-sm">Carregando licitações...</div>
      ) : biddingsDoCliente.length === 0 ? (
        <EmptyState icon={Gavel} title="Nenhuma licitação para este cliente" description="Quando uma licitação for cadastrada para este cliente, o histórico aparece aqui." />
      ) : (
        <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
          {biddingsDoCliente.map((b) => (
            <Link
              key={b.id}
              to={`/licitacoes/${b.id}`}
              onClick={onClose}
              className="flex items-center justify-between gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5 hover:border-accent-500/40 transition"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-base-100 truncate">{b.objeto}</p>
                <p className="text-[11px] text-base-500 truncate">
                  {b.orgao} · {new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}
                </p>
                <SeloHabilitacao bidding={b} className="block mt-1" />
              </div>
              <span className="font-mono font-semibold text-[13px] text-base-200 shrink-0">{formatBRL(b.valorLicitado)}</span>
            </Link>
          ))}
        </div>
      )}

      <EditaisAnaliseSection client={client} onClose={onClose} />
    </Modal>
  )
}
