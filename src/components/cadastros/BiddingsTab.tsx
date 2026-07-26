import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Gavel, Power, Eye, EyeOff, Lock, FileText, FileCheck2, FileUp, Loader2, FolderCheck } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { EmptyState, StatusBadge } from '../ui/Primitives'
import ActionsMenu, { type ActionsMenuItem } from '../ui/ActionsMenu'
import { formatBRL } from '../../hooks/useAccountBalances'
import { supabase } from '../../lib/supabase'
import BiddingFormModal from './BiddingFormModal'
import DeleteWithPasswordDialog from '../ui/DeleteWithPasswordDialog'
import ErrorAlert from '../ui/ErrorAlert'
import SeloHabilitacao from '../ui/SeloHabilitacao'
import { usePagination, PaginationControls } from '../../hooks/usePagination'
import { useBiddings } from '../../hooks/useBiddings'
import { useClients } from '../../hooks/useClients'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import { useToast } from '../../hooks/useToast'
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
  const navigate = useNavigate()
  const { biddings, isLoading, addBidding, updateBidding, deleteBidding, toggleBiddingActive, setModeloCustomizado, checkBiddingHasFinancialHistory } = useBiddings()
  const { clients } = useClients()
  const { showToast } = useToast()
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
      updateBidding.mutate({ bidding: { ...editing, ...data } as Bidding, items }, {
        onSuccess: () => { setModalOpen(false); setEditing(null); showToast('Licitação atualizada com sucesso.') },
        onError: (err) => showToast(`Erro ao atualizar a licitação: ${err instanceof Error ? err.message : String(err)}`, 'error'),
      })
    } else {
      addBidding.mutate({ bidding: data, items }, {
        onSuccess: () => { setModalOpen(false); showToast('Licitação cadastrada com sucesso.') },
        onError: (err) => showToast(`Erro ao cadastrar a licitação: ${err instanceof Error ? err.message : String(err)}`, 'error'),
      })
    }
  }

  const handleGerarDeclaracoes = async (b: Bidding) => {
    const key = `${b.id}:declaracoes`
    setGerandoPropostaKey(key)
    setErroGeracao(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gerar-declaracoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ clientId: b.clientId, biddingId: b.id }),
      })
      const resultado = await res.json()
      if (!res.ok || resultado.error) {
        throw new Error(resultado.error || 'Erro desconhecido ao gerar as declarações')
      }

      const bytes = Uint8Array.from(atob(resultado.fileBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: resultado.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = resultado.fileName || 'declaracoes.docx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setErroGeracao(`Licitação "${b.objeto.slice(0, 40)}": ${String(err)}`)
    } finally {
      setGerandoPropostaKey(null)
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

  // Junta as ações menos usadas (gerar documentos, modelo próprio, inativar,
  // excluir) num menu "..." só — inativar Editar/Ver fora dele, que são as
  // ações do dia a dia. Sem isso a linha tinha até 8 ícones lado a lado.
  const montarAcoes = (b: Bidding): ActionsMenuItem[] => {
    const ganhou = b.status === 'Ganhou'
    const temModeloProprio = !!b.modeloCustomizadoPath
    const enviandoEsteModelo = enviandoModeloId === b.id
    const itens: ActionsMenuItem[] = [
      {
        key: 'ver',
        label: 'Ver Documentação e Checklist',
        icon: <FolderCheck className="w-4 h-4" />,
        onClick: () => navigate(`/licitacoes/${b.id}`),
      },
      {
        key: 'declaracoes',
        label: 'Gerar Declarações Padrão',
        icon: gerandoPropostaKey === `${b.id}:declaracoes` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />,
        onClick: () => handleGerarDeclaracoes(b),
        disabled: gerandoPropostaKey === `${b.id}:declaracoes`,
      },
      {
        key: 'proposta',
        label: 'Gerar Proposta de Preços',
        icon: gerandoPropostaKey === `${b.id}:normal` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />,
        onClick: () => handleGerarProposta(b, 'normal'),
        disabled: gerandoPropostaKey === `${b.id}:normal`,
      },
    ]
    if (ganhou) {
      itens.push({
        key: 'proposta-readequada',
        label: 'Gerar Proposta Readequada',
        icon: gerandoPropostaKey === `${b.id}:readequada` ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />,
        onClick: () => handleGerarProposta(b, 'readequada'),
        disabled: gerandoPropostaKey === `${b.id}:readequada`,
      })
    }
    if (podeEditar) {
      itens.push(
        temModeloProprio
          ? {
              key: 'modelo',
              label: 'Remover Modelo Próprio (voltar ao padrão)',
              icon: enviandoEsteModelo ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />,
              onClick: () => handleRemoverModelo(b),
              disabled: enviandoEsteModelo,
            }
          : {
              key: 'modelo',
              label: 'Enviar Modelo Próprio (.docx)',
              icon: enviandoEsteModelo ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />,
              render: (fechar) => (
                <label className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-left text-base-200 hover:bg-base-800 transition cursor-pointer">
                  {enviandoEsteModelo ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                  Enviar Modelo Próprio (.docx)
                  <input
                    type="file"
                    accept=".docx"
                    className="hidden"
                    disabled={enviandoEsteModelo}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUploadModelo(b, file)
                      e.target.value = ''
                      fechar()
                    }}
                  />
                </label>
              ),
            }
      )
      itens.push({
        key: 'toggle-ativa',
        label: b.isActive ? 'Inativar Licitação' : 'Reativar Licitação',
        icon: <Power className="w-4 h-4" />,
        onClick: () => toggleBiddingActive.mutate({ bidding: b, isActive: !b.isActive }, { onSuccess: (updated) => showToast(updated.isActive ? 'Licitação reativada.' : 'Licitação inativada.') }),
      })
      itens.push({
        key: 'excluir',
        label: 'Excluir Licitação',
        icon: <Trash2 className="w-4 h-4" />,
        onClick: () => setDeleting(b),
        danger: true,
      })
    }
    return itens
  }

  const valoresNode = (b: Bidding): ReactNode => (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono font-semibold text-base-200 text-[13px]">{formatBRL(b.valorLicitado)}</span>
      <span className="text-[10px] text-base-500">
        Ofertado: {b.valorOfertadoReal ? <span className="font-mono text-positive-400">{formatBRL(b.valorOfertadoReal)}</span> : '—'}
      </span>
    </div>
  )

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
          <>
            {/* Desktop: tabela enxuta — 6 colunas em vez de 8, e as ações
                menos usadas (gerar documentos, modelo, inativar, excluir)
                foram pro menu "...", deixando só Editar visível na linha. */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-800 text-left">
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Objeto / Órgão</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Modalidade / Data</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Valores</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((b) => (
                    <tr key={b.id} className={`border-b border-base-800/60 hover:bg-base-850/40 transition ${!b.isActive ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 max-w-[260px]">
                        <button
                          onClick={() => navigate(`/licitacoes/${b.id}`)}
                          title="Ver documentação e checklist desta licitação"
                          className="font-semibold text-base-100 hover:text-accent-300 truncate flex items-center gap-2 text-left transition"
                        >
                          <span className="truncate">{b.objeto}</span>
                          {!b.isActive && <span className="px-1.5 py-0.5 rounded bg-base-700 text-base-400 text-[10px] font-bold shrink-0">Inativa</span>}
                        </button>
                        <div className="text-base-500 text-[12px] truncate">{b.orgao}</div>
                      </td>
                      <td className="px-4 py-3 text-base-300 text-[13px]">
                        {clientName(b.clientId)}
                        <span className={`block text-[10px] font-bold mt-0.5 ${isMensalista(b.clientId) ? 'text-accent-400' : 'text-warning-400'}`}>
                          {isMensalista(b.clientId) ? 'Mensalista' : 'Individual'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-base-400 text-[12px] whitespace-nowrap">
                        {b.modalidade}
                        <span className="block text-base-300 mt-0.5">{new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                      </td>
                      <td className="px-4 py-3">{valoresNode(b)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} />
                        {b.status === 'Em Andamento' && b.etapa && (
                          <p className="text-[10px] text-base-500 mt-1">Etapa: {b.etapa}</p>
                        )}
                        <SeloHabilitacao bidding={b} className="block mt-1" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {podeEditar && (
                            <button onClick={() => { setEditing(b); setModalOpen(true) }} title="Editar dados da licitação" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          <ActionsMenu items={montarAcoes(b)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: card por licitação, mesma informação e ações. */}
            <div className="flex flex-col gap-2.5 p-3 md:hidden">
              {paginated.map((b) => (
                <div key={b.id} className={`bg-base-850/40 border border-base-800 rounded-xl p-3.5 flex flex-col gap-2.5 ${!b.isActive ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      onClick={() => navigate(`/licitacoes/${b.id}`)}
                      className="min-w-0 text-left"
                      title="Ver documentação e checklist desta licitação"
                    >
                      <div className="font-semibold text-base-100 flex items-center gap-2 flex-wrap">
                        <span className="truncate">{b.objeto}</span>
                        {!b.isActive && <span className="px-1.5 py-0.5 rounded bg-base-700 text-base-400 text-[10px] font-bold shrink-0">Inativa</span>}
                      </div>
                      <div className="text-base-500 text-[12px] truncate">{b.orgao}</div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {podeEditar && (
                        <button onClick={() => { setEditing(b); setModalOpen(true) }} title="Editar dados da licitação" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <ActionsMenu items={montarAcoes(b)} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-base-800 text-[12px]">
                    <div>
                      <span className="text-base-300">{clientName(b.clientId)}</span>
                      <span className={`block text-[10px] font-bold mt-0.5 ${isMensalista(b.clientId) ? 'text-accent-400' : 'text-warning-400'}`}>
                        {isMensalista(b.clientId) ? 'Mensalista' : 'Individual'}
                      </span>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-base-400">{b.modalidade} · {new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    {valoresNode(b)}
                  </div>

                  {b.status === 'Em Andamento' && b.etapa && (
                    <p className="text-[11px] text-base-500">Etapa: {b.etapa}</p>
                  )}
                  <SeloHabilitacao bidding={b} />
                </div>
              ))}
            </div>
          </>
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
            onConfirm={() => { if (deleting) deleteBidding.mutate(deleting, { onSuccess: () => { setDeleting(null); showToast('Licitação excluída.') } }) }}
            isLoading={deleteBidding.isPending}
            error={deleteBidding.error}
          />
        </>
      )}
    </div>
  )
}
