import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, FileSpreadsheet, Ban, CheckCircle2, Repeat, Power, Eye, EyeOff } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { EmptyState, StatusBadge } from '../ui/Primitives'
import { formatBRL } from '../../hooks/useAccountBalances'
import { useEmpenhos } from '../../hooks/useEmpenhos'
import { useClients } from '../../hooks/useClients'
import { useBiddings } from '../../hooks/useBiddings'
import EmpenhoFormModal from './EmpenhoFormModal'
import DeleteWithPasswordDialog from '../ui/DeleteWithPasswordDialog'
import ErrorAlert from '../ui/ErrorAlert'
import type { Empenho } from '../../types/domain'

const MODO_LABELS: Record<string, string> = {
  integral: 'Integral',
  quantidade_fixa: 'Parcelado',
  recorrente: 'Recorrente',
}

export default function EmpenhosTab() {
  const {
    empenhos, isLoading, addEmpenho, updateEmpenho, updateEmpenhoStatus, deleteEmpenho,
    toggleEmpenhoActive, checkEmpenhoHasFinancialHistory,
  } = useEmpenhos()
  const { clients } = useClients()
  const { biddings } = useBiddings()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Empenho | null>(null)
  const [deleting, setDeleting] = useState<Empenho | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [financialWarning, setFinancialWarning] = useState<string | undefined>()

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'
  const biddingName = (id: string | null) => biddings.find((b) => b.id === id)?.objeto ?? '—'

  useEffect(() => {
    if (!deleting) {
      setFinancialWarning(undefined)
      return
    }
    checkEmpenhoHasFinancialHistory(deleting.id).then((hasHistory) => {
      setFinancialWarning(
        hasHistory
          ? 'Este empenho possui parcelas de comissão já pagas — todo esse histórico será perdido junto.'
          : undefined
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleting?.id])

  const visibleEmpenhos = useMemo(
    () => empenhos.filter((e) => showInactive || e.isActive),
    [empenhos, showInactive]
  )

  const handleSave = (data: Partial<Empenho>) => {
    if (editing) {
      updateEmpenho.mutate({ ...editing, ...data } as Empenho, { onSuccess: () => { setModalOpen(false); setEditing(null) } })
    } else {
      addEmpenho.mutate(data, { onSuccess: () => setModalOpen(false) })
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-base-100">Gestão de Empenhos</h2>
          <p className="text-base-400 text-[13px]">
            Cada empenho é vinculado a uma licitação ganha e gera automaticamente as parcelas de comissão.
            Para dar baixa no recebimento de uma parcela, acesse a aba <strong className="text-base-300">Contas & Lançamentos</strong>.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true) }} disabled={clients.length === 0}>
          <Plus className="w-4 h-4" /> Novo Empenho
        </Button>
      </div>

      <div className="flex justify-end mb-2">
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`text-[12px] font-semibold flex items-center gap-1.5 transition ${showInactive ? 'text-accent-300' : 'text-base-500 hover:text-base-300'}`}
        >
          {showInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {showInactive ? 'Mostrando inativos' : 'Mostrar inativos'}
        </button>
      </div>

      <ErrorAlert error={deleteEmpenho.error || updateEmpenhoStatus.error || toggleEmpenhoActive.error} />

      <div className="bg-base-900/60 border border-base-700/50 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando empenhos...</div>
        ) : visibleEmpenhos.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title="Nenhum empenho registrado" description="Registre o primeiro empenho vinculado a uma licitação ganha para gerar comissões automaticamente." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-800 text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Nº Empenho</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Licitação</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Valor Empenhado</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 bg-base-850/40">Comissão</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Parcelamento</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmpenhos.map((e) => (
                  <tr key={e.id} className={`border-b border-base-800/60 hover:bg-base-850/40 transition ${!e.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-semibold text-base-100">
                      <span className="flex items-center gap-2">
                        {e.numeroEmpenho}
                        {!e.isActive && <span className="px-1.5 py-0.5 rounded bg-base-700 text-base-400 text-[10px] font-bold">Inativo</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-base-400 text-[12px] max-w-[180px] truncate">{biddingName(e.biddingId)}</td>
                    <td className="px-4 py-3 text-base-300 text-[13px]">{clientName(e.clientId)}</td>
                    <td className="px-4 py-3 font-mono text-base-300 text-[13px]">{formatBRL(e.valorEmpenhada)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-accent-300 text-[13px] bg-base-850/25">
                      {formatBRL(e.valorComissaoTotal)} <span className="text-base-500 text-[11px]">({e.percentualComissao}%)</span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-base-400">
                      <span className="flex items-center gap-1">
                        {e.modoParcelamento === 'recorrente' && <Repeat className="w-3 h-3 text-accent-400" />}
                        {MODO_LABELS[e.modoParcelamento]}
                        {(e.modoParcelamento === 'quantidade_fixa' || e.modoParcelamento === 'recorrente') && ` (${e.quantidadeParcelas}x`}
                        {e.modoParcelamento === 'recorrente' && ` · ${e.periodicidade}`}
                        {(e.modoParcelamento === 'quantidade_fixa' || e.modoParcelamento === 'recorrente') && ')'}
                      </span>
                    </td>
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
                        <button
                          onClick={() => toggleEmpenhoActive.mutate({ empenho: e, isActive: !e.isActive })}
                          title={e.isActive ? 'Inativar empenho (preserva histórico)' : 'Reativar empenho'}
                          className={`p-1.5 rounded transition hover:bg-base-800 ${e.isActive ? 'text-base-400 hover:text-warning-400' : 'text-positive-400 hover:text-positive-300'}`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setEditing(e); setModalOpen(true) }} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
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
        isSaving={addEmpenho.isPending || updateEmpenho.isPending}
        error={addEmpenho.error || updateEmpenho.error}
      />

      <DeleteWithPasswordDialog
        open={!!deleting}
        title="Excluir Empenho Definitivamente"
        entityLabel={`O empenho "${deleting?.numeroEmpenho}"`}
        financialWarning={financialWarning}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteEmpenho.mutate(deleting, { onSuccess: () => setDeleting(null) }) }}
        isLoading={deleteEmpenho.isPending}
        error={deleteEmpenho.error}
      />
    </div>
  )
}
