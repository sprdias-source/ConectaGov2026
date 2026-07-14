import { useState } from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle, Clock, Upload,
  Download, RefreshCw, Trash2, Plus, FileText, ChevronDown, ChevronUp, AlertCircle, X,
} from 'lucide-react'
import { Button } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import { supabase } from '../../lib/supabase'
import { useClientDocuments, calcDocStatus, diasRestantes } from '../../hooks/useClientDocuments'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import AcoesDocumentoManual from './AcoesDocumentoManual'
import { CERT_CONFIG } from '../../types/domain'
import type { ClientDocument, DocumentTipo, DocumentStatus } from '../../types/domain'

const CERT_TIPOS = Object.keys(CERT_CONFIG) as Exclude<DocumentTipo, 'manual'>[]

function StatusIcon({ status }: { status: DocumentStatus }) {
  if (status === 'valido') return <CheckCircle2 className="w-4 h-4 text-positive-400 shrink-0" />
  if (status === 'vencendo') return <AlertTriangle className="w-4 h-4 text-warning-400 shrink-0" />
  if (status === 'vencido') return <XCircle className="w-4 h-4 text-negative-400 shrink-0" />
  return <Clock className="w-4 h-4 text-base-500 shrink-0" />
}

function StatusBadge({ status }: { status: DocumentStatus }) {
  const map = {
    valido: 'bg-positive-500/15 text-positive-400 border-positive-500/30',
    vencendo: 'bg-warning-500/15 text-warning-400 border-warning-500/30',
    vencido: 'bg-negative-500/15 text-negative-400 border-negative-500/30',
    pendente: 'bg-base-700/40 text-base-400 border-base-700',
    erro: 'bg-negative-500/15 text-negative-400 border-negative-500/30',
  }
  const labels = { valido: 'Válida', vencendo: 'Vencendo', vencido: 'Vencida', pendente: 'Pendente', erro: 'Erro' }
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${map[status]}`}>
      {labels[status]}
    </span>
  )
}

interface Props {
  clientId: string
  clientName: string
  cnpj?: string
}

// Mapa de tipo de certidão → nome da Edge Function correspondente
const EDGE_FUNCTIONS: Record<Exclude<DocumentTipo, 'manual'>, string> = {
  cndt: 'buscar-cndt',
  cnd_federal: 'buscar-cnd-federal',
  cnd_estadual_rs: 'buscar-cnd-estadual-rs',
  fgts: 'buscar-fgts',
  cnd_municipal: 'buscar-cnd-municipal-vacaria',
  certidao_falencia_rs: 'buscar-certidao-falencia-rs',
}

export default function HabilitacaoChecklist({ clientId, clientName, cnpj }: Props) {
  const { documents, uploadAndSave, deleteDocument, getDownloadUrl } = useClientDocuments(clientId)
  const { nivel: nivelCadastros } = usePermissaoFerramenta('cadastros')
  const podeEditar = nivelCadastros === 'edicao'
  const [buscando, setBuscando] = useState<DocumentTipo | null>(null)
  const [errosBusca, setErrosBusca] = useState<Partial<Record<DocumentTipo, string>>>({})

  const handleBuscarAutomatico = async (tipo: Exclude<DocumentTipo, 'manual'>) => {
    if (!cnpj || !podeEditar) return
    setBuscando(tipo)
    setErrosBusca((prev) => { const n = { ...prev }; delete n[tipo]; return n })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTIONS[tipo]}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ cnpj, clientId }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setErrosBusca((prev) => ({ ...prev, [tipo]: data.error || 'Erro desconhecido' }))
      }
    } catch (err) {
      setErrosBusca((prev) => ({ ...prev, [tipo]: String(err) }))
    } finally {
      setBuscando(null)
    }
  }
  const [uploadingTipo, setUploadingTipo] = useState<DocumentTipo | null>(null)
  const [uploadForm, setUploadForm] = useState<{ dataEmissao: string; dataValidade: string; observacoes: string }>({ dataEmissao: '', dataValidade: '', observacoes: '' })
  const [manualForm, setManualForm] = useState<{
    nome: string; dataEmissao: string; dataValidade: string; observacoes: string
  }>({ nome: '', dataEmissao: '', dataValidade: '', observacoes: '' })
  const [showManual, setShowManual] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const getDoc = (tipo: DocumentTipo) => documents.find((d) => d.tipo === tipo)

  const handleDownload = async (doc: ClientDocument) => {
    if (!doc.storagePath) return
    try {
      const url = await getDownloadUrl(doc.storagePath)
      window.open(url, '_blank')
    } catch { }
  }

  const handleUploadSubmit = async (tipo: DocumentTipo, nome: string, autoRenovavel = false) => {
    if (!podeEditar) return
    if (!selectedFile && !autoRenovavel) return
    if (selectedFile) {
      await uploadAndSave.mutateAsync({
        file: selectedFile,
        tipo,
        nome,
        dataEmissao: uploadForm.dataEmissao || null,
        dataValidade: uploadForm.dataValidade || null,
        observacoes: uploadForm.observacoes || null,
      })
    }
    setUploadingTipo(null)
    setSelectedFile(null)
    setUploadForm({ dataEmissao: '', dataValidade: '', observacoes: '' })
  }

  const handleDownloadAll = async () => {
    for (const doc of documents) {
      if (doc.storagePath) {
        try {
          const url = await getDownloadUrl(doc.storagePath)
          const a = document.createElement('a')
          a.href = url
          a.download = `${doc.tipo}_${doc.dataValidade ?? 'sem-data'}.pdf`
          a.click()
          await new Promise((r) => setTimeout(r, 500))
        } catch { }
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-base-100">Habilitação — {clientName}</h3>
          <p className="text-[11px] text-base-500 mt-0.5">
            Certidões e documentos exigidos para participação em licitações
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!podeEditar && (
            <span className="text-[11px] font-semibold text-base-500 bg-base-850 border border-base-700 rounded-full px-3 py-1">
              Somente visualização
            </span>
          )}
          {documents.some((d) => d.storagePath) && (
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-base-400 hover:text-base-200 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" /> Baixar todas
            </button>
          )}
        </div>
      </div>

      <ErrorAlert error={uploadAndSave.error || deleteDocument.error} />

      {/* Certidões automáticas */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
          Certidões automáticas
          {cnpj
            ? <span className="ml-2 text-accent-400 normal-case font-normal">Clique em "Buscar auto" para baixar do portal oficial, ou "Buscar manualmente" caso prefira resolver você mesmo</span>
            : <span className="ml-2 text-base-600 normal-case font-normal">CNPJ necessário para busca automática</span>
          }
        </p>
        {CERT_TIPOS.map((tipo) => {
          const cfg = CERT_CONFIG[tipo]
          const doc = getDoc(tipo)
          const status = doc ? calcDocStatus(doc.dataValidade, cfg.alertaDias) : 'pendente'
          const dias = doc ? diasRestantes(doc.dataValidade) : null
          const isUploading = uploadingTipo === tipo

          return (
            <div key={tipo} className="bg-base-850/60 border border-base-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <StatusIcon status={status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-base-200">{cfg.label}</span>
                    <StatusBadge status={status} />
                  </div>
                  {doc?.dataValidade ? (
                    <p className={`text-[11px] mt-0.5 ${dias !== null && dias <= 15 ? 'text-warning-400' : 'text-base-500'}`}>
                      Válida até {new Date(doc.dataValidade + 'T12:00:00').toLocaleDateString('pt-BR')}
                      {dias !== null && (
                        <span className="ml-1 font-semibold">
                          ({dias < 0 ? `${Math.abs(dias)} dias vencida` : `${dias} dias restantes`})
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] text-base-500 mt-0.5">
                      Validade: {cfg.validadeDias} dias · Portal: {cfg.portal}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Botão de busca automática — aparece quando há CNPJ disponível e o nível permite edição */}
                  {cnpj && podeEditar && (
                    <button
                      onClick={() => handleBuscarAutomatico(tipo)}
                      disabled={buscando === tipo}
                      title="Buscar automaticamente via portal oficial"
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition border ${
                        buscando === tipo
                          ? 'bg-accent-500/10 text-accent-400 border-accent-500/30 cursor-wait'
                          : 'bg-accent-500/10 text-accent-300 border-accent-500/20 hover:bg-accent-500/20'
                      }`}
                    >
                      <RefreshCw className={`w-3 h-3 ${buscando === tipo ? 'animate-spin' : ''}`} />
                      {buscando === tipo ? 'Buscando...' : 'Buscar auto'}
                    </button>
                  )}
                  {doc?.storagePath && (
                    <button
                      onClick={() => handleDownload(doc)}
                      title="Baixar PDF"
                      className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {podeEditar && (
                    <button
                      onClick={() => setUploadingTipo(isUploading ? null : tipo)}
                      title="Enviar manualmente"
                      className={`p-1.5 rounded transition ${isUploading ? 'text-accent-300 bg-accent-500/10' : 'text-base-400 hover:text-accent-300 hover:bg-base-800'}`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {doc?.storagePath && podeEditar && (
                    <button
                      onClick={() => setUploadingTipo(isUploading ? null : tipo)}
                      title="Renovar certidão"
                      className="p-1.5 text-base-400 hover:text-warning-400 hover:bg-base-800 rounded transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {doc && podeEditar && (
                    <button
                      onClick={() => deleteDocument.mutate(doc)}
                      title="Remover"
                      className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Erro da busca automática */}
              {errosBusca[tipo] && (
                <div className="border-t border-base-800 px-4 py-2 bg-negative-500/5 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-negative-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-negative-400">{errosBusca[tipo]}</p>
                  <button onClick={() => setErrosBusca((p) => { const n = {...p}; delete n[tipo]; return n })} className="ml-auto text-base-500 hover:text-base-300">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Ação manual híbrida — sempre disponível pra qualquer nível de edição,
                  independente do status da busca automática (não só quando ela falha) */}
              {podeEditar && (
                <div className="border-t border-base-800 px-4 py-2">
                  <AcoesDocumentoManual
                    clientId={clientId}
                    tipo={tipo}
                    nomeDocumento={cfg.label}
                    uploadAndSave={uploadAndSave.mutateAsync}
                  />
                </div>
              )}

              {/* Formulário de upload manual (upload direto de PDF já em mãos) para esta certidão */}
              {isUploading && podeEditar && (
                <div className="border-t border-base-800 px-4 py-3 bg-base-900/40 flex flex-col gap-3">
                  <p className="text-[11px] text-accent-300 font-semibold">
                    Upload manual — {cfg.label}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Data de Emissão</label>
                      <input
                        type="date"
                        value={uploadForm.dataEmissao}
                        onChange={(e) => setUploadForm({ ...uploadForm, dataEmissao: e.target.value })}
                        className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 focus:border-accent-400 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Data de Validade *</label>
                      <input
                        type="date"
                        value={uploadForm.dataValidade}
                        onChange={(e) => setUploadForm({ ...uploadForm, dataValidade: e.target.value })}
                        className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 focus:border-accent-400 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Arquivo PDF *</label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      className="w-full text-[12px] text-base-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-accent-500 file:text-base-950 file:font-semibold file:text-[11px] hover:file:bg-accent-400 file:cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Observações (opcional)"
                    value={uploadForm.observacoes}
                    onChange={(e) => setUploadForm({ ...uploadForm, observacoes: e.target.value })}
                    className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => { setUploadingTipo(null); setSelectedFile(null) }}>Cancelar</Button>
                    <Button
                      onClick={() => handleUploadSubmit(tipo, cfg.label.split(' — ')[0])}
                      disabled={!selectedFile || !uploadForm.dataValidade || uploadAndSave.isPending}
                    >
                      {uploadAndSave.isPending ? 'Salvando...' : 'Salvar certidão'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Documentos manuais */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
            Documentos manuais
          </p>
          {podeEditar && (
            <button
              onClick={() => setShowManual(!showManual)}
              className="flex items-center gap-1 text-[11px] text-accent-300 hover:text-accent-200 transition"
            >
              <Plus className="w-3 h-3" />
              {showManual ? 'Cancelar' : 'Adicionar documento'}
              {showManual ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {showManual && podeEditar && (
          <div className="bg-base-850/60 border border-accent-500/20 rounded-xl px-4 py-3 flex flex-col gap-3">
            <p className="text-[11px] text-accent-300 font-semibold">Novo documento manual</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nome do documento *</label>
                <input
                  type="text"
                  placeholder="Ex: Contrato Social, Atestado Técnico, CREA/CAU..."
                  value={manualForm.nome}
                  onChange={(e) => setManualForm({ ...manualForm, nome: e.target.value })}
                  className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Data de Emissão</label>
                <input type="date" value={manualForm.dataEmissao} onChange={(e) => setManualForm({ ...manualForm, dataEmissao: e.target.value })} className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 focus:border-accent-400 outline-none" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Validade (opcional)</label>
                <input type="date" value={manualForm.dataValidade} onChange={(e) => setManualForm({ ...manualForm, dataValidade: e.target.value })} className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 focus:border-accent-400 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Arquivo *</label>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} className="w-full text-[12px] text-base-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-accent-500 file:text-base-950 file:font-semibold file:text-[11px] hover:file:bg-accent-400 file:cursor-pointer" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowManual(false); setSelectedFile(null) }}>Cancelar</Button>
              <Button
                onClick={async () => {
                  if (!selectedFile || !manualForm.nome) return
                  await uploadAndSave.mutateAsync({
                    file: selectedFile, tipo: 'manual', nome: manualForm.nome,
                    dataEmissao: manualForm.dataEmissao || null, dataValidade: manualForm.dataValidade || null,
                  })
                  setShowManual(false); setSelectedFile(null)
                  setManualForm({ nome: '', dataEmissao: '', dataValidade: '', observacoes: '' })
                }}
                disabled={!selectedFile || !manualForm.nome || uploadAndSave.isPending}
              >
                {uploadAndSave.isPending ? 'Salvando...' : 'Salvar documento'}
              </Button>
            </div>
          </div>
        )}

        {/* Lista de documentos manuais */}
        {documents.filter((d) => d.tipo === 'manual').map((doc) => {
          const status = calcDocStatus(doc.dataValidade)
          const dias = diasRestantes(doc.dataValidade)
          return (
            <div key={doc.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
              <FileText className="w-4 h-4 text-base-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium text-base-200">{doc.nome}</span>
                  {doc.dataValidade && <StatusBadge status={status} />}
                </div>
                {doc.dataValidade ? (
                  <p className={`text-[11px] mt-0.5 ${dias !== null && dias <= 15 ? 'text-warning-400' : 'text-base-500'}`}>
                    Válido até {new Date(doc.dataValidade + 'T12:00:00').toLocaleDateString('pt-BR')}
                    {dias !== null && <span className="ml-1">({dias} dias)</span>}
                  </p>
                ) : (
                  <p className="text-[11px] text-base-500 mt-0.5">Sem data de validade</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {doc.storagePath && (
                  <button onClick={() => handleDownload(doc)} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
                {podeEditar && (
                  <button onClick={() => deleteDocument.mutate(doc)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {documents.filter((d) => d.tipo === 'manual').length === 0 && !showManual && (
          <p className="text-[12px] text-base-500 italic py-2">
            Nenhum documento manual cadastrado ainda. Adicione Contrato Social, Atestados Técnicos, CREA/CAU, etc.
          </p>
        )}
      </div>
    </div>
  )
}
