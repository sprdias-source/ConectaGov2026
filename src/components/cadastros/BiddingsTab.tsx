import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, Gavel, Power, Eye, EyeOff, Lock, FileText, FileCheck2, FileUp, Loader2 } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { EmptyState, StatusBadge } from '../ui/Primitives'
import { formatBRL } from '../../hooks/useAccountBalances'
import { supabase } from '../../lib/supabase'
import BiddingFormModal from './BiddingFormModal'
import DeleteWithPasswordDialog from '../ui/DeleteWithPasswordDialog'
import ErrorAlert from '../ui/ErrorAlert'
import { usePagination, PaginationControls } from '../../hooks/usePagination'
import { useBiddings } from '../../hooks/useBiddings'
import { useClients } from '../../hooks/useClients'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import type { Bidding, BiddingItem } from '../../types/domain'

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const resultado = reader.result as string
      resolve(resultado.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function BiddingsTab() {
  const { biddings, isLoading, addBidding, updateBidding, deleteBidding, toggleBiddingActive, setModeloCustomizado, checkBiddingHasFinancialHistory } = useBiddings()
  const { clients } = useClients()
  const { nivel: nivelAcesso } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivelAcesso === 'edicao'

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Bidding | null>(null)
  const [deleting, setDeleting] = useState<Bidding | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [financialWarning, setFinancialWarning] = useState<string | undefined>()
  const [gerandoPropostaKey, setGerandoPropostaKey] = useState<string | null>(null)
  const [erroGeracao, setErroGeracao] = useState<string | null>(null)
  const [enviandoModeloId, setEnviandoModeloId] = useState<string | null>(null)
  const [erroModelo, setErroModelo] = useState<string | null>(null)

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'
  const isMensalista = (id: string) => clients.find((c) => c.id === id)?.isMensalista ?? false

  useEffect(() => {
    if (!deleting) {
      setFinancialWarning(undefined)
      return
    }
    checkBiddingHasFinancialHistory(deleting.id).then((hasHistory) => {
      setFinancialWarning(
        hasHistory
          ? 'Esta licitação possui empenhos faturados ou comissões já recebidas — todo esse histórico será perdido junto.'
          : undefined
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleting?.id])

  const visibleBiddings = useMemo(
    () => biddings.filter((b) => showInactive || b.isActive),
    [biddings, showInactive]
  )

  const { paginated, page, setPage, totalPages, totalItems, pageSize } = usePagination(visibleBiddings)

  useEffect(() => {
    setPage(1)
  }, [showInactive, setPage])

  const handleSave = (data: Partial<Bidding>, items: Partial<BiddingItem>[]) => {
    if (editing) {
      updateBidding.mutate({ bidding: { ...editing, ...data } as Bidding, items }, { onSuccess: () => { setModalOpen(false); setEditing(null) } })
    } else {
      addBidding.mutate({ bidding: data, items }, { onSuccess: () => setModalOpen(false) })
    }
  }

  const handleGerarProposta = async (b: Bidding, tipo: 'normal' | 'readequada' = 'normal') => {
    const key = `${b.id}:${tipo}`
    setGerandoPropostaKey(key)
    setErroGeracao(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gerar-proposta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clientId: b.clientId, biddingId: b.id, tipo }),
      })
      const resultado = await res.json()
      if (!res.ok || resultado.error) {
        throw new Error(resultado.error || 'Erro desconhecido ao gerar a proposta')
      }

      // Decodifica o base64 e dispara o download no navegador
      const bytes = Uint8Array.from(atob(resultado.fileBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: resultado.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = resultado.fileName || 'proposta.docx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setErroGeracao(`Licitação "${b.objeto.slice(0, 40)}": ${String(err)}`)
    } finally {
      setGerandoPropostaKey(null)
    }
  }

  const chamarUploadModelo = async (biddingId: string, body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession()
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-modelo-licitacao`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ biddingId, ...body }),
    })
    const resultado = await res.json()
    if (!res.ok || resultado.error) {
      throw new Error(resultado.error || 'Erro desconhecido')
    }
    return resultado
  }

  const handleUploadModelo = async (b: Bidding, file: File) => {
    setEnviandoModeloId(b.id)
    setErroModelo(null)
    try {
      const fileBase64 = await fileParaBase64(file)
      const resultado = await chamarUploadModelo(b.id, { action: 'upload', fileBase64 })
      setModeloCustomizado.mutate({ biddingId: b.id, path: resultado.path })
    } catch (err) {
      setErroModelo(`Licitação "${b.objeto.slice(0, 40)}": ${String(err)}`)
    } finally {
      setEnviandoModeloId(null)
    }
  }

  const handleRemoverModelo = async (b: Bidding) => {
    if (!window.confirm('Remover o modelo próprio desta licitação e voltar a usar o modelo padrão?')) return
    setEnviandoModeloId(b.id)
    setErroModelo(null)
    try {
      await chamarUploadModelo(b.id, { action: 'remove' })
      setModeloCustomizado.mutate({ biddingId: b.id, path: null })
    } catch (err) {
      setErroModelo(`Licitação "${b.objeto.slice(0, 40)}": ${String(err)}`)
    } finally {
      setEnviandoModeloId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-bold text-lg text-base-100">Licitações Monitoradas</h2>
          <p className="text-base-400 text-[13px]">Acompanhe o ciclo completo de cada disputa, do edital à homologação.</p>
        </div>
        {podeEditar && (
          <Button onClick={() => { setEditing(null); setModalOpen(true) }} disabled={clients.length === 0}>
            <Plus className="w-4 h-4" /> Nova Licitação
          </Button>
        )}
      </div>

      {podeEditar && clients.length === 0 && (
        <div className="bg-warning-500/10 border border-warning-500/25 rounded-lg p-3 mb-4 text-[13px] text-warning-300">
          Cadastre ao menos um cliente antes de registrar uma licitação.
        </div>
      )}

      <div className="flex justify-between items-center mb-2">
        {!podeEditar ? (
          <span className="text-[12px] font-semibold text-base-500 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Somente visualização
          </span>
        ) : <span />}
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`text-[12px] font-semibold flex items-center gap-1.5 transition ${showInactive ? 'text-accent-300' : 'text-base-500 hover:text-base-300'}`}
        >
          {showInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {showInactive ? 'Mostrando inativas' : 'Mostrar inativas'}
        </button>
      </div>

      <ErrorAlert error={deleteBidding.error || toggleBiddingActive.error} />
      {erroGeracao && (
        <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 mb-4 text-[13px] text-negative-300">
          {erroGeracao}
        </div>
      )}
      {erroModelo && (
        <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 mb-4 text-[13px] text-negative-300">
          {erroModelo}
        </div>
      )}

      <div className="bg-base-900/60 border border-base-700/50 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando licitações...</div>
        ) : visibleBiddings.length === 0 ? (
          <EmptyState icon={Gavel} title="Nenhuma licitação cadastrada" description="Registre sua primeira licitação para começar a acompanhar o funil." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-800 text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Objeto / Órgão</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Modalidade</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Data do Pregão</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Valor Licitado</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 bg-base-850/40">Valor Ofertado</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((b) => {
                  const ganhou = b.status === 'Ganhou'
                  const temModeloProprio = !!b.modeloCustomizadoPath
                  const enviandoEsteModelo = enviandoModeloId === b.id
                  return (
                  <tr key={b.id} className={`border-b border-base-800/60 hover:bg-base-850/40 transition ${!b.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="font-semibold text-base-100 truncate flex items-center gap-2">
                        {b.objeto}
                        {!b.isActive && <span className="px-1.5 py-0.5 rounded bg-base-700 text-base-400 text-[10px] font-bold shrink-0">Inativa</span>}
                      </div>
                      <div className="text-base-500 text-[12px] truncate">{b.orgao}</div>
                    </td>
                    <td className="px-4 py-3 text-base-300 text-[13px]">
                      {clientName(b.clientId)}
                      <span className={`block text-[10px] font-bold mt-0.5 ${isMensalista(b.clientId) ? 'text-accent-400' : 'text-warning-400'}`}>
                        {isMensalista(b.clientId) ? 'Mensalista' : 'Individual'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-base-400 text-[12px]">{b.modalidade}</td>
                    <td className="px-4 py-3 text-base-300 text-[12px] whitespace-nowrap">
                      {new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-base-200 text-[13px]">{formatBRL(b.valorLicitado)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-[13px] bg-base-850/25">
                      {b.valorOfertadoReal ? <span className="text-positive-400">{formatBRL(b.valorOfertadoReal)}</span> : <span className="text-base-500">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleGerarProposta(b, 'normal')}
                          disabled={gerandoPropostaKey === `${b.id}:normal`}
                          title="Gerar Proposta de Preços (.docx)"
                          className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition disabled:opacity-50 disabled:cursor-wait"
                        >
                          {gerandoPropostaKey === `${b.id}:normal` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        </button>
                        {ganhou && (
                          <button
                            onClick={() => handleGerarProposta(b, 'readequada')}
                            disabled={gerandoPropostaKey === `${b.id}:readequada`}
                            title="Gerar Proposta Readequada (.docx)"
                            className="p-1.5 text-base-400 hover:text-positive-400 hover:bg-base-800 rounded transition disabled:opacity-50 disabled:cursor-wait"
                          >
                            {gerandoPropostaKey === `${b.id}:readequada` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck2 className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {podeEditar && (
                          temModeloProprio ? (
                            <button
                              onClick={() => handleRemoverModelo(b)}
                              disabled={enviandoEsteModelo}
                              title="Modelo próprio enviado — clique para remover e voltar ao padrão"
                              className="p-1.5 text-accent-300 hover:text-negative-400 hover:bg-base-800 rounded transition disabled:opacity-50 disabled:cursor-wait"
                            >
                              {enviandoEsteModelo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <label
                              title="Enviar modelo próprio (.docx) desta prefeitura"
                              className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition cursor-pointer inline-flex disabled:opacity-50"
                            >
                              {enviandoEsteModelo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                              <input
                                type="file"
                                accept=".docx"
                                className="hidden"
                                disabled={enviandoEsteModelo}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) handleUploadModelo(b, file)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                          )
                        )}
                        {podeEditar && (
                          <>
                            <button
                              onClick={() => toggleBiddingActive.mutate({ bidding: b, isActive: !b.isActive })}
                              title={b.isActive ? 'Inativar licitação (preserva histórico)' : 'Reativar licitação'}
                              className={`p-1.5 rounded transition hover:bg-base-800 ${b.isActive ? 'text-base-400 hover:text-warning-400' : 'text-positive-400 hover:text-positive-300'}`}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { setEditing(b); setModalOpen(true) }} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleting(b)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <PaginationControls page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
      </div>

      {podeEditar && (
        <>
          <BiddingFormModal
            open={modalOpen}
            onClose={() => { setModalOpen(false); setEditing(null) }}
            onSave={handleSave}
            initial={editing}
            clients={clients}
            clientIsMensalista={isMensalista}
            isSaving={addBidding.isPending || updateBidding.isPending}
            error={addBidding.error || updateBidding.error}
          />

          <DeleteWithPasswordDialog
            open={!!deleting}
            title="Excluir Licitação Definitivamente"
            entityLabel={`A licitação "${deleting?.objeto}" e todos os empenhos vinculados a ela`}
            financialWarning={financialWarning}
            onCancel={() => setDeleting(null)}
            onConfirm={() => { if (deleting) deleteBidding.mutate(deleting, { onSuccess: () => setDeleting(null) }) }}
            isLoading={deleteBidding.isPending}
            error={deleteBidding.error}
          />
        </>
      )}
    </div>
  )
}
