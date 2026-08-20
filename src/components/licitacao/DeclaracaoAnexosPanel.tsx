import { useRef, useState } from 'react'
import { Sparkles, Loader2, FileDown, FileText, Paperclip, Trash2, Check, Eye } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { useDeclaracaoAnexos } from '../../hooks/useDeclaracaoAnexos'
import { useAttachedFiles } from '../../hooks/useAttachedFiles'
import { useToast } from '../../hooks/useToast'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import type { Bidding, BiddingChecklistItem, DeclaracaoAnexo } from '../../types/domain'

// "enviado" continua no tipo por compatibilidade com registros antigos (de
// quando o fluxo tinha 3 passos), mas o fluxo atual pula direto de rascunho
// pra assinado — nenhum anexo novo passa mais por esse status.
const PASSOS = ['Preenchido pela IA', 'Assinado e Importado'] as const
const PASSO_DO_STATUS: Record<DeclaracaoAnexo['status'], number> = { rascunho: 0, enviado: 0, assinado: 1 }

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
  const { atualizarTexto, gerarPdf, gerarWord, anexarAssinado, deleteAnexo } = useDeclaracaoAnexos(bidding.id)
  const { files: arquivosAnexados, uploadFile, getDownloadUrl } = useAttachedFiles('licitacao', bidding.id)
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [enviandoAssinado, setEnviandoAssinado] = useState(false)
  const arquivoAssinado = arquivosAnexados.find((f) => f.id === anexo.attachedFileId)

  // Prévia editável unificada (mesmo padrão da Proposta Readequada): em vez
  // de uma textarea solta com o texto inteiro, o cabeçalho/Processo-Pregão/
  // título ficam fixos (mesma lógica de gerar-anexo-declaracao — vêm do
  // primeiro bloco do texto e dos dados da licitação), e só o corpo da
  // declaração (excluindo data e assinatura, que ficam nos 2 últimos
  // blocos) é editável, já mostrado justificado/recuado como vai sair no
  // documento final. Não precisou separar em duas caixas como na Proposta
  // porque aqui não tem tabela travada no meio — é um bloco só.
  const blocos = anexo.texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const [blocoCabecalho, ...blocosCorpo] = blocos
  const indiceData = blocosCorpo.length - 2
  const indiceAssinatura = blocosCorpo.length - 1
  const corpoPadrao = blocosCorpo.slice(0, Math.max(indiceData, 0)).join('\n\n')
  const blocoData = indiceData >= 0 ? blocosCorpo[indiceData] : ''
  const blocoAssinatura = indiceAssinatura >= 0 ? blocosCorpo[indiceAssinatura] : ''

  const [corpo, setCorpo] = useState(corpoPadrao)
  const corpoMudou = corpo !== corpoPadrao
  const itensResolvidos = checklistItems.filter((i) => anexo.itensChecklistIds.includes(i.id))

  const handleSalvarTexto = () => {
    const novoTexto = [blocoCabecalho, corpo, blocoData, blocoAssinatura].filter((b) => b.trim()).join('\n\n')
    atualizarTexto.mutate({ id: anexo.id, texto: novoTexto }, {
      onError: (err) => showToast(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  const handleGerarPdf = () => {
    if (corpoMudou) handleSalvarTexto()
    gerarPdf.mutate(anexo.id, {
      onError: (err) => showToast(`Erro ao gerar o PDF: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  const handleGerarWord = () => {
    if (corpoMudou) handleSalvarTexto()
    gerarWord.mutate(anexo.id, {
      onError: (err) => showToast(`Erro ao gerar o Word: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  const handleImportarDeclaracao = async (file: File) => {
    if (corpoMudou) handleSalvarTexto()
    setEnviandoAssinado(true)
    try {
      const { id: attachedFileId } = await uploadFile.mutateAsync({ file, category: 'Declaração' })
      await anexarAssinado.mutateAsync({ anexoId: anexo.id, attachedFileId, itensChecklistIds: anexo.itensChecklistIds })
      showToast(`Declaração importada — ${anexo.itensChecklistIds.length} item(ns) do checklist marcado(s) como atendido(s).`)
    } catch (err) {
      showToast(`Erro ao importar a declaração: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviandoAssinado(false)
    }
  }

  const handleVisualizarAssinado = async () => {
    if (!arquivoAssinado) return
    try {
      const url = await getDownloadUrl(arquivoAssinado.storagePath)
      window.open(url, '_blank')
    } catch (err) {
      showToast(`Erro ao abrir o arquivo: ${err instanceof Error ? err.message : String(err)}`, 'error')
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
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-base-500 uppercase tracking-wider">Prévia — cópia fiel do documento gerado</p>
          {podeEditar && anexo.status === 'rascunho' && <span className="text-[10px] font-mono font-bold text-accent-400">✎ texto editável aqui</span>}
        </div>

        {/* Prévia editável unificada: cabeçalho/Processo-Pregão/título fixos
            (mesma fonte de dados de gerar-anexo-declaracao), corpo editável
            já mostrado justificado/recuado, data/assinatura fixas. */}
        <div className="bg-[#f4f1e9] text-[#20241f] rounded-lg border border-base-700 px-7 py-7" style={{ fontFamily: 'Georgia, serif' }}>
          <div className="text-center leading-relaxed mb-2">
            {blocoCabecalho.split('\n').filter(Boolean).map((linha, idx) => (
              <p key={idx} className={idx === 0 ? 'font-bold text-[13px]' : 'text-[9.5px] text-[#4a4d47]'} style={{ fontFamily: 'Inter, sans-serif' }}>{linha}</p>
            ))}
          </div>
          <div className="h-px bg-[#b9beb0] mb-3" />

          {(bidding.processo || bidding.numeroEdital) && (
            <p className="font-bold text-[10.5px] leading-relaxed mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
              {bidding.processo && <>PROCESSO LICITATÓRIO Nº {bidding.processo}<br /></>}
              {bidding.numeroEdital && <>{(bidding.modalidade ?? '').toUpperCase()} Nº {bidding.numeroEdital}</>}
            </p>
          )}
          {anexo.titulo && <p className="text-center font-extrabold text-[11px] mb-1" style={{ fontFamily: 'Inter, sans-serif' }}>{anexo.titulo.toUpperCase()}</p>}

          <div className="relative border-[1.5px] border-dashed border-accent-500/60 rounded px-2.5 py-2 my-3">
            {podeEditar && anexo.status === 'rascunho' && <span className="absolute -top-2 left-2 bg-accent-500 text-white text-[8.5px] font-mono font-bold px-1.5 rounded-full">editável</span>}
            <textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              disabled={anexo.status !== 'rascunho' || !podeEditar}
              rows={8}
              className="w-full bg-transparent text-[11px] leading-relaxed outline-none resize-y disabled:cursor-not-allowed"
              style={{ fontFamily: 'Georgia, serif', textAlign: 'justify', textIndent: '2em' }}
            />
          </div>

          {blocoData && <p className="text-[10.5px] mb-3">{blocoData}</p>}
          {blocoAssinatura && (
            <div className="text-[9.5px] leading-loose" style={{ fontFamily: 'Inter, sans-serif' }}>
              {blocoAssinatura.split('\n').filter(Boolean).map((linha, idx) => (
                <p key={idx} className={idx === 0 ? 'border-t border-[#333] w-[220px] pt-1 mb-0.5' : 'mb-0.5'}>{idx === 0 ? '' : linha}</p>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {podeEditar && (
            <button onClick={handleGerarWord} disabled={gerarWord.isPending} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition disabled:opacity-60">
              {gerarWord.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              {gerarWord.isPending ? 'Gerando Word...' : 'Gerar Word'}
            </button>
          )}
          {podeEditar && (
            <button onClick={handleGerarPdf} disabled={gerarPdf.isPending} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition disabled:opacity-60">
              {gerarPdf.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              {gerarPdf.isPending ? 'Gerando PDF...' : 'Gerar PDF'}
            </button>
          )}

          {podeEditar && anexo.status === 'rascunho' && (
            <>
              {corpoMudou && (
                <Button onClick={handleSalvarTexto} disabled={atualizarTexto.isPending}>
                  {atualizarTexto.isPending ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              )}
              <div className="flex-1" />
              <button onClick={() => deleteAnexo.mutate(anexo.id)} className="text-base-500 hover:text-negative-400 transition p-1.5" title="Excluir rascunho">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef} type="file" accept=".pdf,.png,.jpg" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportarDeclaracao(f); e.target.value = '' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()} disabled={enviandoAssinado}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition disabled:opacity-60"
              >
                {enviandoAssinado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                {enviandoAssinado ? 'Importando...' : 'Importar Declaração'}
              </button>
            </>
          )}

          {anexo.status === 'assinado' && (
            <>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-positive-400 bg-positive-500/10 border border-positive-500/25 rounded-full px-2.5 py-1">
                <Check className="w-3.5 h-3.5" /> Declaração Importada — {anexo.itensChecklistIds.length} item(ns) do checklist atendido(s)
              </span>
              {arquivoAssinado && (
                <button onClick={handleVisualizarAssinado} title="Visualizar declaração assinada" className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition">
                  <Eye className="w-3.5 h-3.5" /> Visualizar
                </button>
              )}
            </>
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
        <div>
          <p className="text-[12px] font-bold text-base-200 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-accent-400" /> Anexos de Declaração</p>
          <p className="text-[11px] text-base-500 mt-0.5">Preenchido automaticamente ao analisar o edital: a IA acha os anexos-modelo de declaração (Anexo II, III...) e já preenche com os dados do cliente, copiando fielmente a redação do edital — revise, gere o Word ou o PDF (já formatados: cabeçalho centralizado, corpo justificado), mande pro cliente assinar e importe o arquivo assinado de volta, que já marca o(s) item(ns) do checklist correspondente(s) como atendido(s).</p>
        </div>
        {analisar.isPending && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-300 shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando anexos do edital...
          </span>
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
