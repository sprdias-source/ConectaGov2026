import { useState, useMemo } from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle, Clock, Upload,
  Download, RefreshCw, Trash2, Plus, FileText, ChevronDown, ChevronUp, AlertCircle, X, Info,
  FolderOpen, Folder, FolderPlus, ChevronLeft, Award,
} from 'lucide-react'
import { Button, Input } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import { supabase } from '../../lib/supabase'
import { useClientDocuments, calcDocStatus, diasRestantes } from '../../hooks/useClientDocuments'
import { useAtestados } from '../../hooks/useAtestados'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import AcoesDocumentoManual from './AcoesDocumentoManual'
import { CERT_CONFIG } from '../../types/domain'
import type { ClientDocument, DocumentTipo, DocumentStatus, AtestadoTecnico } from '../../types/domain'

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

// Mapa de tipo de certidão → nome da Edge Function correspondente.
// 'cndt' aponta pra `disparar-robo-cndt` (dispara o robô no GitHub Actions,
// que vai gerar uma sessão de captcha pro usuário resolver no modal global)
// em vez de `buscar-cndt` (fluxo antigo via Browserless) — os outros 6
// continuam no Browserless até serem portados também.
const EDGE_FUNCTIONS: Record<Exclude<DocumentTipo, 'manual'>, string> = {
  cndt: 'disparar-robo-cndt',
  cnd_federal: 'buscar-cnd-federal',
  cnd_estadual_rs: 'buscar-cnd-estadual-rs',
  fgts: 'buscar-fgts',
  cnd_municipal: 'buscar-cnd-municipal-vacaria',
  certidao_falencia_rs: 'buscar-certidao-falencia-rs',
  cnpj_cartao: 'buscar-cnpj-cartao',
}

// Tipos que agora rodam via GitHub Actions — o retorno da Edge Function
// só confirma que o robô foi DISPARADO, não que já terminou. O resultado
// real chega minutos depois (captcha + automação), por isso mostramos um
// aviso diferente do erro, em vez de tratar como concluído.
const TIPOS_VIA_GITHUB_ACTIONS: Partial<Record<DocumentTipo, boolean>> = {
  cndt: true,
}

// Visão de "pasta" — cada tipo de certidão automática vira sua própria
// subpasta (uma certidão cada); documentos manuais agrupam pelo campo
// `pasta` (texto livre) que o usuário escolhe ao enviar — digitar um nome
// novo já "cria" a pasta, sem precisar de nenhum cadastro à parte.
function PastaDocumentos({
  documents, getDownloadUrl, uploadAndSave,
}: {
  documents: ClientDocument[]
  getDownloadUrl: (path: string) => Promise<string>
  uploadAndSave: (doc: {
    file: File
    tipo: DocumentTipo
    nome: string
    dataEmissao?: string | null
    dataValidade?: string | null
    observacoes?: string | null
    pasta?: string | null
  }) => Promise<unknown>
}) {
  const [pastaAberta, setPastaAberta] = useState<string | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [mostrarNovaPasta, setMostrarNovaPasta] = useState(false)
  const [novaPastaNome, setNovaPastaNome] = useState('')
  const [arquivoNovaPasta, setArquivoNovaPasta] = useState<File | null>(null)
  const [enviandoNovaPasta, setEnviandoNovaPasta] = useState(false)
  const [erroNovaPasta, setErroNovaPasta] = useState<string | null>(null)

  const arquivos = documents.filter((d) => d.storagePath)

  const pastas = useMemo(() => {
    const mapa = new Map<string, ClientDocument[]>()
    for (const doc of arquivos) {
      const nomePasta = doc.tipo === 'manual'
        ? (doc.pasta?.trim() || 'Documentos Gerais')
        : (CERT_CONFIG[doc.tipo]?.label.split(' — ')[0]?.trim() ?? doc.tipo)
      const lista = mapa.get(nomePasta) ?? []
      lista.push(doc)
      mapa.set(nomePasta, lista)
    }
    return Array.from(mapa.entries())
      .map(([nome, docs]) => ({ nome, docs }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [arquivos])

  const nomesPastasExistentes = useMemo(
    () => Array.from(new Set(documents.filter((d) => d.tipo === 'manual' && d.pasta).map((d) => d.pasta as string))),
    [documents]
  )

  const handleAbrir = async (doc: ClientDocument) => {
    if (!doc.storagePath) return
    setAbrindo(doc.id)
    try {
      const url = await getDownloadUrl(doc.storagePath)
      window.open(url, '_blank')
    } catch {
      alert('Não foi possível abrir esse documento.')
    } finally {
      setAbrindo(null)
    }
  }

  const handleCriarPastaEEnviar = async () => {
    if (!arquivoNovaPasta || !novaPastaNome.trim()) return
    setEnviandoNovaPasta(true)
    setErroNovaPasta(null)
    try {
      await uploadAndSave({
        file: arquivoNovaPasta,
        tipo: 'manual',
        nome: arquivoNovaPasta.name,
        pasta: novaPastaNome.trim(),
      })
      setMostrarNovaPasta(false)
      setNovaPastaNome('')
      setArquivoNovaPasta(null)
      setPastaAberta(novaPastaNome.trim())
    } catch (err) {
      setErroNovaPasta(String(err))
    } finally {
      setEnviandoNovaPasta(false)
    }
  }

  const formNovaPasta = (
    <div className="bg-base-900/40 border border-accent-500/20 rounded-xl p-3 flex flex-col gap-2">
      <p className="text-[11px] text-accent-300 font-semibold">Nova pasta + enviar documento</p>
      <input
        type="text"
        list="nomes-pastas-existentes"
        placeholder="Nome da pasta (nova ou existente)"
        value={novaPastaNome}
        onChange={(e) => setNovaPastaNome(e.target.value)}
        className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 outline-none"
      />
      <datalist id="nomes-pastas-existentes">
        {nomesPastasExistentes.map((p) => <option key={p} value={p} />)}
      </datalist>
      <input
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => setArquivoNovaPasta(e.target.files?.[0] ?? null)}
        className="w-full text-[12px] text-base-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-accent-500 file:text-base-950 file:font-semibold file:text-[11px] hover:file:bg-accent-400 file:cursor-pointer"
      />
      {erroNovaPasta && <p className="text-[11px] text-negative-400">{erroNovaPasta}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => { setMostrarNovaPasta(false); setNovaPastaNome(''); setArquivoNovaPasta(null) }}>Cancelar</Button>
        <Button onClick={handleCriarPastaEEnviar} disabled={!arquivoNovaPasta || !novaPastaNome.trim() || enviandoNovaPasta}>
          {enviandoNovaPasta ? 'Enviando...' : 'Criar Pasta e Enviar'}
        </Button>
      </div>
    </div>
  )

  if (arquivos.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-base-500 italic">
          Nenhum documento salvo ainda — assim que uma certidão for buscada ou um documento enviado, ele aparece aqui.
        </p>
        {mostrarNovaPasta ? formNovaPasta : (
          <button
            onClick={() => setMostrarNovaPasta(true)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-300 hover:text-accent-200 self-start"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Criar pasta e enviar documento
          </button>
        )}
      </div>
    )
  }

  // Nível 2 — dentro de uma pasta específica
  if (pastaAberta) {
    const pasta = pastas.find((p) => p.nome === pastaAberta)
    return (
      <div className="flex flex-col gap-3">
        <button
          onClick={() => setPastaAberta(null)}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-300 hover:text-accent-200 self-start"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Voltar pras pastas
        </button>
        <p className="text-[12px] font-bold text-base-200 flex items-center gap-1.5">
          <FolderOpen className="w-3.5 h-3.5 text-warning-400" /> {pastaAberta}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(pasta?.docs ?? []).map((doc) => (
            <button
              key={doc.id}
              onClick={() => handleAbrir(doc)}
              disabled={abrindo === doc.id}
              title={doc.nome}
              className="flex flex-col items-center gap-2 p-3 bg-base-850/60 border border-base-800 rounded-xl hover:border-accent-500/40 hover:bg-base-850 transition text-center disabled:opacity-50 disabled:cursor-wait"
            >
              <FileText className="w-7 h-7 text-accent-400 shrink-0" />
              <span className="text-[11px] font-medium text-base-200 truncate max-w-full w-full">{doc.nome}</span>
              {doc.dataValidade && (
                <span className="text-[10px] text-base-500">até {new Date(doc.dataValidade + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Nível 1 — lista de pastas
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {pastas.map((pasta) => (
          <button
            key={pasta.nome}
            onClick={() => setPastaAberta(pasta.nome)}
            title={pasta.nome}
            className="flex flex-col items-center gap-2 p-3 bg-base-850/60 border border-base-800 rounded-xl hover:border-accent-500/40 hover:bg-base-850 transition text-center"
          >
            <Folder className="w-8 h-8 text-warning-400 shrink-0" />
            <span className="text-[11px] font-medium text-base-200 truncate max-w-full w-full">{pasta.nome}</span>
            <span className="text-[10px] text-base-500">{pasta.docs.length} arquivo(s)</span>
          </button>
        ))}
        <button
          onClick={() => setMostrarNovaPasta((v) => !v)}
          className="flex flex-col items-center justify-center gap-2 p-3 bg-base-900/30 border border-dashed border-base-700 rounded-xl hover:border-accent-500/40 hover:bg-base-850/40 transition text-center"
        >
          <FolderPlus className="w-8 h-8 text-accent-400 shrink-0" />
          <span className="text-[11px] font-medium text-accent-300">Nova Pasta</span>
        </button>
      </div>
      {mostrarNovaPasta && formNovaPasta}
    </div>
  )
}

// Cadastro de Atestados de Capacidade Técnica do cliente — reutilizável em
// qualquer licitação futura. O campo "Objeto do Atestado" é o que
// alimenta o ranking de compatibilidade na tela da licitação.
function AtestadosTecnicosSection({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const { atestados, addAtestado, deleteAtestado, getDownloadUrl } = useAtestados(clientId)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', objeto: '', orgaoEmissor: '', valor: '', dataEmissao: '' })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)

  const handleAbrir = async (a: AtestadoTecnico) => {
    if (!a.storagePath) return
    setAbrindo(a.id)
    try {
      const url = await getDownloadUrl(a.storagePath)
      window.open(url, '_blank')
    } catch {
      alert('Não foi possível abrir o atestado.')
    } finally {
      setAbrindo(null)
    }
  }

  const handleSalvar = async () => {
    if (!form.nome.trim() || !form.objeto.trim()) return
    await addAtestado.mutateAsync({
      nome: form.nome.trim(),
      objeto: form.objeto.trim(),
      orgaoEmissor: form.orgaoEmissor.trim() || null,
      valor: form.valor ? parseFloat(form.valor) : null,
      dataEmissao: form.dataEmissao || null,
      file: arquivo,
    })
    setShowForm(false)
    setForm({ nome: '', objeto: '', orgaoEmissor: '', valor: '', dataEmissao: '' })
    setArquivo(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5" /> Atestados de Capacidade Técnica
        </p>
        {podeEditar && (
          <button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-1 text-[11px] text-accent-300 hover:text-accent-200 transition">
            <Plus className="w-3 h-3" /> {showForm ? 'Cancelar' : 'Adicionar atestado'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl px-4 py-3 flex flex-col gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nome / Identificação do Atestado *</label>
            <Input placeholder="Ex: Atestado nº 12/2023 — Prefeitura de X" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Objeto do Atestado * (usado pra comparar com o edital)</label>
            <textarea
              value={form.objeto}
              onChange={(e) => setForm({ ...form, objeto: e.target.value })}
              rows={2}
              placeholder="Ex: Coleta de resíduos sólidos domiciliares em área urbana"
              className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 placeholder:text-base-500 focus:border-accent-400 outline-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Órgão Emissor</label>
              <Input value={form.orgaoEmissor} onChange={(e) => setForm({ ...form, orgaoEmissor: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Valor (R$)</label>
              <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Data de Emissão</label>
              <Input type="date" value={form.dataEmissao} onChange={(e) => setForm({ ...form, dataEmissao: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Arquivo (opcional)</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="w-full text-[12px] text-base-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-accent-500 file:text-base-950 file:font-semibold file:text-[11px] hover:file:bg-accent-400 file:cursor-pointer"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={!form.nome.trim() || !form.objeto.trim() || addAtestado.isPending}>
              {addAtestado.isPending ? 'Salvando...' : 'Salvar Atestado'}
            </Button>
          </div>
        </div>
      )}

      {atestados.length === 0 ? (
        <p className="text-[12px] text-base-500 italic py-2">Nenhum atestado técnico cadastrado ainda.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {atestados.map((a) => (
            <div key={a.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
              <Award className="w-4 h-4 text-warning-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-base-200 truncate">{a.nome}</p>
                <p className="text-[11px] text-base-500 truncate">{a.objeto}</p>
              </div>
              {a.storagePath && (
                <button onClick={() => handleAbrir(a)} disabled={abrindo === a.id} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
              {podeEditar && (
                <button onClick={() => deleteAtestado.mutate(a)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HabilitacaoChecklist({ clientId, clientName, cnpj }: Props) {
  const { documents, uploadAndSave, deleteDocument, getDownloadUrl } = useClientDocuments(clientId)
  const { nivel: nivelCadastros } = usePermissaoFerramenta('cadastros')
  const podeEditar = nivelCadastros === 'edicao'
  const [buscando, setBuscando] = useState<DocumentTipo | null>(null)
  const [errosBusca, setErrosBusca] = useState<Partial<Record<DocumentTipo, string>>>({})
  const [avisosBusca, setAvisosBusca] = useState<Partial<Record<DocumentTipo, string>>>({})
  const [showPasta, setShowPasta] = useState(true)

  const handleBuscarAutomatico = async (tipo: Exclude<DocumentTipo, 'manual'>) => {
    if (!cnpj || !podeEditar) return
    setBuscando(tipo)
    setErrosBusca((prev) => { const n = { ...prev }; delete n[tipo]; return n })
    setAvisosBusca((prev) => { const n = { ...prev }; delete n[tipo]; return n })
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
      } else if (TIPOS_VIA_GITHUB_ACTIONS[tipo]) {
        setAvisosBusca((prev) => ({
          ...prev,
          [tipo]: 'Robô disparado! Isso roda em segundo plano e pode levar alguns minutos — quando o captcha aparecer, você será avisado numa tela pra digitar a resposta.',
        }))
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
    nome: string; dataEmissao: string; dataValidade: string; observacoes: string; pasta: string
  }>({ nome: '', dataEmissao: '', dataValidade: '', observacoes: '', pasta: '' })
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

      {/* Pasta de Documentos — visão de arquivos, pra abrir qualquer
          documento salvo a qualquer momento, sem depender do checklist */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setShowPasta((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-[10px] uppercase tracking-wider text-base-500 font-bold flex items-center gap-1.5">
            <FolderOpen className="w-3.5 h-3.5" /> Pasta de Documentos
          </span>
          {showPasta ? <ChevronUp className="w-3.5 h-3.5 text-base-500" /> : <ChevronDown className="w-3.5 h-3.5 text-base-500" />}
        </button>
        {showPasta && (
          <div className="bg-base-850/30 border border-base-800 rounded-xl p-4">
            <PastaDocumentos documents={documents} getDownloadUrl={getDownloadUrl} uploadAndSave={uploadAndSave.mutateAsync} />
          </div>
        )}
      </div>

      {/* Atestados de Capacidade Técnica — cadastro do cliente, reutilizado
          no ranking de compatibilidade de cada licitação */}
      <AtestadosTecnicosSection clientId={clientId} podeEditar={podeEditar} />

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
                      {buscando === tipo ? 'Disparando...' : 'Buscar auto'}
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

              {/* Aviso de disparo assíncrono (robôs via GitHub Actions) */}
              {avisosBusca[tipo] && (
                <div className="border-t border-base-800 px-4 py-2 bg-accent-500/5 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-accent-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-accent-300">{avisosBusca[tipo]}</p>
                  <button onClick={() => setAvisosBusca((p) => { const n = { ...p }; delete n[tipo]; return n })} className="ml-auto text-base-500 hover:text-base-300">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

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
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Pasta (opcional — digite uma existente ou um nome novo)</label>
                <input
                  type="text"
                  list="pastas-manuais-existentes"
                  placeholder="Ex: Documentação Societária, Atestados..."
                  value={manualForm.pasta}
                  onChange={(e) => setManualForm({ ...manualForm, pasta: e.target.value })}
                  className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 outline-none"
                />
                <datalist id="pastas-manuais-existentes">
                  {Array.from(new Set(documents.filter((d) => d.tipo === 'manual' && d.pasta).map((d) => d.pasta as string))).map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
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
                    pasta: manualForm.pasta.trim() || null,
                  })
                  setShowManual(false); setSelectedFile(null)
                  setManualForm({ nome: '', dataEmissao: '', dataValidade: '', observacoes: '', pasta: '' })
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
