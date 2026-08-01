import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Globe, Plus, X, ChevronDown, ChevronRight, Upload, Eye, Trash2, Sparkles,
  Check, XCircle, ArrowRight, ExternalLink,
} from 'lucide-react'
import { Button, Input, Select } from '../ui/FormControls'
import { Card } from '../ui/Primitives'
import ErrorAlert from '../ui/ErrorAlert'
import ConfirmDialog from '../ui/ConfirmDialog'
import PdfViewerModal from '../ui/PdfViewerModal'
import { AnaliseEditalResumo } from '../shared/AnaliseEditalResumo'
import { AnaliseJuridicaTabs } from '../shared/AnaliseJuridicaTabs'
import { useOpportunities, calcOpportunityStatus, diasParaSessao } from '../../hooks/useOpportunities'
import { useOpportunityAnalysis } from '../../hooks/useOpportunityAnalysis'
import { useAnaliseJuridicaOportunidade, useLimparAnaliseJuridicaOportunidade } from '../../hooks/useAnaliseJuridicaOportunidade'
import type { TipoAnaliseJuridica } from '../../hooks/useAnaliseJuridicaEdital'
import { usePlatforms } from '../../hooks/usePlatforms'
import { useClients } from '../../hooks/useClients'
import { useAttachedFiles } from '../../hooks/useAttachedFiles'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import { mensagemDeErro } from '../../lib/errors'
import type { AnaliseEdital, Opportunity, OpportunityStatus } from '../../types/domain'

function StatusPill({ status, opportunity }: { status: OpportunityStatus; opportunity: Opportunity }) {
  if (status === 'resolvida') {
    return opportunity.resposta === 'aceita'
      ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-positive-500/15 text-positive-400 border-positive-500/30">Aceita</span>
      : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-negative-500/15 text-negative-400 border-negative-500/30">Recusada</span>
  }
  const dias = diasParaSessao(opportunity.dataSessao)
  const map: Record<'aguardando' | 'urgente' | 'vencida', string> = {
    aguardando: 'bg-base-700/40 text-base-400 border-base-700',
    urgente: 'bg-warning-500/15 text-warning-400 border-warning-500/30',
    vencida: 'bg-negative-500/15 text-negative-400 border-negative-500/30',
  }
  const label = status === 'vencida'
    ? 'Sessão passou sem resposta'
    : status === 'urgente'
      ? `Aguardando · ${dias! < 0 ? 'atrasada' : `vence em ${dias}d`}`
      : 'Aguardando resposta'
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${map[status as 'aguardando' | 'urgente' | 'vencida']}`}>{label}</span>
}

const FORM_VAZIO = {
  clientId: '',
  platformId: '',
  novaPlataformaNome: '',
  titulo: '',
  numeroEdital: '',
  dataSessao: '',
  dataEnvioCliente: '',
  diasAvisoPrazo: '7',
}

const NOVA_PLATAFORMA = '__nova__'

// Painel expandido de uma oportunidade: upload do edital/TR, análise por IA
// (a mesma de sempre — só rodando antes de existir uma licitação de
// verdade), registro da resposta do cliente e conversão em licitação.
function OportunidadeDetalhe({
  opportunity, podeEditar, onVisualizar,
}: {
  opportunity: Opportunity
  podeEditar: boolean
  onVisualizar: (nome: string, storagePath: string) => void
}) {
  const navigate = useNavigate()
  const { marcarResposta, deleteOpportunity, converterEmLicitacao, updateOpportunity } = useOpportunities()
  const { files, uploadFile, deleteFile } = useAttachedFiles('oportunidade', opportunity.id)
  const { analysis, analisar, travado, limparAnalise } = useOpportunityAnalysis(opportunity.id)
  const [tipoJuridicoAtivo, setTipoJuridicoAtivo] = useState<TipoAnaliseJuridica>('esclarecimento')
  const { analysis: analiseJuridica, analisar: analisarJuridica, travado: travadoJuridica } = useAnaliseJuridicaOportunidade(opportunity.id, tipoJuridicoAtivo)
  const { limpar: limparAnaliseJuridica } = useLimparAnaliseJuridicaOportunidade(opportunity.id)
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [mostrarRecusa, setMostrarRecusa] = useState(false)
  const [confirmandoConversao, setConfirmandoConversao] = useState(false)
  const [diasAviso, setDiasAviso] = useState(String(opportunity.diasAvisoPrazo))
  const [titulo, setTitulo] = useState(opportunity.titulo)
  const [erro, setErro] = useState<string | null>(null)

  const edital = files.find((f) => f.category === 'Edital')
  const tr = files.find((f) => f.category === 'Termo de Referência')
  const analise = (analysis?.analise ?? null) as AnaliseEdital | null
  const analiseProcessando = analysis?.status === 'processando' && !travado

  const handleSalvarDiasAviso = () => {
    const valor = parseInt(diasAviso, 10)
    if (Number.isNaN(valor) || valor === opportunity.diasAvisoPrazo) return
    updateOpportunity.mutate({ ...opportunity, diasAvisoPrazo: valor })
  }

  const handleSalvarTitulo = () => {
    const valor = titulo.trim()
    if (!valor || valor === opportunity.titulo) return
    updateOpportunity.mutate({ ...opportunity, titulo: valor })
  }

  // Quando a oportunidade nasce sem título (fluxo atual: pode salvar só com
  // cliente/plataforma, direto pro upload/análise do edital, sem precisar
  // resumir o objeto de antemão), assim que a IA identificar o objeto do
  // edital, ele vira o título automaticamente — nunca sobrescreve um título
  // já definido manualmente.
  useEffect(() => {
    if (analise?.objeto && !opportunity.titulo.trim() && !updateOpportunity.isPending) {
      updateOpportunity.mutate({ ...opportunity, titulo: analise.objeto })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analise?.objeto, opportunity.titulo])

  const handleExcluirEdital = () => {
    if (!edital) return
    deleteFile.mutate(edital, {
      onSuccess: () => {
        limparAnalise.mutate()
        limparAnaliseJuridica.mutate()
      },
    })
  }

  // Mantém o campo sincronizado se o título mudar por fora (ex: o
  // preenchimento automático a partir do objeto identificado pela IA,
  // acima) — ajuste durante a renderização, não em efeito (evita o
  // re-render em cascata de um setState dentro de useEffect).
  const [tituloBase, setTituloBase] = useState(opportunity.titulo)
  if (opportunity.titulo !== tituloBase) {
    setTituloBase(opportunity.titulo)
    setTitulo(opportunity.titulo)
  }

  const handleConverter = async () => {
    setErro(null)
    try {
      const { biddingId } = await converterEmLicitacao.mutateAsync(opportunity)
      navigate(`/licitacoes/${biddingId}`)
    } catch (err) {
      setErro(mensagemDeErro(err))
      setConfirmandoConversao(false)
    }
  }

  return (
    <div className="border-t border-base-800 px-4 py-3.5 flex flex-col gap-3.5 bg-base-900/30">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Título / Objeto</p>
        {podeEditar ? (
          <Input
            placeholder="Ex: Fornecimento de postes de madeira tratada"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={handleSalvarTitulo}
          />
        ) : (
          <p className="text-[13px] text-base-200">{opportunity.titulo || '(sem título)'}</p>
        )}
        {!opportunity.titulo.trim() && (
          <p className="text-[11px] text-base-500 italic mt-1">Sem título ainda — envie o edital e analise com IA abaixo pra preencher automaticamente, ou digite aqui.</p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Edital (PDF)</p>
          {edital ? (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onVisualizar(edital.name, edital.storagePath)} className="flex items-center gap-1 text-[11.5px] text-accent-300 hover:text-accent-200">
                <Eye className="w-3.5 h-3.5" /> Ver PDF
              </button>
              {podeEditar && (
                <button onClick={handleExcluirEdital} className="text-base-500 hover:text-negative-400"><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ) : podeEditar ? (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-2.5 py-1.5 cursor-pointer transition">
              <Upload className="w-3.5 h-3.5" /> Enviar
              <input type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile.mutate({ file: f, category: 'Edital' }); e.target.value = '' }} />
            </label>
          ) : <span className="text-[11px] text-base-500 italic">não enviado</span>}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Termo de Referência</p>
          {tr ? (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onVisualizar(tr.name, tr.storagePath)} className="flex items-center gap-1 text-[11.5px] text-accent-300 hover:text-accent-200">
                <Eye className="w-3.5 h-3.5" /> Ver PDF
              </button>
              {podeEditar && (
                <button onClick={() => deleteFile.mutate(tr)} className="text-base-500 hover:text-negative-400"><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ) : podeEditar ? (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-base-300 bg-base-800 hover:bg-base-700 rounded-lg px-2.5 py-1.5 cursor-pointer transition">
              <Upload className="w-3.5 h-3.5" /> Enviar
              <input type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile.mutate({ file: f, category: 'Termo de Referência' }); e.target.value = '' }} />
            </label>
          ) : <span className="text-[11px] text-base-500 italic">opcional, não enviado</span>}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Avisar com quantos dias</p>
          <div className="flex items-center gap-1.5">
            <Input type="number" min="0" value={diasAviso} onChange={(e) => setDiasAviso(e.target.value)} onBlur={handleSalvarDiasAviso} disabled={!podeEditar} className="w-16 py-1" />
            <span className="text-[11px] text-base-500">dias antes</span>
          </div>
        </div>
        <div className="flex items-end justify-end">
          {podeEditar && !opportunity.biddingId && (
            <button onClick={() => deleteOpportunity.mutate(opportunity)} className="flex items-center gap-1 text-[11px] text-base-500 hover:text-negative-400">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          )}
        </div>
      </div>

      {edital && podeEditar && (
        <div className="flex items-center justify-between bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-accent-400" />
            <span className="text-[12px] text-base-300">
              {analiseProcessando ? 'Analisando com IA...' : analise ? 'Análise disponível' : 'Ainda não analisado'}
            </span>
          </div>
          <Button variant="secondary" onClick={() => analisar.mutate()} disabled={analiseProcessando || analisar.isPending}>
            {analiseProcessando || analisar.isPending ? 'Analisando...' : analise ? 'Analisar novamente' : 'Analisar com IA'}
          </Button>
        </div>
      )}

      {travado && <p className="text-[11px] text-negative-400">A análise travou (demorou demais). Tenta "Analisar novamente".</p>}
      {analysis?.status === 'erro' && <p className="text-[11px] text-negative-400">Falha na análise: {analysis.erroMensagem}</p>}

      {analise && (
        <div className="border-t border-base-800/60 pt-3.5">
          <AnaliseEditalResumo analise={analise} />
        </div>
      )}

      <div className="border-t border-base-800/60 pt-3.5">
        <AnaliseJuridicaTabs
          temEdital={!!edital}
          tipoAtivo={tipoJuridicoAtivo}
          onTrocarTipo={setTipoJuridicoAtivo}
          analysis={analiseJuridica}
          analisar={analisarJuridica}
          travado={travadoJuridica}
        />
      </div>

      {erro && <p className="text-[11px] text-negative-400">{erro}</p>}

      <div className="flex items-center justify-between pt-1 border-t border-base-800/60">
        {opportunity.biddingId ? (
          <button onClick={() => navigate(`/licitacoes/${opportunity.biddingId}`)} className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-300 hover:text-accent-200">
            Ver licitação <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : opportunity.resposta === 'pendente' ? (
          podeEditar && (
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center gap-2">
                <Button onClick={() => marcarResposta.mutate({ opportunity, resposta: 'aceita' })} disabled={marcarResposta.isPending}>
                  <Check className="w-3.5 h-3.5" /> Cliente aceitou participar
                </Button>
                <Button variant="secondary" onClick={() => setMostrarRecusa((v) => !v)}>
                  <XCircle className="w-3.5 h-3.5" /> Cliente recusou
                </Button>
              </div>
              {mostrarRecusa && (
                <div className="flex items-center gap-2">
                  <Input placeholder="Motivo (opcional)" value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} />
                  <Button variant="secondary" onClick={() => marcarResposta.mutate({ opportunity, resposta: 'recusada', motivoRecusa })} disabled={marcarResposta.isPending}>
                    Confirmar recusa
                  </Button>
                </div>
              )}
            </div>
          )
        ) : opportunity.resposta === 'aceita' ? (
          podeEditar && (
            <div className="flex flex-col gap-1">
              <Button onClick={() => setConfirmandoConversao(true)} disabled={!analise && !opportunity.titulo.trim()}>
                <ArrowRight className="w-3.5 h-3.5" /> Converter em Licitação
              </Button>
              {!analise && !opportunity.titulo.trim() && (
                <p className="text-[11px] text-base-500 italic">Defina um título ou rode a análise de IA antes de converter.</p>
              )}
            </div>
          )
        ) : (
          <p className="text-[11.5px] text-base-500">
            Recusada{opportunity.motivoRecusa ? ` — ${opportunity.motivoRecusa}` : ''}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmandoConversao}
        title="Converter em Licitação"
        description={
          analise
            ? `Cria a licitação já preenchida com o que a IA identificou (objeto: "${analise.objeto ?? opportunity.titulo}"${analise.itens?.length ? `, ${analise.itens.length} itens` : ''}) e ela entra direto no Kanban, na etapa "Análise de Edital".`
            : `Não há uma análise de IA rodada ainda — a licitação vai nascer só com o título e o cliente desta oportunidade. Você pode rodar a análise antes de converter, ou preencher os dados depois na própria licitação.`
        }
        confirmLabel="Converter e ir pro Kanban"
        isLoading={converterEmLicitacao.isPending}
        onCancel={() => setConfirmandoConversao(false)}
        onConfirm={handleConverter}
      />
    </div>
  )
}

export default function OportunidadesPanel() {
  const { opportunities, isLoading, addOpportunity } = useOpportunities()
  const { platforms, addPlatform } = usePlatforms()
  const { clients } = useClients()
  const { nivel } = usePermissaoFerramenta('cadastros')
  const podeEditar = nivel === 'edicao'

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState(FORM_VAZIO)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [visualizando, setVisualizando] = useState<{ nome: string; url: string | null } | null>(null)
  const { getDownloadUrl } = useAttachedFiles('oportunidade')

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'
  const platformInfo = (id: string) => platforms.find((p) => p.id === id)

  const ordenadas = [...opportunities].sort((a, b) => {
    const statusA = calcOpportunityStatus(a)
    const statusB = calcOpportunityStatus(b)
    const peso = { vencida: 0, urgente: 1, aguardando: 2, resolvida: 3 }
    if (peso[statusA] !== peso[statusB]) return peso[statusA] - peso[statusB]
    const diasA = diasParaSessao(a.dataSessao) ?? Infinity
    const diasB = diasParaSessao(b.dataSessao) ?? Infinity
    return diasA - diasB
  })

  const handleVisualizar = async (nome: string, storagePath: string) => {
    setVisualizando({ nome, url: null })
    try {
      const url = await getDownloadUrl(storagePath)
      setVisualizando({ nome, url })
    } catch {
      setVisualizando(null)
    }
  }

  const handleSalvarNova = async () => {
    setErroForm(null)
    if (!form.clientId) return
    try {
      let platformId = form.platformId
      if (platformId === NOVA_PLATAFORMA) {
        if (!form.novaPlataformaNome.trim()) return
        platformId = await addPlatform.mutateAsync({ nome: form.novaPlataformaNome.trim() })
      }
      if (!platformId) return
      // Título é opcional aqui de propósito: o fluxo normal é enviar o
      // edital e analisar com IA já na sequência (linha recém-criada abre
      // sozinha, ver abaixo) — o objeto identificado pela IA vira o título
      // automaticamente (ver efeito em OportunidadeDetalhe). Sem isso, o
      // cadastro forçava resumir o objeto ANTES de sequer poder anexar o
      // edital, na ordem errada.
      const novaId = await addOpportunity.mutateAsync({
        clientId: form.clientId,
        platformId,
        titulo: form.titulo.trim(),
        numeroEdital: form.numeroEdital.trim() || null,
        dataSessao: form.dataSessao || null,
        dataEnvioCliente: form.dataEnvioCliente || null,
        diasAvisoPrazo: form.diasAvisoPrazo ? parseInt(form.diasAvisoPrazo, 10) : 7,
      })
      setMostrarForm(false)
      setForm(FORM_VAZIO)
      setExpandedId(novaId)
    } catch (err) {
      setErroForm(mensagemDeErro(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-base-100">Oportunidades</h3>
          <p className="text-[11px] text-base-500 mt-0.5">Editais mandados pro cliente avaliar, antes de virarem licitação de verdade</p>
        </div>
        {podeEditar && !mostrarForm && (
          <button onClick={() => setMostrarForm(true)} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
            <Plus className="w-3.5 h-3.5" /> Nova oportunidade
          </button>
        )}
      </div>

      {platforms.length > 0 && (
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Plataformas que participamos</p>
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 text-[11.5px] text-base-300 bg-base-850/60 border border-base-800 rounded-lg px-2.5 py-1.5">
                <Globe className="w-3 h-3 text-accent-400" /> {p.nome}
                {p.url && (
                  <a href={p.url.startsWith('http') ? p.url : `https://${p.url}`} target="_blank" rel="noreferrer" className="text-accent-400 hover:text-accent-300">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </span>
            ))}
          </div>
        </Card>
      )}

      <ErrorAlert error={addOpportunity.error} />

      {mostrarForm && podeEditar && (
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl px-4 py-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-accent-300 font-semibold">Nova oportunidade</p>
            <button onClick={() => { setMostrarForm(false); setForm(FORM_VAZIO) }} className="text-base-500 hover:text-base-300"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Cliente *</label>
              <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">— Selecione —</option>
                {clients.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Plataforma *</label>
              <Select value={form.platformId} onChange={(e) => setForm({ ...form, platformId: e.target.value })}>
                <option value="">— Selecione —</option>
                {platforms.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                <option value={NOVA_PLATAFORMA}>+ Nova plataforma...</option>
              </Select>
            </div>
          </div>
          {form.platformId === NOVA_PLATAFORMA && (
            <Input placeholder="Nome da nova plataforma" value={form.novaPlataformaNome} onChange={(e) => setForm({ ...form, novaPlataformaNome: e.target.value })} />
          )}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Título / objeto resumido</label>
            <Input placeholder="Opcional — pode deixar em branco e enviar o edital direto, a IA preenche depois de analisar" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nº Edital</label>
              <Input value={form.numeroEdital} onChange={(e) => setForm({ ...form, numeroEdital: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Data da sessão</label>
              <Input type="date" value={form.dataSessao} onChange={(e) => setForm({ ...form, dataSessao: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-accent-400 font-bold block mb-1">Avisar faltando quantos dias</label>
              <Input type="number" min="0" value={form.diasAvisoPrazo} onChange={(e) => setForm({ ...form, diasAvisoPrazo: e.target.value })} />
            </div>
          </div>
          {erroForm && <p className="text-[11px] text-negative-400">{erroForm}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setMostrarForm(false); setForm(FORM_VAZIO) }}>Cancelar</Button>
            <Button onClick={handleSalvarNova} disabled={!form.clientId || addOpportunity.isPending}>
              {addOpportunity.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
          <p className="text-[11px] text-base-500">Depois de salvar, a linha já abre pra você enviar o edital/TR e rodar a análise por IA.</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-[12px] text-base-500 italic py-2">Carregando...</p>
      ) : ordenadas.length === 0 ? (
        <p className="text-[12px] text-base-500 italic py-2">Nenhuma oportunidade cadastrada ainda.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {ordenadas.map((o) => {
            const status = calcOpportunityStatus(o)
            const aberto = expandedId === o.id
            const plataforma = platformInfo(o.platformId)
            return (
              <div key={o.id} className="bg-base-850/60 border border-base-800 rounded-lg overflow-hidden">
                <button onClick={() => setExpandedId(aberto ? null : o.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-base-850 transition">
                  {aberto ? <ChevronDown className="w-3.5 h-3.5 text-base-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-base-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-base-200 truncate">{clientName(o.clientId)} — {o.titulo || '(sem título)'}</p>
                    <p className="text-[11px] text-base-500 truncate">{plataforma?.nome ?? 'Plataforma removida'}{o.numeroEdital ? ` · Edital ${o.numeroEdital}` : ''}</p>
                  </div>
                  {o.dataSessao && (
                    <span className="text-[11px] font-mono text-base-400 shrink-0 hidden sm:inline">
                      {new Date(o.dataSessao + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  <StatusPill status={status} opportunity={o} />
                </button>
                {aberto && (
                  <OportunidadeDetalhe opportunity={o} podeEditar={podeEditar} onVisualizar={handleVisualizar} />
                )}
              </div>
            )
          })}
        </div>
      )}

      <PdfViewerModal open={!!visualizando} onClose={() => setVisualizando(null)} nome={visualizando?.nome ?? ''} url={visualizando?.url ?? null} />
    </div>
  )
}
