import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, FileText, Download, Trash2, Loader2, Gavel } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAttachedFiles } from '../../hooks/useAttachedFiles'
import { useBiddings } from '../../hooks/useBiddings'
import { useToast } from '../../hooks/useToast'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import BiddingFormModal from './BiddingFormModal'
import type { Client, Bidding, BiddingItem } from '../../types/domain'

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Pasta de edital/TR de um cliente específico — antes de virar uma
// licitação de verdade, o edital fica aqui pro cliente analisar se quer
// participar. Reaproveita attached_files com entityType 'cliente' (até
// então sem nenhum uso), sem precisar de tabela nova. Quando o cliente
// topa participar, "Criar Licitação" promove esses mesmos arquivos pra
// virarem os anexos da licitação recém-criada.
export default function EditaisAnaliseSection({ client, onClose }: { client: Client; onClose: () => void }) {
  const { files, uploadFile, deleteFile, getDownloadUrl } = useAttachedFiles('cliente', client.id)
  const { addBidding } = useBiddings()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  // Esta seção envia/apaga arquivos de edital e cria licitações completas —
  // antes não checava permissão nenhuma, então qualquer membro com acesso
  // só de visualização (ou nenhum) em "licitações" conseguia fazer tudo
  // isso mesmo assim.
  const { nivel } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao'

  const editalInputRef = useRef<HTMLInputElement>(null)
  const trInputRef = useRef<HTMLInputElement>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [modalCriarAberto, setModalCriarAberto] = useState(false)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>, categoria: 'Edital' | 'Termo de Referência') => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadFile.mutate({ file, category: categoria })
    e.target.value = ''
  }

  const handleDownload = async (file: (typeof files)[number]) => {
    setDownloadingId(file.id)
    try {
      const url = await getDownloadUrl(file.storagePath)
      window.open(url, '_blank')
    } catch {
      showToast('Não foi possível gerar o link de download. Tente novamente.', 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleCriarLicitacao = (data: Partial<Bidding>, items: Partial<BiddingItem>[]) => {
    addBidding.mutate({ bidding: data, items }, {
      onSuccess: async ({ created }) => {
        // Promove os arquivos desta pasta (edital/TR do cliente) pra virarem
        // os anexos da licitação recém-criada.
        const { error } = await supabase
          .from('attached_files')
          .update({ entity_type: 'licitacao', entity_id: created.id })
          .eq('entity_type', 'cliente')
          .eq('entity_id', client.id)
        if (error) {
          showToast('Licitação criada, mas houve erro ao mover os arquivos do edital.', 'error')
        } else {
          showToast('Licitação criada e arquivos do edital movidos para ela.')
        }
        queryClient.invalidateQueries({ queryKey: ['attached_files'] })
        setModalCriarAberto(false)
        onClose()
        navigate(`/licitacoes/${created.id}`)
      },
      onError: (err) => showToast(`Erro ao criar a licitação: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  return (
    <div className="border-t border-base-800 pt-4 mt-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-base-400">Editais em Análise</span>
        {podeEditar && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => editalInputRef.current?.click()}
              disabled={uploadFile.isPending}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-accent-300 bg-base-850 border border-base-700 rounded-lg px-2.5 py-1.5 transition disabled:opacity-50"
            >
              {uploadFile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Edital
            </button>
            <input ref={editalInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={(e) => handleUpload(e, 'Edital')} />
            <button
              type="button"
              onClick={() => trInputRef.current?.click()}
              disabled={uploadFile.isPending}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-accent-300 bg-base-850 border border-base-700 rounded-lg px-2.5 py-1.5 transition disabled:opacity-50"
            >
              {uploadFile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Termo de Referência
            </button>
            <input ref={trInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={(e) => handleUpload(e, 'Termo de Referência')} />
          </div>
        )}
      </div>

      {files.length === 0 ? (
        <p className="text-[12px] text-base-500 italic">Nenhum edital ou TR em análise para este cliente ainda.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 mb-3">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 bg-base-850/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-base-200 truncate">{f.name}</p>
                    <p className="text-[10px] text-base-500">{f.category} · {formatSize(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleDownload(f)} disabled={downloadingId === f.id} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    {downloadingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  </button>
                  {podeEditar && (
                    <button onClick={() => deleteFile.mutate(f)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {podeEditar && (
            <button
              type="button"
              onClick={() => setModalCriarAberto(true)}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition"
            >
              <Gavel className="w-3.5 h-3.5" /> Criar Licitação a partir destes Arquivos
            </button>
          )}
        </>
      )}

      {podeEditar && (
        <BiddingFormModal
          open={modalCriarAberto}
          onClose={() => setModalCriarAberto(false)}
          onSave={handleCriarLicitacao}
          clients={[client]}
          isSaving={addBidding.isPending}
          error={addBidding.error}
        />
      )}
    </div>
  )
}
