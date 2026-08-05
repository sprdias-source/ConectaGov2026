import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, X, ChevronDown, ChevronRight, ExternalLink, Trash2, Check, Download,
  Eye, ArrowRight, Clock, Bot,
} from 'lucide-react'
import { Button, Input, Select } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import ConfirmDialog from '../ui/ConfirmDialog'
import PdfViewerModal from '../ui/PdfViewerModal'
import { useLicitaiEditais } from '../../hooks/useLicitaiEditais'
import { useDispararRoboLicitei } from '../../hooks/useDispararRoboLicitei'
import LicitaiBuscasPanel from './LicitaiBuscasPanel'
import { useClients } from '../../hooks/useClients'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import { supabase } from '../../lib/supabase'
import { mensagemDeErro } from '../../lib/errors'
import type { LicitaiEdital, LicitaiEditalStatus } from '../../types/domain'

const STATUS_INFO: Record<LicitaiEditalStatus, { label: string; cls: string }> = {
  novo: { label: 'Novo', cls: 'bg-base-700/40 text-base-400 border-base-700' },
  linkado: { label: 'Linkado', cls: 'bg-accent-500/15 text-accent-300 border-accent-500/30' },
  oportunidade: { label: 'Em Oportunidades', cls: 'bg-warning-500/15 text-warning-400 border-warning-500/30' },
  aceito: { label: 'Virou Licitação', cls: 'bg-positive-500/15 text-positive-400 border-positive-500/30' },
  recusado: { label: 'Recusado', cls: 'bg-negative-500/15 text-negative-400 border-negative-500/30' },
}

function StatusPill({ status }: { status: LicitaiEditalStatus }) {
  const info = STATUS_INFO[status]
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${info.cls}`}>{info.label}</span>
}

const FORM_VAZIO = {
  numeroEdital: '',
  orgao: '',
  objeto: '',
  modalidade: '',
  dataSessao: '',
  linkLicitei: '',
}

function EditalDetalhe({ edital, podeEditar, onVisualizar }: {
  edital: LicitaiEdital
  podeEditar: boolean
  onVisualizar: (nome: string, storagePath: string) => void
}) {
  const navigate = useNavigate()
  const { clients } = useClients()
  const { linkarCliente, deleteLicitaiEdital, enviarParaOportunidades } = useLicitaiEditais()
  const { disparar, disparando, erro: erroRobo, aviso: avisoRobo } = useDispararRoboLicitei()
  const [clientIdSelecionado, setClientIdSelecionado] = useState(edital.clientId ?? '')
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const cliente = clients.find((c) => c.id === edital.clientId)

  const handleLinkar = () => {
    if (!clientIdSelecionado) return
    setErro(null)
    linkarCliente.mutate({ edital, clientId: clientIdSelecionado }, { onError: (err) => setErro(mensagemDeErro(err)) })
  }

  const handleEnviar = () => {
    setErro(null)
    enviarParaOportunidades.mutate(edital, { onError: (err) => setErro(mensagemDeErro(err)) })
  }

  const podeEnviar = !!edital.clientId && !!edital.editalStoragePath && edital.status === 'linkado'

  return (
    <div className="border-t border-base-800 px-4 py-3.5 flex flex-col gap-3.5 bg-base-900/30">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
        {edital.orgao && <div className="bg-base-850/60 border border-base-800 rounded-lg px-2.5 py-2"><p className="text-[9.5px] uppercase text-base-500 font-bold mb-0.5">Órgão</p><p className="text-base-200 truncate">{edital.orgao}</p></div>}
        {edital.modalidade && <div className="bg-base-850/60 border border-base-800 rounded-lg px-2.5 py-2"><p className="text-[9.5px] uppercase text-base-500 font-bold mb-0.5">Modalidade</p><p className="text-base-200 truncate">{edital.modalidade}</p></div>}
        {edital.dataSessao && <div className="bg-base-850/60 border border-base-800 rounded-lg px-2.5 py-2"><p className="text-[9.5px] uppercase text-base-500 font-bold mb-0.5">Sessão</p><p className="text-base-200">{new Date(edital.dataSessao + 'T12:00:00').toLocaleDateString('pt-BR')}</p></div>}
        {edital.linkLicitei && (
          <div className="bg-base-850/60 border border-base-800 rounded-lg px-2.5 py-2">
            <p className="text-[9.5px] uppercase text-base-500 font-bold mb-0.5">Link Licitei</p>
            <a href={edital.linkLicitei} target="_blank" rel="noreferrer" className="text-accent-300 hover:text-accent-200 flex items-center gap-1 truncate">
              Abrir <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Cliente</p>
        {edital.clientId ? (
          <p className="text-[13px] text-base-200">{cliente?.name ?? 'Cliente removido'}</p>
        ) : podeEditar ? (
          <div className="flex items-center gap-2">
            <Select value={clientIdSelecionado} onChange={(e) => setClientIdSelecionado(e.target.value)} className="max-w-xs">
              <option value="">— Selecione um cliente —</option>
              {clients.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button variant="secondary" onClick={handleLinkar} disabled={!clientIdSelecionado || linkarCliente.isPending}>
              {linkarCliente.isPending ? 'Linkando...' : 'Linkar Cliente'}
            </Button>
          </div>
        ) : (
          <p className="text-[12px] text-base-500 italic">Nenhum cliente vinculado ainda.</p>
        )}
      </div>

      <div className="flex items-center justify-between bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
        <div className="flex items-center gap-2">
          {edital.editalStoragePath ? (
            <>
              <Check className="w-3.5 h-3.5 text-positive-400" />
              <span className="text-[12px] text-base-300">Edital baixado</span>
            </>
          ) : (
            <>
              <Bot className="w-3.5 h-3.5 text-base-500" />
              <span className="text-[12px] text-base-500">Edital ainda não baixado</span>
            </>
          )}
        </div>
        {edital.editalStoragePath ? (
          <button
            onClick={() => onVisualizar(edital.numeroEdital ? `Edital ${edital.numeroEdital}.pdf` : 'Edital.pdf', edital.editalStoragePath!)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-300 hover:text-accent-200"
          >
            <Eye className="w-3.5 h-3.5" /> Ver PDF
          </button>
        ) : (
          podeEditar && (
            <span title={edital.clientId ? undefined : 'Linke um cliente antes de baixar o edital'}>
              <Button
                variant="secondary"
                onClick={() => disparar({ modo: 'baixar_edital', editalId: edital.id })}
                disabled={!edital.clientId || disparando}
              >
                <Download className="w-3.5 h-3.5" /> {disparando ? 'Disparando...' : 'Baixar Edital'}
              </Button>
            </span>
          )
        )}
      </div>

      {erroRobo && <p className="text-[11px] text-negative-400">Não consegui disparar o robô: {erroRobo}</p>}
      {avisoRobo && <p className="text-[11px] text-accent-300">{avisoRobo}</p>}
      {erro && <p className="text-[11px] text-negative-400">{erro}</p>}

      <div className="flex items-center justify-between pt-1 border-t border-base-800/60">
        {edital.status === 'novo' || edital.status === 'linkado' ? (
          podeEditar && (
            <div className="flex flex-col gap-1">
              <Button onClick={handleEnviar} disabled={!podeEnviar || enviarParaOportunidades.isPending}>
                <ArrowRight className="w-3.5 h-3.5" /> {enviarParaOportunidades.isPending ? 'Enviando...' : 'Enviar pra Oportunidades'}
              </Button>
              {!podeEnviar && (
                <p className="text-[11px] text-base-500 italic">
                  {!edital.clientId ? 'Linke um cliente primeiro.' : !edital.editalStoragePath ? 'Aguardando o robô baixar o edital.' : ''}
                </p>
              )}
            </div>
          )
        ) : edital.status === 'oportunidade' ? (
          <p className="text-[12px] text-base-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Enviado — acompanhe o aceite/recusa na aba Oportunidades.</p>
        ) : edital.status === 'aceito' ? (
          <button onClick={() => navigate(`/licitacoes/${edital.biddingId}`)} className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-300 hover:text-accent-200">
            Ver licitação <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <p className="text-[12px] text-base-500">Cliente recusou este edital.</p>
        )}

        {podeEditar && edital.status === 'novo' && (
          <button onClick={() => setConfirmandoExclusao(true)} className="flex items-center gap-1 text-[11px] text-base-500 hover:text-negative-400">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmandoExclusao}
        title="Excluir Edital"
        description="Remove este edital da lista de Editais Licitei. Não pode ser desfeito."
        confirmLabel="Excluir"
        danger
        isLoading={deleteLicitaiEdital.isPending}
        onCancel={() => setConfirmandoExclusao(false)}
        onConfirm={() => deleteLicitaiEdital.mutate(edital, { onSuccess: () => setConfirmandoExclusao(false) })}
      />
    </div>
  )
}

const FILTROS: { value: LicitaiEditalStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'novo', label: 'Novo' },
  { value: 'linkado', label: 'Linkado' },
  { value: 'oportunidade', label: 'Em Oportunidades' },
  { value: 'aceito', label: 'Virou Licitação' },
  { value: 'recusado', label: 'Recusado' },
]

export default function LicitaiEditaisPanel() {
  const { licitaiEditais, isLoading, addLicitaiEdital } = useLicitaiEditais()
  const { nivel } = usePermissaoFerramenta('cadastros')
  const podeEditar = nivel === 'edicao'

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<LicitaiEditalStatus | 'todos'>('todos')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [visualizando, setVisualizando] = useState<{ nome: string; url: string | null } | null>(null)

  const filtrados = filtro === 'todos' ? licitaiEditais : licitaiEditais.filter((e) => e.status === filtro)

  const handleVisualizar = async (nome: string, storagePath: string) => {
    setVisualizando({ nome, url: null })
    try {
      const { data, error } = await supabase.storage.from('client-documents').createSignedUrl(storagePath, 60 * 10)
      if (error) throw error
      setVisualizando({ nome, url: data.signedUrl })
    } catch {
      setVisualizando(null)
    }
  }

  const handleSalvarNovo = async () => {
    setErroForm(null)
    if (!form.numeroEdital.trim() && !form.objeto.trim()) {
      setErroForm('Preencha ao menos o número do edital ou o objeto.')
      return
    }
    try {
      await addLicitaiEdital.mutateAsync({
        numeroEdital: form.numeroEdital.trim() || null,
        orgao: form.orgao.trim() || null,
        objeto: form.objeto.trim() || null,
        modalidade: form.modalidade.trim() || null,
        dataSessao: form.dataSessao || null,
        linkLicitei: form.linkLicitei.trim() || null,
      })
      setMostrarForm(false)
      setForm(FORM_VAZIO)
    } catch (err) {
      setErroForm(mensagemDeErro(err))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-base-850/30 border border-base-800 rounded-xl p-4">
        <LicitaiBuscasPanel podeEditar={podeEditar} />
      </div>

      <div className="flex flex-col gap-4 border-t border-base-800 pt-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-base-100">Editais Licitei</h3>
          <p className="text-[11px] text-base-500 mt-0.5">
            Editais trazidos de uma busca no Licitei — linke a um cliente, baixe o PDF e envie pra Oportunidades
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value as LicitaiEditalStatus | 'todos')} className="text-[12px] py-1.5">
            {FILTROS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
          {podeEditar && !mostrarForm && (
            <button onClick={() => setMostrarForm(true)} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
              <Plus className="w-3.5 h-3.5" /> Adicionar manualmente
            </button>
          )}
        </div>
      </div>

      <div className="bg-base-850/40 border border-base-800 rounded-lg px-3 py-2.5 flex items-start gap-2">
        <Bot className="w-3.5 h-3.5 text-base-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-base-500">
          O robô roda em segundo plano no GitHub Actions e pode levar alguns minutos — use "Rodar Busca" numa busca salva acima, ou cadastre um edital manualmente com "Adicionar manualmente".
        </p>
      </div>

      <ErrorAlert error={addLicitaiEdital.error} />

      {mostrarForm && podeEditar && (
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl px-4 py-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-accent-300 font-semibold">Adicionar edital manualmente</p>
            <button onClick={() => { setMostrarForm(false); setForm(FORM_VAZIO) }} className="text-base-500 hover:text-base-300"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nº Edital</label>
              <Input value={form.numeroEdital} onChange={(e) => setForm({ ...form, numeroEdital: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Órgão</label>
              <Input value={form.orgao} onChange={(e) => setForm({ ...form, orgao: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Objeto</label>
            <Input value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Modalidade</label>
              <Input value={form.modalidade} onChange={(e) => setForm({ ...form, modalidade: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Data da sessão</label>
              <Input type="date" value={form.dataSessao} onChange={(e) => setForm({ ...form, dataSessao: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Link Licitei</label>
              <Input value={form.linkLicitei} onChange={(e) => setForm({ ...form, linkLicitei: e.target.value })} />
            </div>
          </div>
          {erroForm && <p className="text-[11px] text-negative-400">{erroForm}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setMostrarForm(false); setForm(FORM_VAZIO) }}>Cancelar</Button>
            <Button onClick={handleSalvarNovo} disabled={addLicitaiEdital.isPending}>
              {addLicitaiEdital.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-[12px] text-base-500 italic py-2">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-[12px] text-base-500 italic py-2">Nenhum edital {filtro !== 'todos' ? `com status "${STATUS_INFO[filtro as LicitaiEditalStatus].label}"` : 'cadastrado ainda'}.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filtrados.map((e) => {
            const aberto = expandedId === e.id
            return (
              <div key={e.id} className="bg-base-850/60 border border-base-800 rounded-lg overflow-hidden">
                <button onClick={() => setExpandedId(aberto ? null : e.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-base-850 transition">
                  {aberto ? <ChevronDown className="w-3.5 h-3.5 text-base-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-base-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-base-200 truncate">
                      {e.numeroEdital ? `Edital ${e.numeroEdital}` : 'Sem número'}{e.objeto ? ` — ${e.objeto}` : ''}
                    </p>
                    <p className="text-[11px] text-base-500 truncate">{e.orgao ?? 'Órgão não informado'}</p>
                  </div>
                  {e.dataSessao && (
                    <span className="text-[11px] font-mono text-base-400 shrink-0 hidden sm:inline">
                      {new Date(e.dataSessao + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  <StatusPill status={e.status} />
                </button>
                {aberto && (
                  <EditalDetalhe edital={e} podeEditar={podeEditar} onVisualizar={handleVisualizar} />
                )}
              </div>
            )
          })}
        </div>
      )}

      <PdfViewerModal open={!!visualizando} onClose={() => setVisualizando(null)} nome={visualizando?.nome ?? ''} url={visualizando?.url ?? null} />
      </div>
    </div>
  )
}
