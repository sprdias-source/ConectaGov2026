import { useState } from 'react'
import { Plus, Pencil, Trash2, Gavel } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { EmptyState, StatusBadge } from '../ui/Primitives'
import { formatBRL } from '../../hooks/useAccountBalances'
import BiddingFormModal from './BiddingFormModal'
import ConfirmDialog from '../ui/ConfirmDialog'
import { useBiddings } from '../../hooks/useBiddings'
import { useClients } from '../../hooks/useClients'
import type { Bidding } from '../../types/domain'

export default function BiddingsTab() {
  const { biddings, isLoading, addBidding, updateBidding, deleteBidding } = useBiddings()
  const { clients } = useClients()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Bidding | null>(null)
  const [deleting, setDeleting] = useState<Bidding | null>(null)

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'

  const handleSave = (data: Partial<Bidding>) => {
    if (editing) {
      updateBidding.mutate({ ...editing, ...data } as Bidding, { onSuccess: () => { setModalOpen(false); setEditing(null) } })
    } else {
      addBidding.mutate(data, { onSuccess: () => setModalOpen(false) })
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-base-100">Licitações Monitoradas</h2>
          <p className="text-base-400 text-[13px]">Acompanhe o ciclo completo de cada disputa, do edital à homologação.</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true) }} disabled={clients.length === 0}>
          <Plus className="w-4 h-4" /> Nova Licitação
        </Button>
      </div>

      {clients.length === 0 && (
        <div className="bg-warning-500/10 border border-warning-500/25 rounded-lg p-3 mb-4 text-[13px] text-warning-300">
          Cadastre ao menos um cliente antes de registrar uma licitação.
        </div>
      )}

      <div className="bg-base-900/60 border border-base-700/50 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando licitações...</div>
        ) : biddings.length === 0 ? (
          <EmptyState icon={Gavel} title="Nenhuma licitação cadastrada" description="Registre sua primeira licitação para começar a acompanhar o funil." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-800 text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Objeto / Órgão</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Modalidade</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Valor</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {biddings.map((b) => (
                  <tr key={b.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                    <td className="px-4 py-3 max-w-[280px]">
                      <div className="font-semibold text-base-100 truncate">{b.objeto}</div>
                      <div className="text-base-500 text-[12px] truncate">{b.orgao}</div>
                    </td>
                    <td className="px-4 py-3 text-base-300 text-[13px]">{clientName(b.clientId)}</td>
                    <td className="px-4 py-3 text-base-400 text-[12px]">{b.modalidade}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-base-200 text-[13px]">{formatBRL(b.valorLicitado)}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(b); setModalOpen(true) }} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleting(b)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BiddingFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        initial={editing}
        clients={clients}
        isSaving={addBidding.isPending || updateBidding.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir licitação?"
        description={`Isso vai remover a licitação "${deleting?.objeto}" e os empenhos/lançamentos pendentes vinculados a ela.`}
        confirmLabel="Excluir definitivamente"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteBidding.mutate(deleting, { onSuccess: () => setDeleting(null) }) }}
        isLoading={deleteBidding.isPending}
      />
    </div>
  )
}
