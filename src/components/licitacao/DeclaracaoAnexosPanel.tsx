import { useRef, useState } from 'react'
import { Sparkles, Loader2, Copy, Send, Paperclip, Trash2, Check } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { useDeclaracaoAnexos } from '../../hooks/useDeclaracaoAnexos'
import { useAttachedFiles } from '../../hooks/useAttachedFiles'
import { useToast } from '../../hooks/useToast'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import type { Bidding, BiddingChecklistItem, DeclaracaoAnexo } from '../../types/domain'

const PASSOS = ['Preenchido pela IA', 'Enviado ao cliente', 'Assinado e anexado'] as const
const PASSO_DO_STATUS: Record<DeclaracaoAnexo['status'], number> = { rascunho: 0, enviado: 1, assinado: 2 }

function Stepper({ status }: { status: DeclaracaoAnexo['status'] }) {
  const passoAtual = PASSO_DO_STATUS[status]
  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      {PASSOS.map((label, idx) => (
        <div key={label} className="flex items-center gap-1.5">
          {idx > 0 && <span className={`w-4 h-px ${idx <= passoAtual ? 'bg-positive-500' : 'bg-base-700'}`} />}
          <div className="flex items-center gap-1">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold font-mono shrink-0 ${
              idx < passoAtual ? 'bg-positive-500 text-base-950' : idx === passoAtual ? 'bg-accent-500 text-base-950' : 'bg-base-800 border border-base-700 text-base-500'
            }`}>
              {idx < passoAtual ? <Check className="w-2.5 h-2.5" /> : idx + 1}
            </span>
            <span className={`text-[10.5px] font-semibold ${idx <= passoAtual ? 'text-base-300' : 'text-base-600'}`}>{label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function AnexoCard({ anexo, checklistItems, podeEditar, bidding }: {
  anexo: DeclaracaoAnexo
  checklistItems: BiddingChecklistItem[]
  podeEditar: boolean
  bidding: Bidding
}) {
  const { atualizarTexto, marcarEnviado, anexarAssinado, deleteAnexo } = useDeclaracaoAnexos(bidding.id)
  const { uploadFile } = useAttachedFiles('licitacao', bidding.id)
  const { showToast } = useToast()
  const [texto, setTexto] = useState(anexo.texto)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [enviandoAssinado, setEnviandoAssinado] = useState(false)

  const itensResolvidos = checklistItems.filter((i) => anexo.itensChecklistIds.includes(i.id))
  const textoMudou = texto !== anexo.texto

  const handleCopiar = () => {
    navigator.clipboard.writeText(texto)
    showToast('Texto copiado.')
  }

  const handleSalvarTexto = () => {
    atualizarTexto.mutate({ id: anexo.id, texto }, {
      onError: (err) => showToast(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  const handleMarcarEnviado = () => {
    if (textoMudou) handleSalvarTexto()
    marcarEnviado.mutate(anexo.id, {
      onSuccess: () => showToast('Marcado como enviado ao cliente.'),
      onError: (err) => showToast(`Erro: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  const handleAnexarAssinado = async (file: File) => {
    setEnviandoAssinado(true)
    try {
      const { id: attachedFileId } = await uploadFile.mutateAsync({ file, category: 'Declaração' })
      await anexarAssinado.mutateAsync({ anexoId: anexo.id, attachedFileId, itensChecklistIds: anexo.itensChecklistIds })
      showToast(`Declaração assinada anexada — ${anexo.itensChecklistIds.length} item(ns) do checklist marcado(s) como atendido(s).`)
    } catch (err) {
      showToast(`Erro ao anexar a declaração assinada: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviandoAssinado(false)
    }
  }

  return (
    <div className="bg-base-850/60 border border-base-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-base-800 bg-base-900/40">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent-400">{anexo.fonte}</p>
            <p className="text-[13px] font-semibold text-base-100">{anexo.titulo}</p>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-bold text-accent-400 bg-accent-500/10 border border-accent-500/25 rounded-full px-2 py-0.5 shrink-0">
            <Sparkles className="w-3 h-3" /> preenchido pela IA
          </span>
        </div>
        {itensResolvidos.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="text-[10px] text-base-500 font-semibold">Resolve:</span>
            {itensResolvidos.map((i) => (
              <span key={i.id} className="text-[10px] font-mono font-bold bg-base-800 border border-base-700 text-base-400 rounded px-1.5 py-0.5">
                {i.numeroEdital || i.descricao.slice(0, 24)}
              </span>
            ))}
          </div>
        )}
        <Stepper status={anexo.status} />
      </div>

      <div className="p-4 flex flex-col gap-2.5">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={anexo.status !== 'rascunho' || !podeEditar}
          rows={10}
          className="w-full bg-base-900 border border-base-700 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed text-base-200 focus:border-accent-400 outline-none disabled:opacity-60 disabled:cursor-not-allowed font-sans"
        />

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleCopiar} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition">
            <Copy className="w-3.5 h-3.5" /> Copiar
          </button>

          {podeEditar && anexo.status === 'rascunho' && (
            <>
              {textoMudou && (
                <Button onClick={handleSalvarTexto} disabled={atualizarTexto.isPending}>
                  {atualizarTexto.isPending ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              )}
              <div className="flex-1" />
              <button onClick={() => deleteAnexo.mutate(anexo.id)} className="text-base-500 hover:text-negative-400 transition p-1.5" title="Excluir rascunho">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <Button onClick={handleMarcarEnviado} disabled={marcarEnviado.isPending}>
                <Send className="w-3.5 h-3.5" /> {marcarEnviado.isPending ? 'Marcando...' : 'Marcar como Enviado'}
              </Button>
            </>
          )}

          {podeEditar && anexo.status === 'enviado' && (
            <div className="flex-1 flex items-center gap-2 bg-accent-500/10 border border-dashed border-accent-500/30 rounded-lg px-3 py-2 flex-wrap">
              <span className="text-[11px] text-accent-300 flex-1 min-w-[200px]">
                📎 Aguardando o cliente devolver a declaração assinada — anexe o arquivo aqui quando chegar.
              </span>
              <input
                ref={fileInputRef} type="file" accept=".pdf,.png,.jpg" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnexarAssinado(f) }}
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={enviandoAssinado}>
                <Paperclip className="w-3.5 h-3.5" /> {enviandoAssinado ? 'Enviando...' : 'Anexar Assinada'}
              </Button>
            </div>
          )}

          {anexo.status === 'assinado' && (
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-positive-400 bg-positive-500/10 border border-positive-500/25 rounded-full px-2.5 py-1">
              <Check className="w-3.5 h-3.5" /> Anexada ao Checklist — {anexo.itensChecklistIds.length} item(ns) marcado(s) como atendido(s)
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DeclaracaoAnexosPanel({ bidding, checklistItems }: { bidding: Bidding; checklistItems: BiddingChecklistItem[] }) {
  const { anexos, isLoading, analisar } = useDeclaracaoAnexos(bidding.id)
  const { nivel } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao'
  const { showToast } = useToast()

  const handleAnalisar = () => {
    analisar.mutate(undefined, {
      onSuccess: (data) => showToast(data.criados > 0 ? `${data.criados} anexo(s) de declaração encontrado(s) e preenchido(s).` : 'Nenhum anexo-modelo de declaração foi encontrado neste edital.'),
      onError: (err) => showToast(`Erro ao analisar os anexos: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
        <div>
          <p className="text-[12px] font-bold text-base-200 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-accent-400" /> Anexos de Declaração</p>
          <p className="text-[11px] text-base-500 mt-0.5">A IA lê os anexos-modelo do próprio edital (Anexo II, III...) e já preenche com os dados do cliente — revise, mande pro cliente assinar e anexe o arquivo assinado de volta.</p>
        </div>
        {podeEditar && (
          <Button onClick={handleAnalisar} disabled={analisar.isPending}>
            {analisar.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {analisar.isPending ? 'Analisando...' : anexos.length > 0 ? 'Analisar Novamente' : 'Analisar Anexos do Edital'}
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-[12px] text-base-500 italic py-2">Carregando...</p>
      ) : anexos.length > 0 && (
        <div className="flex flex-col gap-3">
          {anexos.map((anexo) => (
            <AnexoCard key={anexo.id} anexo={anexo} checklistItems={checklistItems} podeEditar={podeEditar} bidding={bidding} />
          ))}
        </div>
      )}
    </div>
  )
}
