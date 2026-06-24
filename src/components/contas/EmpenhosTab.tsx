import { useState } from 'react'
import { Plus, Trash2, FileSpreadsheet, Ban, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { EmptyState, StatusBadge } from '../ui/Primitives'
import { formatBRL } from '../../hooks/useAccountBalances'
import { useEmpenhos } from '../../hooks/useEmpenhos'
import { useClients } from '../../hooks/useClients'
import { useBiddings } from '../../hooks/useBiddings'
import EmpenhoFormModal from './EmpenhoFormModal'
import ConfirmDialog from '../ui/ConfirmDialog'
import type { Empenho } from '../../types/domain'

export default function EmpenhosTab() {
  const { empenhos, isLoading, addEmpenho, updateEmpenhoStatus, deleteEmpenho } = useEmpenhos()
  const { clients } = useClients()
  const { biddings } = useBiddings()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Empenho | null>(null)
  const [deleting, setDeleting] = useState<Empenho | null>(null)

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'

  const handleSave = (data: Partial<Empenho>) => {
    addEmpenho.mutate(data, { onSuccess: () => setModalOpen(false) })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-base-100">Gestão de Empenhos</h2>
          <p className="text-base-400 text-[13px]">Cada empenho gera automaticamente as parcelas de comissão a receber.</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true) }} disabled={clients.length === 0}>
          <Plus className="w-4 h-4" /> Novo Empenho
        </Button>
      </div>

      <div className="bg-base-900/60 border border-base-700/50 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando empenhos...</div>
        ) : empenhos.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title="Nenhum empenho registrado" description="Registre o primeiro empenho para gerar comissões automaticamente." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-800 text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Nº Empenho</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Valor Empenhado</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Comissão</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Projeção</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {empenhos.map((e) => (
                  <tr key={e.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                    <td className="px-4 py-3 font-semibold text-base-100">{e.numeroEmpenho}</td>
                    <td className="px-4 py-3 text-base-300 text-[13px]">{clientName(e.clientId)}</td>
                    <td className="px-4 py-3 font-mono text-base-300 text-[13px]">{formatBRL(e.valorEmpenhada)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-accent-300 text-[13px]">
                      {formatBRL(e.valorComissaoTotal)} <span className="text-base-500 text-[11px]">({e.percentualComissao}%)</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-base-400">{e.projetarDozeMeses ? '12 parcelas' : 'Integral'}</td>
                    <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {e.status === 'Pendente' && (
                          <button
                            onClick={() => updateEmpenhoStatus.mutate({ empenho: e, newStatus: 'Faturado' })}
                            title="Marcar como faturado"
                            className="p-1.5 text-base-400 hover:text-positive-400 hover:bg-base-800 rounded transition"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {e.status !== 'Cancelado' && (
                          <button
                            onClick={() => updateEmpenhoStatus.mutate({ empenho: e, newStatus: 'Cancelado' })}
                            title="Cancelar empenho"
                            className="p-1.5 text-base-400 hover:text-warning-400 hover:bg-base-800 rounded transition"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => setDeleting(e)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
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

      <EmpenhoFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        initial={editing}
        clients={clients}
        biddings={biddings}
        isSaving={addEmpenho.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Excluir empenho?"
        description={`Isso vai remover o empenho "${deleting?.numeroEmpenho}" e suas parcelas de comissão ainda não pagas.`}
        confirmLabel="Excluir definitivamente"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteEmpenho.mutate(deleting, { onSuccess: () => setDeleting(null) }) }}
        isLoading={deleteEmpenho.isPending}
      />
    </div>
  )
}
