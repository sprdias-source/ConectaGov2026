import { useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, ClipboardCopy, ClipboardPaste, FileUp, Loader2, ScanSearch } from 'lucide-react'
import Modal from '../ui/Modal'
import { Button, Textarea } from '../ui/FormControls'
import { AnaliseEditalResumo } from './AnaliseEditalResumo'
import { useToast } from '../../hooks/useToast'
import { PROMPT_ANALISE_EXTERNA } from '../../lib/promptAnaliseExterna'
import { extrairTextoDeArquivo, lerAnaliseExterna } from '../../lib/importarAnaliseExterna'
import type { AnaliseEdital } from '../../types/domain'

// navigator.clipboard só existe em contexto seguro (https/localhost) e pode
// ser negado pelo navegador — o fallback com textarea oculta + execCommand
// cobre esses casos, pra o botão nunca "não fazer nada" em silêncio.
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  }
}

// Plano B quando a IA do sistema falha: o usuário roda o edital no
// Claude/ChatGPT com o nosso prompt e cola (ou envia) a resposta aqui.
// Passo 1 colar → passo 2 conferir (mesma exibição da aba, via
// AnaliseEditalResumo, só leitura) → aplicar. Quem grava é o onAplicar
// (mutation `importar` dos hooks de análise).
export function ImportarAnaliseModal({ aberto, onFechar, onAplicar, existente, destino }: {
  aberto: boolean
  onFechar: () => void
  onAplicar: (analise: AnaliseEdital) => Promise<void> | void
  existente: boolean
  destino: 'licitação' | 'oportunidade'
}) {
  const { showToast } = useToast()
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState('')
  const [lendoArquivo, setLendoArquivo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ analise: AnaliseEdital; avisos: string[] } | null>(null)
  const [confirmandoSubstituir, setConfirmandoSubstituir] = useState(false)
  const [aplicando, setAplicando] = useState(false)

  // O texto colado fica guardado ao fechar (um clique sem querer fora do
  // modal não perde a resposta inteira); só o passo volta pro início.
  const fechar = () => {
    setResultado(null)
    setConfirmandoSubstituir(false)
    setErro(null)
    onFechar()
  }

  const handleCopiarPrompt = async () => {
    if (await copiarTexto(PROMPT_ANALISE_EXTERNA)) showToast('Prompt copiado')
    else showToast('Não foi possível copiar automaticamente. Tente de novo ou use outro navegador.', 'error')
  }

  const handleArquivo = async (file?: File) => {
    if (!file) return
    setLendoArquivo(true)
    setErro(null)
    try {
      setTexto(await extrairTextoDeArquivo(file))
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setLendoArquivo(false)
      // Permite escolher o mesmo arquivo de novo depois de corrigir.
      if (inputArquivoRef.current) inputArquivoRef.current.value = ''
    }
  }

  const handleLer = () => {
    setErro(null)
    try {
      setResultado(lerAnaliseExterna(texto))
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    }
  }

  const aplicar = async () => {
    if (!resultado) return
    setAplicando(true)
    setErro(null)
    try {
      await onAplicar(resultado.analise)
      setTexto('')
      fechar()
      showToast('Análise importada.')
    } catch (err) {
      setConfirmandoSubstituir(false)
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setAplicando(false)
    }
  }

  const handleAplicar = () => {
    if (existente && !confirmandoSubstituir) {
      setConfirmandoSubstituir(true)
      return
    }
    void aplicar()
  }

  const checklist = resultado?.analise.checklistDocumentacao ?? []

  return (
    <Modal open={aberto} onClose={fechar} title="Importar análise feita em outra IA" maxWidth="max-w-3xl" sheetNoCelular>
      {!resultado ? (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-1.5 text-[12px] text-base-300 list-decimal list-inside">
            <li>Copie o prompt da Conecta e abra o <strong>Claude</strong> ou o <strong>ChatGPT</strong>.</li>
            <li>Cole o prompt, anexe o PDF do edital (e o TR, se houver) e envie.</li>
            <li>Cole a resposta aqui embaixo (ou envie em .docx/.txt) e clique em "Ler análise".</li>
          </ol>

          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="tonal" onClick={handleCopiarPrompt}>
              <ClipboardCopy className="w-4 h-4" /> Copiar prompt da Conecta
            </Button>
            <Button type="button" variant="secondary" onClick={() => inputArquivoRef.current?.click()} loading={lendoArquivo}>
              <FileUp className="w-4 h-4" /> Enviar .docx / .txt
            </Button>
            <input
              ref={inputArquivoRef}
              type="file"
              accept=".docx,.txt,.json"
              className="hidden"
              onChange={(e) => handleArquivo(e.target.files?.[0])}
            />
          </div>

          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={12}
            placeholder="Cole aqui a resposta do Claude/ChatGPT (o JSON). Se ela veio em duas partes, cole as duas, uma depois da outra."
            className="font-mono text-[12px] resize-y"
          />

          {erro && (
            <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 text-[12px] text-negative-300">{erro}</div>
          )}

          <div className="flex justify-end">
            <Button type="button" onClick={handleLer} disabled={!texto.trim()}>
              <ScanSearch className="w-4 h-4" /> Ler análise
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {resultado.avisos.length > 0 && (
            <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning-400 shrink-0 mt-0.5" />
              <ul className="flex-1 flex flex-col gap-1 text-[12px] text-warning-400">
                {resultado.avisos.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          )}

          <AnaliseEditalResumo analise={resultado.analise} />

          {/* AnaliseEditalResumo só mostra a contagem do checklist (na aba,
              a lista de verdade fica em Checklist & Habilitação) — aqui é a
              hora de conferir os documentos antes de gravar. */}
          {checklist.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1.5">Checklist de documentação</p>
              <ul className="flex flex-col gap-1">
                {checklist.map((doc, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-base-300 bg-base-850/60 border border-base-800 rounded-lg px-3 py-1.5">
                    <span className="flex-1">{doc.descricao}</span>
                    <span className="text-[10px] text-base-500 shrink-0">{doc.categoria}{doc.obrigatorio === false ? ' · facultativo' : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {erro && (
            <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 text-[12px] text-negative-300">{erro}</div>
          )}

          {confirmandoSubstituir && (
            <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-3 text-[12px] text-warning-400">
              Já existe uma análise. Ela será substituída (as marcações de 'participando' dos itens serão perdidas). Continuar?
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap sticky bottom-0 bg-base-900 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => (confirmandoSubstituir ? setConfirmandoSubstituir(false) : setResultado(null))}
              disabled={aplicando}
            >
              <ArrowLeft className="w-4 h-4" /> {confirmandoSubstituir ? 'Cancelar' : 'Voltar e corrigir'}
            </Button>
            <Button type="button" onClick={handleAplicar} disabled={aplicando}>
              {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {confirmandoSubstituir ? 'Sim, substituir' : `Aplicar na ${destino}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// Selo pequeno "importada em DD/MM/AAAA HH:MM" — mostrado junto do status
// da análise quando ela veio de fora (AnaliseEdital.importadaDe), pra
// ninguém confundir com o resultado da IA do sistema. Visual neutro de
// propósito, diferente do selo "IA" dos campos preenchidos.
export function SeloAnaliseImportada({ analise }: { analise: AnaliseEdital | null | undefined }) {
  if (analise?.importadaDe !== 'externa') return null
  const quando = analise.importadaEm ? new Date(analise.importadaEm) : null
  const texto = quando && !Number.isNaN(quando.getTime())
    ? `importada em ${quando.toLocaleDateString('pt-BR')} ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : 'importada'
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-base-400 bg-base-850 border border-base-700 rounded-full px-2 py-0.5" title="Análise feita em outra IA (Claude/ChatGPT) e importada manualmente">
      <ClipboardPaste className="w-3 h-3" /> {texto}
    </span>
  )
}
