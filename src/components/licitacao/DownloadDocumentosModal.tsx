import { useState } from 'react'
import JSZip from 'jszip'
import { Loader2, Download } from 'lucide-react'
import Modal from '../ui/Modal'
import { Button } from '../ui/FormControls'
import { arquivoResolvidoDoItem } from '../../hooks/useBiddingChecklist'
import type { AtestadoTecnico, AttachedFile, BiddingChecklistItem, ClientDocument } from '../../types/domain'

type Escopo = 'checklist' | 'proposta' | 'contrato'

interface Entrada {
  fileId: string
  storagePath: string
  nomeArquivo: string
  label: string
  escopo: Escopo
  obrigatorio: boolean
}

interface Grupo {
  titulo: string
  entradas: Entrada[]
}

const FILTROS: { key: string; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'checklist', label: 'Todo o Checklist' },
  { key: 'checklist-obrigatorio', label: 'Só obrigatórios' },
  { key: 'proposta', label: 'Proposta' },
  { key: 'contrato', label: 'Contrato' },
]

const sanitizar = (nome: string) => nome.replace(/[\\/:*?"<>|]/g, '-')

export default function DownloadDocumentosModal({
  open, onClose, items, anexos, clientDocs, atestados, propostaEnviada, propostaReadequada, contrato, getDownloadUrl, nomeLicitacao,
}: {
  open: boolean
  onClose: () => void
  items: BiddingChecklistItem[]
  anexos: AttachedFile[]
  clientDocs: ClientDocument[]
  atestados: AtestadoTecnico[]
  propostaEnviada: AttachedFile | null
  propostaReadequada: AttachedFile | null
  contrato: AttachedFile | null
  getDownloadUrl: (storagePath: string) => Promise<string>
  nomeLicitacao: string
}) {
  const gruposChecklist = new Map<string, Entrada[]>()
  for (const item of items) {
    const arquivo = arquivoResolvidoDoItem(item, clientDocs, atestados, anexos)
    if (!arquivo) continue
    const categoria = item.categoria || 'Outro'
    const entrada: Entrada = {
      fileId: item.id,
      storagePath: arquivo.storagePath,
      nomeArquivo: arquivo.nome,
      label: item.numeroEdital ? `${item.numeroEdital} ${item.descricao}` : item.descricao,
      escopo: 'checklist',
      obrigatorio: item.obrigatorio,
    }
    gruposChecklist.set(categoria, [...(gruposChecklist.get(categoria) ?? []), entrada])
  }

  const grupos: Grupo[] = [
    ...Array.from(gruposChecklist.entries()).map(([categoria, entradas]) => ({ titulo: `Checklist — ${categoria}`, entradas })),
  ]

  const entradasProposta: Entrada[] = []
  if (propostaEnviada) entradasProposta.push({ fileId: propostaEnviada.id, storagePath: propostaEnviada.storagePath, nomeArquivo: propostaEnviada.name, label: `Proposta enviada — ${propostaEnviada.name}`, escopo: 'proposta', obrigatorio: false })
  if (propostaReadequada) entradasProposta.push({ fileId: propostaReadequada.id, storagePath: propostaReadequada.storagePath, nomeArquivo: propostaReadequada.name, label: `Proposta Readequada — ${propostaReadequada.name}`, escopo: 'proposta', obrigatorio: false })
  if (entradasProposta.length > 0) grupos.push({ titulo: 'Proposta', entradas: entradasProposta })

  if (contrato) grupos.push({ titulo: 'Contrato Final', entradas: [{ fileId: contrato.id, storagePath: contrato.storagePath, nomeArquivo: contrato.name, label: contrato.name, escopo: 'contrato', obrigatorio: false }] })

  const todasEntradas = grupos.flatMap((g) => g.entradas)

  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(todasEntradas.map((e) => e.fileId)))
  const [filtroAtivo, setFiltroAtivo] = useState('todos')
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const aplicarFiltro = (key: string) => {
    setFiltroAtivo(key)
    const match = (e: Entrada) => {
      if (key === 'todos') return true
      if (key === 'checklist') return e.escopo === 'checklist'
      if (key === 'checklist-obrigatorio') return e.escopo === 'checklist' && e.obrigatorio
      return e.escopo === key
    }
    setSelecionados(new Set(todasEntradas.filter(match).map((e) => e.fileId)))
  }

  const toggleEntrada = (fileId: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  const toggleGrupo = (grupo: Grupo, marcar: boolean) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      grupo.entradas.forEach((e) => { if (marcar) next.add(e.fileId); else next.delete(e.fileId) })
      return next
    })
  }

  const handleBaixar = async () => {
    const entradas = todasEntradas.filter((e) => selecionados.has(e.fileId))
    if (entradas.length === 0) return
    setBaixando(true)
    setErro(null)
    try {
      const zip = new JSZip()
      const pastaPorEscopo: Record<Escopo, string> = { checklist: 'Checklist', proposta: 'Proposta', contrato: 'Contrato Final' }
      const usados = new Set<string>()
      for (const entrada of entradas) {
        const url = await getDownloadUrl(entrada.storagePath)
        const resposta = await fetch(url)
        if (!resposta.ok) throw new Error(`Falha ao baixar ${entrada.nomeArquivo}`)
        const blob = await resposta.blob()
        let caminho = `${pastaPorEscopo[entrada.escopo]}/${sanitizar(entrada.nomeArquivo)}`
        let n = 2
        while (usados.has(caminho)) { caminho = `${pastaPorEscopo[entrada.escopo]}/${sanitizar(entrada.nomeArquivo.replace(/(\.[^.]+)?$/, ` (${n})$1`))}`; n++ }
        usados.add(caminho)
        zip.file(caminho, blob)
      }
      const conteudo = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(conteudo)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sanitizar(nomeLicitacao)} - Documentos.zip`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível gerar o .zip.')
    } finally {
      setBaixando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Zipar Documento" maxWidth="max-w-lg">
      <div className="flex flex-col gap-4">
        {todasEntradas.length === 0 ? (
          <p className="text-[13px] text-base-500 italic">Nenhum documento anexado ainda pra baixar.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {FILTROS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => aplicarFiltro(f.key)}
                  className={`text-[11.5px] font-semibold rounded-full px-3 py-1 border transition ${
                    filtroAtivo === f.key
                      ? 'text-accent-300 bg-accent-500/15 border-accent-500/30'
                      : 'text-base-400 bg-base-850 border-base-700 hover:text-base-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
              {grupos.map((grupo) => {
                const todosMarcados = grupo.entradas.every((e) => selecionados.has(e.fileId))
                const algumMarcado = grupo.entradas.some((e) => selecionados.has(e.fileId))
                return (
                  <div key={grupo.titulo} className="bg-base-850/60 border border-base-800 rounded-lg p-2.5">
                    <label className="flex items-center gap-2 text-[12px] font-bold text-base-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={todosMarcados}
                        ref={(el) => { if (el) el.indeterminate = !todosMarcados && algumMarcado }}
                        onChange={(e) => toggleGrupo(grupo, e.target.checked)}
                      />
                      {grupo.titulo}
                      <span className="ml-auto font-mono text-[10px] text-base-500 bg-base-800 rounded px-1.5">{grupo.entradas.length}</span>
                    </label>
                    <div className="flex flex-col gap-1 mt-1.5 pl-6">
                      {grupo.entradas.map((e) => (
                        <label key={e.fileId} className="flex items-center gap-2 text-[12px] text-base-400 cursor-pointer">
                          <input type="checkbox" checked={selecionados.has(e.fileId)} onChange={() => toggleEntrada(e.fileId)} />
                          <span className="truncate">{e.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {erro && <p className="text-[11.5px] text-negative-400">{erro}</p>}

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-base-800">
              <span className="text-[12px] font-semibold text-base-400">
                {selecionados.size} {selecionados.size === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}
              </span>
              <Button onClick={handleBaixar} disabled={selecionados.size === 0 || baixando}>
                {baixando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {baixando ? 'Gerando .zip...' : 'Baixar .zip'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
