import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, FileText, Upload, Plus, Trash2, CheckCircle2, Circle, Download, Eye,
  AlertCircle, Loader2, Sparkles, Award, Check, History, ChevronDown, ChevronUp,
  ClipboardList, Gavel, Wallet, Send, CircleDot, FileSignature, Info, Activity, RefreshCw, Wand2,
  HelpCircle, Scale, ScanSearch, Paperclip, FolderDown, X, FileSpreadsheet,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromBiddingItemRow, toBiddingItemInsert } from '../lib/mappers'
import { useAuth } from '../hooks/useAuth'
import { Button, Input, Select } from '../components/ui/FormControls'
import { PageHeader, Card } from '../components/ui/Primitives'
import { SkeletonTableRows, SkeletonList } from '../components/ui/Skeleton'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import PdfViewerModal from '../components/ui/PdfViewerModal'
import { formatBRL } from '../hooks/useAccountBalances'
import { useAttachedFiles } from '../hooks/useAttachedFiles'
import { useBiddingChecklist, calcularHabilitacao, statusItemChecklist, arquivoResolvidoDoItem } from '../hooks/useBiddingChecklist'
import { useBuscaCertidaoAutomatica } from '../hooks/useBuscaCertidaoAutomatica'
import AcoesDocumentoManual from '../components/documentos/AcoesDocumentoManual'
import DownloadDocumentosModal from '../components/licitacao/DownloadDocumentosModal'
import { useBiddingAnalysis } from '../hooks/useBiddingAnalysis'
import { useAnaliseJuridicaEdital, useLimparAnaliseJuridica } from '../hooks/useAnaliseJuridicaEdital'
import type { TipoAnaliseJuridica, PontoAnaliseJuridica } from '../hooks/useAnaliseJuridicaEdital'
import { useBiddingItems } from '../hooks/useBiddingItems'
import { useBiddingItemVersions } from '../hooks/useBiddingItemVersions'
import { useClientDocuments } from '../hooks/useClientDocuments'
import { useAtestados, calcularSimilaridade } from '../hooks/useAtestados'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import BiddingItemsEditor from '../components/cadastros/BiddingItemsEditor'
import { stringifyCsvPortal, textoParaBlobLatin1, formatarNumeroPtBR, HEADER_PORTAL_COMPRAS } from '../lib/csvPortalCompras'
import { parseFlexibleNumber } from '../lib/numberParsing'
import { useToast } from '../hooks/useToast'
import { CERT_CONFIG } from '../types/domain'
import type { Bidding, BiddingChecklistItem, BiddingEtapa, BiddingItem, BiddingModalidade, BiddingStatus } from '../types/domain'

const ETAPAS_TRILHA: BiddingEtapa[] = [
  'Análise de Edital',
  'Montagem de Documentação',
  'Proposta Enviada',
  'Disputa de Lances',
  'Fase Recursal',
  'Adjudicada e Homologada',
]

const CATEGORIAS_CHECKLIST = [
  'Habilitação Jurídica',
  'Regularidade Fiscal e Trabalhista',
  'Qualificação Econômico-Financeira',
  'Qualificação Técnica',
  'Proposta',
  'Outro',
]

const ABAS = [
  { key: 'visao', label: 'Visão Geral', icon: Gavel },
  { key: 'edital', label: 'Edital & Análise', icon: FileText },
  { key: 'checklist', label: 'Checklist & Habilitação', icon: ClipboardList },
  { key: 'proposta-inicial', label: 'Cadastrar Proposta', icon: FileSpreadsheet },
  { key: 'proposta', label: 'Proposta Readequada', icon: Wallet },
  { key: 'documentos', label: 'Documentos Finais', icon: FileSignature },
  { key: 'sessao', label: 'Sessão Ao Vivo', icon: Activity },
] as const
type AbaKey = typeof ABAS[number]['key']

// Busca os itens da licitação direto (não existia hook próprio pra isso —
// os itens só eram lidos como parte do formulário de edição). Fica local
// aqui porque é uso específico desta página (rateio da proposta).
function useBiddingItemsDaLicitacao(biddingId?: string) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['bidding_items', biddingId],
    enabled: !!user && !!biddingId,
    queryFn: async () => {
      const { data, error } = await supabase.from('bidding_items').select('*').eq('bidding_id', biddingId!).order('numero_item')
      if (error) throw error
      return data.map(fromBiddingItemRow)
    },
  })

  // Salva o resultado de um rateio: tira uma "foto" dos itens como estavam
  // (mesmo padrão do snapshot automático em useBiddings.ts), aplica os
  // valores novos, e opcionalmente já marca essa versão como a enviada.
  const salvarRateio = useMutation({
    mutationFn: async ({ novosValoresTotais, observacao, marcarEnviada }: { novosValoresTotais: Record<string, number>; observacao: string; marcarEnviada: boolean }) => {
      if (!user || !biddingId) throw new Error('Dados insuficientes')

      const { data: itensAtuais, error: itensError } = await supabase.from('bidding_items').select('*').eq('bidding_id', biddingId)
      if (itensError) throw itensError

      const { data: ultimaVersao } = await supabase
        .from('bidding_items_versions')
        .select('versao')
        .eq('bidding_id', biddingId)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle()
      const proximaVersao = (ultimaVersao?.versao ?? 0) + 1

      const { data: novaVersaoRow, error: snapError } = await supabase
        .from('bidding_items_versions')
        .insert({
          user_id: user.id,
          bidding_id: biddingId,
          versao: proximaVersao,
          itens_snapshot: itensAtuais ?? [],
          alterado_por_email: user.email ?? null,
          observacao: observacao || 'Rateio da proposta readequada',
          enviada: marcarEnviada,
        })
        .select()
        .single()
      if (snapError) throw snapError

      if (marcarEnviada) {
        await supabase
          .from('bidding_items_versions')
          .update({ enviada: false })
          .eq('bidding_id', biddingId)
          .eq('enviada', true)
          .neq('id', novaVersaoRow.id)
      }

      for (const [itemId, valorTotal] of Object.entries(novosValoresTotais)) {
        const item = (itensAtuais ?? []).find((i: { id: string }) => i.id === itemId)
        if (!item) continue
        const valorUnitario = item.quantidade > 0 ? valorTotal / item.quantidade : 0
        await supabase.from('bidding_items').update({ valor_unitario_ofertado: valorUnitario }).eq('id', itemId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bidding_items', biddingId] })
      queryClient.invalidateQueries({ queryKey: ['bidding_items_versions', biddingId] })
      queryClient.invalidateQueries({ queryKey: ['biddings'] })
    },
  })

  // Sincroniza a lista de itens inteira (usada pelo editor completo — Nº,
  // Descrição, Unid., Qtd., Marca, Modelo, valores e Ganhou? — reaproveitado
  // aqui no Kanban, plano B pra quando a importação automática do edital
  // falhar ou vier incompleta). Diferente de Cadastros, que apaga tudo e
  // reinsere ao salvar o formulário inteiro de uma vez, aqui não existe um
  // botão de "Salvar" — cada mudança precisa ir sozinha pro banco (ver
  // handleItemsChange, que debounça e chama isto). Por isso o sincronismo
  // é por diff (insere só o que é novo, atualiza só o que mudou, apaga só o
  // que sumiu) em vez de apagar tudo — apagar tudo a cada poucos segundos
  // arriscaria a licitação ficar momentaneamente sem nenhum item se uma
  // sincronização caísse no meio.
  const sincronizarItens = useMutation({
    mutationFn: async (novosItems: Partial<BiddingItem>[]) => {
      if (!user || !biddingId) throw new Error('Dados insuficientes')
      const { data: itensAtuaisRows, error: fetchError } = await supabase.from('bidding_items').select('*').eq('bidding_id', biddingId)
      if (fetchError) throw fetchError
      const itensAtuais = (itensAtuaisRows ?? []).map(fromBiddingItemRow)
      const atuaisPorId = new Map(itensAtuais.map((i) => [i.id, i]))
      const idsNovos = new Set(novosItems.filter((i) => i.id).map((i) => i.id as string))

      const paraExcluir = itensAtuais.filter((i) => !idsNovos.has(i.id))
      if (paraExcluir.length > 0) {
        const { error } = await supabase.from('bidding_items').delete().in('id', paraExcluir.map((i) => i.id))
        if (error) throw error
      }

      for (const novo of novosItems) {
        if (!novo.id) continue
        const original = atuaisPorId.get(novo.id)
        if (!original) continue
        const mudou = novo.numeroItem !== original.numeroItem
          || novo.descricao !== original.descricao
          || (novo.unidade ?? null) !== (original.unidade ?? null)
          || novo.quantidade !== original.quantidade
          || (novo.marca ?? null) !== (original.marca ?? null)
          || (novo.referencia ?? null) !== (original.referencia ?? null)
          || novo.valorUnitarioLicitado !== original.valorUnitarioLicitado
          || (novo.valorUnitarioOfertado ?? null) !== (original.valorUnitarioOfertado ?? null)
          || (novo.ganhou ?? false) !== original.ganhou
        if (!mudou) continue
        const { error } = await supabase.from('bidding_items').update({
          numero_item: novo.numeroItem ?? '',
          descricao: novo.descricao ?? '',
          unidade: novo.unidade ?? null,
          quantidade: novo.quantidade ?? 0,
          marca: novo.marca ?? null,
          referencia: novo.referencia ?? null,
          valor_unitario_licitado: novo.valorUnitarioLicitado ?? 0,
          valor_unitario_ofertado: novo.valorUnitarioOfertado ?? null,
          ganhou: novo.ganhou ?? false,
        }).eq('id', novo.id)
        if (error) throw error
      }

      const paraInserir = novosItems.filter((i) => !i.id)
      if (paraInserir.length > 0) {
        const rows = paraInserir.map((i) => toBiddingItemInsert({ ...i, biddingId }, user.id))
        const { error } = await supabase.from('bidding_items').insert(rows)
        if (error) throw error
      }

      // Só precisa reconsultar quando algo foi inserido — as linhas novas
      // não tinham "id" ainda no editor, e o próximo diff (próxima edição)
      // precisa desse id de verdade pra saber que a linha já existe (senão
      // seria inserida de novo). Atualizações/exclusões não mudam o
      // conjunto de ids, então o estado local do editor já está correto
      // sem precisar buscar de novo — evita resetar o que o usuário está
      // digitando no meio de uma sincronização em segundo plano.
      return { precisaResincronizar: paraInserir.length > 0 }
    },
    onSuccess: ({ precisaResincronizar }) => {
      if (precisaResincronizar) queryClient.invalidateQueries({ queryKey: ['bidding_items', biddingId] })
    },
  })

  return { items: query.data ?? [], isLoading: query.isLoading, salvarRateio, sincronizarItens }
}

// Rateio pelo método do "maior resto": distribui o valor final proporcional
// ao peso de cada item, e joga a diferença de arredondamento (sempre
// existe, trabalhando em centavos) nos itens com maior parte fracionária —
// garante que a soma bate EXATO com o valor informado, nunca sobra 1
// centavo perdido.
function calcularRateio(items: BiddingItem[], valorFinal: number, pesos: Record<string, number>): Record<string, number> {
  const totalCentavosFinal = Math.round(valorFinal * 100)
  const exatos = items.map((i) => ({ id: i.id, exato: (pesos[i.id] ?? 0) * totalCentavosFinal }))
  const base = exatos.map((v) => ({ id: v.id, centavos: Math.floor(v.exato), resto: v.exato - Math.floor(v.exato) }))
  const totalBase = base.reduce((s, b) => s + b.centavos, 0)
  let sobra = totalCentavosFinal - totalBase

  const ordenado = [...base].sort((a, b) => b.resto - a.resto)
  for (let i = 0; i < ordenado.length && sobra > 0; i++) {
    ordenado[i].centavos += 1
    sobra--
  }

  const porId: Record<string, number> = {}
  ordenado.forEach((o) => { porId[o.id] = o.centavos / 100 })
  return porId
}

function EtapaTrilha({ etapaAtual, onMudar, atualizando, podeEditar }: {
  etapaAtual: BiddingEtapa | null
  onMudar: (etapa: BiddingEtapa) => void
  atualizando: boolean
  podeEditar: boolean
}) {
  const indiceAtual = etapaAtual ? ETAPAS_TRILHA.indexOf(etapaAtual) : -1
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {ETAPAS_TRILHA.map((etapa, idx) => {
        const concluida = idx < indiceAtual
        const atual = idx === indiceAtual
        return (
          <div key={etapa} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onMudar(etapa)}
              disabled={atualizando || !podeEditar}
              title={etapa}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition border whitespace-nowrap disabled:opacity-50 ${podeEditar ? '' : 'cursor-default'} ${
                atual
                  ? 'bg-accent-500 text-base-950 border-accent-500'
                  : concluida
                  ? 'bg-positive-500/15 text-positive-400 border-positive-500/30 hover:bg-positive-500/25'
                  : 'bg-base-850/60 text-base-500 border-base-700 hover:text-base-300'
              }`}
            >
              {concluida && <Check className="w-3 h-3" />}
              {etapa}
            </button>
            {idx < ETAPAS_TRILHA.length - 1 && (
              <div className={`w-3 h-px shrink-0 ${concluida ? 'bg-positive-500/40' : 'bg-base-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ResultadoLicitacao({ bidding }: { bidding: Bidding }) {
  const { marcarResultado } = useBiddings()
  const { nivel } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao'
  const [status, setStatus] = useState<BiddingStatus>(bidding.status)
  const [motivo, setMotivo] = useState(bidding.motivoPerda ?? '')

  const mudou = status !== bidding.status || (status === 'Perdeu' && motivo !== (bidding.motivoPerda ?? ''))

  if (!podeEditar) {
    return (
      <div className="text-[12px] text-base-500">
        Resultado: <span className="font-semibold text-base-300">{bidding.status}</span>
        {bidding.motivoPerda && <span> — {bidding.motivoPerda}</span>}
      </div>
    )
  }

  return (
    <div className="bg-base-850/60 border border-base-800 rounded-xl p-4 flex flex-col gap-3">
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Resultado da Licitação</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select value={status} onChange={(e) => setStatus(e.target.value as BiddingStatus)}>
            <option value="Em Andamento">Em Andamento</option>
            <option value="Ganhou">Ganhou</option>
            <option value="Perdeu">Perdeu</option>
            <option value="Cancelada">Cancelada</option>
          </Select>
        </div>
        {status === 'Perdeu' && (
          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Motivo da perda (preço, documentação, desclassificação técnica...)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        )}
        <Button
          onClick={() => marcarResultado.mutate({ biddingId: bidding.id, status, motivoPerda: motivo })}
          disabled={!mudou || marcarResultado.isPending}
        >
          {marcarResultado.isPending ? 'Salvando...' : 'Salvar Resultado'}
        </Button>
      </div>
      <p className="text-[11px] text-base-500">
        Registrar o motivo quando perde é o que alimenta o relatório mensal pro cliente depois — sem isso, o "porquê" se perde.
      </p>
    </div>
  )
}

function HistoricoVersoes({ biddingId }: { biddingId: string }) {
  const { versoes, isLoading, marcarComoEnviada } = useBiddingItemVersions(biddingId)
  const { nivel } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao'
  const [aberto, setAberto] = useState(true)
  const [versaoExpandida, setVersaoExpandida] = useState<string | null>(null)

  if (isLoading || versoes.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <button onClick={() => setAberto((v) => !v)} className="flex items-center justify-between w-full text-left">
        <span className="text-[10px] uppercase tracking-wider text-base-500 font-bold flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" /> Histórico de Versões dos Itens ({versoes.length})
        </span>
        {aberto ? <ChevronUp className="w-3.5 h-3.5 text-base-500" /> : <ChevronDown className="w-3.5 h-3.5 text-base-500" />}
      </button>
      {aberto && (
        <div className="flex flex-col gap-1.5">
          {versoes.map((v) => (
            <div key={v.id} className={`bg-base-850/60 border rounded-lg overflow-hidden ${v.enviada ? 'border-positive-500/40' : 'border-base-800'}`}>
              <div className="w-full flex items-center gap-3 px-3 py-2">
                <button onClick={() => setVersaoExpandida(versaoExpandida === v.id ? null : v.id)} className="flex items-center gap-3 flex-1 text-left min-w-0">
                  <span className="text-[11px] font-bold text-accent-300 shrink-0">V{v.versao}</span>
                  <span className="text-[11px] text-base-400 flex-1 truncate">
                    {new Date(v.createdAt).toLocaleString('pt-BR')}
                    {v.alteradoPorEmail && <span className="text-base-500"> — {v.alteradoPorEmail}</span>}
                  </span>
                  <span className="text-[10px] text-base-500 shrink-0">{v.itensSnapshot.length} item(ns)</span>
                </button>
                {v.enviada ? (
                  <span className="text-[10px] font-bold text-positive-400 flex items-center gap-1 shrink-0">
                    <Send className="w-3 h-3" /> Enviada
                  </span>
                ) : podeEditar ? (
                  <button
                    onClick={() => marcarComoEnviada.mutate(v.id)}
                    disabled={marcarComoEnviada.isPending}
                    title="Marcar esta como a versão que foi enviada"
                    className="text-[10px] text-base-500 hover:text-accent-300 flex items-center gap-1 shrink-0 transition"
                  >
                    <CircleDot className="w-3 h-3" /> Marcar como enviada
                  </button>
                ) : null}
              </div>
              {versaoExpandida === v.id && (
                <div className="border-t border-base-800 px-3 py-2 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-base-500">
                        <th className="text-left font-semibold pr-2">Item</th>
                        <th className="text-left font-semibold pr-2">Descrição</th>
                        <th className="text-right font-semibold pr-2">Qtd.</th>
                        <th className="text-right font-semibold pr-2">Vl. Licitado</th>
                        <th className="text-right font-semibold">Vl. Ofertado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.itensSnapshot.map((item: any, idx: number) => (
                        <tr key={idx} className="border-t border-base-800/60">
                          <td className="py-1 pr-2 text-base-300">{item.numero_item}</td>
                          <td className="py-1 pr-2 text-base-300 max-w-[200px] truncate">{item.descricao}</td>
                          <td className="py-1 pr-2 text-right text-base-400">{item.quantidade}</td>
                          <td className="py-1 pr-2 text-right font-mono text-base-400">{Number(item.valor_unitario_licitado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-1 text-right font-mono text-base-400">{item.valor_unitario_ofertado ? Number(item.valor_unitario_ofertado).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Cadastro da PROPOSTA INICIAL — a que sobe no Portal de Compras Públicas
// ANTES da sessão de disputa começar, diferente da Proposta Readequada
// (AbaProposta logo abaixo), que é o valor final depois de ganhar. O
// cabeçalho exigido pelo Portal (HEADER_PORTAL_COMPRAS) é fixo e já
// conhecido — não depende de enviar nenhum arquivo-modelo: a tabela é
// digitada direto aqui, pré-preenchida com o que o sistema já sabe da
// licitação (Item/Produto/Quantidade/Descrição/Valor de referência), e o
// que só o Portal sabe (ID, Lote) fica em branco pro usuário digitar.
type LinhaProposta = {
  processo: string
  id: string
  lote: string
  item: string
  produto: string
  quantidade: string
  modelo: string
  marca: string
  anvisa: string
  descricao: string
  valorUnitario: string
}

function linhaPropostaDoItem(bidding: Bidding, item: BiddingItem, doPortal?: { id: string; lote: string }): LinhaProposta {
  return {
    processo: bidding.processo ?? bidding.numeroEdital ?? '',
    id: doPortal?.id ?? '',
    lote: doPortal?.lote ?? '',
    item: item.numeroItem,
    produto: item.descricao,
    quantidade: String(item.quantidade),
    modelo: '',
    marca: item.marca ?? '',
    anvisa: '',
    descricao: `${item.descricao} Conforme edital`,
    valorUnitario: formatarNumeroPtBR(item.valorUnitarioLicitado),
  }
}

function AbaCadastrarProposta({ bidding }: { bidding: Bidding }) {
  const { items, isLoading } = useBiddingItemsDaLicitacao(bidding.id)
  const { analysis } = useBiddingAnalysis(bidding.id)
  const { nivel } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao'

  // ID e Lote geralmente já aparecem na própria tabela de itens do edital
  // (o Portal costuma gerar o PDF do edital com os mesmos números que
  // depois aparecem no CSV de proposta) — quando a Análise de Edital por
  // IA identificou isso, cruza pelo número do item pra pré-preencher em
  // vez de deixar em branco.
  const analise = (analysis?.analise ?? null) as AnaliseEdital | null
  const portalPorNumeroItem = useMemo(() => {
    const mapa = new Map<string, { id: string; lote: string }>()
    analise?.itens?.forEach((it) => {
      const numero = it.numero != null ? String(it.numero) : null
      if (!numero) return
      mapa.set(numero, {
        id: it.idPortal != null ? String(it.idPortal) : '',
        lote: it.lote != null ? String(it.lote) : '',
      })
    })
    return mapa
  }, [analise])

  const [linhasProposta, setLinhasProposta] = useState<LinhaProposta[]>([])
  // Preenche a tabela sozinha com os itens da licitação assim que eles
  // carregam — só uma vez por licitação, pra não sobrescrever edições já
  // feitas em toda atualização da tela (ajuste de estado durante o
  // render, comparando com um marcador, em vez de useEffect).
  const [carregadaPara, setCarregadaPara] = useState<string | null>(null)
  if (!isLoading && carregadaPara !== bidding.id) {
    setLinhasProposta(items.map((item) => linhaPropostaDoItem(bidding, item, portalPorNumeroItem.get(item.numeroItem))))
    setCarregadaPara(bidding.id)
  }

  const atualizarLinha = (idx: number, patch: Partial<LinhaProposta>) => {
    setLinhasProposta((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const adicionarLinha = () => {
    setLinhasProposta((prev) => [...prev, {
      processo: bidding.processo ?? bidding.numeroEdital ?? '',
      id: '', lote: '', item: '', produto: '', quantidade: '',
      modelo: '', marca: '', anvisa: '', descricao: '', valorUnitario: '',
    }])
  }

  const removerLinha = (idx: number) => {
    setLinhasProposta((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleExportarCsv = () => {
    const linhas = linhasProposta.map((l) => {
      const quantidade = parseFlexibleNumber(l.quantidade) ?? 0
      const valorUnitario = parseFlexibleNumber(l.valorUnitario) ?? 0
      return [
        l.processo, l.id, l.lote, l.item, l.produto, l.quantidade,
        l.modelo, l.marca, l.anvisa, l.descricao,
        formatarNumeroPtBR(valorUnitario), formatarNumeroPtBR(quantidade * valorUnitario),
      ]
    })
    const texto = stringifyCsvPortal([HEADER_PORTAL_COMPRAS, ...linhas])
    const blob = textoParaBlobLatin1(texto)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const nomeBase = (bidding.numeroEdital ?? bidding.id).replace(/[^\w-]+/g, '_')
    a.download = `Proposta_Inicial_${nomeBase}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <SkeletonTableRows linhas={4} colunas={5} />

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-base-850/60 border border-accent-500/20 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Proposta Inicial — Modelo do Portal de Compras Públicas</p>
        <p className="text-[12px] text-base-400">
          A tabela abaixo já vem preenchida com os itens desta licitação — Item, Produto, Quantidade, Descrição ("Conforme edital") e Valor Unitário pelo preço de referência do edital. ID e Lote também vêm preenchidos quando a Análise de Edital já os identificou na tabela do edital; confira e complete o que faltar antes de exportar. O cabeçalho e o formato do arquivo já seguem exatamente o que o Portal exige.
        </p>
        {items.length === 0 && (
          <p className="text-[11px] text-warning-400">Nenhum item cadastrado ainda na aba Proposta Readequada — a tabela começou vazia, use "Adicionar Linha" pra montar manualmente ou cadastre os itens lá primeiro.</p>
        )}
      </div>

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={adicionarLinha}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-accent-300 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar Linha
          </button>
          <Button onClick={handleExportarCsv} disabled={linhasProposta.length === 0}>
            <Download className="w-3.5 h-3.5" /> Exportar CSV pro Portal
          </Button>
        </div>
      )}

      <div className="overflow-x-auto bg-base-850/60 border border-base-800 rounded-xl">
        <table className="w-full min-w-[1200px] text-[12px]">
          <thead>
            <tr className="text-base-500 border-b border-base-800">
              <th className="text-left font-semibold px-2 py-2 w-24">Processo</th>
              <th className="text-left font-semibold px-2 py-2 w-24">ID (Portal)</th>
              <th className="text-left font-semibold px-2 py-2 w-20">Lote</th>
              <th className="text-left font-semibold px-2 py-2 w-16">Item</th>
              <th className="text-left font-semibold px-2 py-2 min-w-[160px]">Produto</th>
              <th className="text-right font-semibold px-2 py-2 w-20">Qtd.</th>
              <th className="text-left font-semibold px-2 py-2 w-24">Modelo</th>
              <th className="text-left font-semibold px-2 py-2 w-28">Marca/Fabricante</th>
              <th className="text-left font-semibold px-2 py-2 w-24">ANVISA</th>
              <th className="text-left font-semibold px-2 py-2 min-w-[220px]">Descrição detalhada</th>
              <th className="text-right font-semibold px-2 py-2 w-28">Vl. Unitário</th>
              <th className="text-right font-semibold px-2 py-2 w-28">Vl. Total</th>
              {podeEditar && <th className="px-2 py-2 w-8" />}
            </tr>
          </thead>
          <tbody>
            {linhasProposta.map((l, idx) => {
              const quantidadeNum = parseFlexibleNumber(l.quantidade) ?? 0
              const valorUnitarioNum = parseFlexibleNumber(l.valorUnitario) ?? 0
              return (
                <tr key={idx} className="border-t border-base-800/60">
                  {(['processo', 'id', 'lote', 'item'] as const).map((campo) => (
                    <td key={campo} className="px-1.5 py-1.5">
                      <input
                        value={l[campo]}
                        onChange={(e) => atualizarLinha(idx, { [campo]: e.target.value })}
                        disabled={!podeEditar}
                        className="w-full bg-base-900 border border-base-700 rounded px-1.5 py-1 text-[12px] text-base-100 focus:border-accent-400 outline-none disabled:opacity-60"
                      />
                    </td>
                  ))}
                  <td className="px-1.5 py-1.5">
                    <input
                      value={l.produto}
                      onChange={(e) => atualizarLinha(idx, { produto: e.target.value })}
                      disabled={!podeEditar}
                      className="w-full bg-base-900 border border-base-700 rounded px-1.5 py-1 text-[12px] text-base-100 focus:border-accent-400 outline-none disabled:opacity-60"
                    />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <input
                      value={l.quantidade}
                      inputMode="decimal"
                      onChange={(e) => atualizarLinha(idx, { quantidade: e.target.value })}
                      disabled={!podeEditar}
                      className="w-full bg-base-900 border border-base-700 rounded px-1.5 py-1 text-right text-[12px] font-mono text-base-100 focus:border-accent-400 outline-none disabled:opacity-60"
                    />
                  </td>
                  {(['modelo', 'marca', 'anvisa', 'descricao'] as const).map((campo) => (
                    <td key={campo} className="px-1.5 py-1.5">
                      <input
                        value={l[campo]}
                        onChange={(e) => atualizarLinha(idx, { [campo]: e.target.value })}
                        disabled={!podeEditar}
                        className="w-full bg-base-900 border border-base-700 rounded px-1.5 py-1 text-[12px] text-base-100 focus:border-accent-400 outline-none disabled:opacity-60"
                      />
                    </td>
                  ))}
                  <td className="px-1.5 py-1.5">
                    <input
                      value={l.valorUnitario}
                      inputMode="decimal"
                      onChange={(e) => atualizarLinha(idx, { valorUnitario: e.target.value })}
                      disabled={!podeEditar}
                      className="w-full bg-base-900 border border-base-700 rounded px-1.5 py-1 text-right text-[12px] font-mono text-base-100 focus:border-accent-400 outline-none disabled:opacity-60"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-base-300">{formatarNumeroPtBR(quantidadeNum * valorUnitarioNum)}</td>
                  {podeEditar && (
                    <td className="px-1.5 py-1.5 text-center">
                      <button type="button" onClick={() => removerLinha(idx)} className="text-base-500 hover:text-negative-400 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AbaProposta({ bidding }: { bidding: Bidding }) {
  const { items, isLoading, salvarRateio, sincronizarItens } = useBiddingItemsDaLicitacao(bidding.id)
  const { nivel } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao'

  // Autosave debounçado: o editor completo (Nº, Descrição, Ganhou?, Excel,
  // Adicionar Item...) não tem botão de "Salvar" aqui — cada mudança
  // dispara uma sincronização 1,2s depois da última tecla, pra não gravar
  // a cada dígito. Se uma sincronização ainda estiver em andamento quando
  // o timer estoura, espera ela terminar antes de mandar a próxima (evita
  // duas gravações correndo ao mesmo tempo e inserindo a mesma linha nova
  // duas vezes). Ao sair da aba/página com uma mudança pendente, força a
  // gravação na hora em vez de deixar perder.
  const pendenteRef = useRef<Partial<BiddingItem>[] | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [statusSalvamento, setStatusSalvamento] = useState<'idle' | 'pendente' | 'salvando'>('idle')

  const dispararSincronizacao = () => {
    if (sincronizarItens.isPending) {
      timeoutRef.current = setTimeout(dispararSincronizacao, 300)
      return
    }
    const dados = pendenteRef.current
    if (!dados) { setStatusSalvamento('idle'); return }
    pendenteRef.current = null
    setStatusSalvamento('salvando')
    sincronizarItens.mutate(dados, { onSettled: () => setStatusSalvamento((s) => (s === 'salvando' ? 'idle' : s)) })
  }

  const handleItemsChange = (novosItems: Partial<BiddingItem>[]) => {
    pendenteRef.current = novosItems
    setStatusSalvamento('pendente')
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(dispararSincronizacao, 1200)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (pendenteRef.current) sincronizarItens.mutate(pendenteRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [valorFinal, setValorFinal] = useState('')
  const [metodo, setMetodo] = useState<'proporcional' | 'percentual'>('proporcional')
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [marcarEnviadaAoSalvar, setMarcarEnviadaAoSalvar] = useState(true)

  // A proposta reajustada só faz sentido pros itens que a licitação
  // efetivamente ganhou — numa disputa por item, é comum ganhar só uma
  // parte. Se ninguém marcou "ganhou" ainda (tela de edição da licitação,
  // aba Itens/Lotes), cai de volta pra todos os itens, pra não quebrar
  // licitações antigas ganhas por inteiro que nunca precisaram marcar item
  // por item.
  const itensGanhos = items.some((i) => i.ganhou) ? items.filter((i) => i.ganhou) : items

  const somaOriginal = itensGanhos.reduce((s, i) => s + i.quantidade * i.valorUnitarioLicitado, 0)

  const pesos: Record<string, number> = {}
  if (metodo === 'proporcional') {
    itensGanhos.forEach((i) => {
      const total = i.quantidade * i.valorUnitarioLicitado
      pesos[i.id] = somaOriginal > 0 ? total / somaOriginal : 1 / (itensGanhos.length || 1)
    })
  } else {
    const somaPercentuais = Object.values(percentuais).reduce((s, p) => s + (parseFloat(p.replace(',', '.')) || 0), 0)
    itensGanhos.forEach((i) => {
      const p = parseFloat((percentuais[i.id] ?? '').replace(',', '.')) || 0
      pesos[i.id] = somaPercentuais > 0 ? p / somaPercentuais : 0
    })
  }

  const valorFinalNum = parseFloat(valorFinal.replace(',', '.')) || 0
  const rateio = valorFinalNum > 0 && itensGanhos.length > 0 ? calcularRateio(itensGanhos, valorFinalNum, pesos) : null

  const handleSalvar = () => {
    if (!rateio) return
    salvarRateio.mutate(
      { novosValoresTotais: rateio, observacao: `Rateio — proposta readequada (${metodo})`, marcarEnviada: marcarEnviadaAoSalvar },
      { onSuccess: () => { setValorFinal(''); setPercentuais({}) } }
    )
  }

  if (isLoading) return <SkeletonTableRows linhas={4} colunas={5} />

  if (!podeEditar && items.length === 0) {
    return <p className="text-[13px] text-base-500 italic py-4">Nenhum item cadastrado nesta licitação ainda.</p>
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Itens da Licitação</p>
          {podeEditar && statusSalvamento !== 'idle' && (
            <span className="text-[10px] text-base-500 flex items-center gap-1">
              {statusSalvamento === 'salvando' ? (<><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</>) : 'Alteração pendente...'}
            </span>
          )}
        </div>

        {podeEditar ? (
          <>
            <p className="text-[11px] text-base-500 mb-2">
              Confira e corrija aqui se a importação automática do edital vier incompleta ou errada — "Adicionar Item" e "Importar Excel" são o plano B pra montar a lista na mão quando for preciso. Cada mudança grava sozinha, não precisa de botão de salvar.
            </p>
            <BiddingItemsEditor items={items} onChange={handleItemsChange} tipoDisputa={bidding.tipoDisputa} />
          </>
        ) : (
          <div className="overflow-x-auto bg-base-850/60 border border-base-800 rounded-xl">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-base-500 border-b border-base-800">
                  <th className="text-left font-semibold px-3 py-2">Item</th>
                  <th className="text-left font-semibold px-3 py-2">Descrição</th>
                  <th className="text-right font-semibold px-3 py-2">Qtd.</th>
                  <th className="text-right font-semibold px-3 py-2">Vl. Unit. Licitado</th>
                  <th className="text-right font-semibold px-3 py-2">Vl. Unit. Ofertado</th>
                  <th className="text-center font-semibold px-3 py-2">Ganhou?</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-base-800/60">
                    <td className="px-3 py-2 text-base-300">{i.numeroItem}</td>
                    <td className="px-3 py-2 text-base-300 max-w-[220px] truncate">{i.descricao}</td>
                    <td className="px-3 py-2 text-right text-base-400">{i.quantidade}</td>
                    <td className="px-3 py-2 text-right font-mono text-base-400">{formatBRL(i.valorUnitarioLicitado)}</td>
                    <td className="px-3 py-2 text-right font-mono text-base-400">{i.valorUnitarioOfertado ? formatBRL(i.valorUnitarioOfertado) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${i.ganhou ? 'bg-positive-500/15 text-positive-400' : 'bg-base-700/40 text-base-500'}`}>
                        {i.ganhou ? 'Sim' : 'Não'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {podeEditar && items.length > 0 && rateio && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Prévia do Rateio</p>
          <div className="overflow-x-auto bg-base-850/60 border border-base-800 rounded-xl">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-base-500 border-b border-base-800">
                  <th className="text-left font-semibold px-3 py-2">Item</th>
                  <th className="text-left font-semibold px-3 py-2">Descrição</th>
                  {metodo === 'percentual' && <th className="text-right font-semibold px-3 py-2">% do Rateio</th>}
                  <th className="text-right font-semibold px-3 py-2 bg-base-800/40">Novo Vl. Unit.</th>
                </tr>
              </thead>
              <tbody>
                {itensGanhos.map((i) => (
                  <tr key={i.id} className="border-t border-base-800/60">
                    <td className="px-3 py-2 text-base-300">{i.numeroItem}</td>
                    <td className="px-3 py-2 text-base-300 max-w-[220px] truncate">{i.descricao}</td>
                    {metodo === 'percentual' && (
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={percentuais[i.id] ?? ''}
                          onChange={(e) => setPercentuais({ ...percentuais, [i.id]: e.target.value })}
                          className="w-16 bg-base-900 border border-base-700 rounded px-1.5 py-1 text-right text-[12px] text-base-100"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-mono font-semibold text-accent-300 bg-base-800/20">
                      {formatBRL((rateio[i.id] ?? 0) / (i.quantidade || 1))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-base-700">
                  <td colSpan={metodo === 'percentual' ? 3 : 2} className="px-3 py-2 text-right text-[11px] text-base-500">Soma do rateio</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-positive-400 bg-base-800/40">
                    {formatBRL(Object.values(rateio).reduce((s, v) => s + v, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {podeEditar && items.length > 0 && (
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Rateio da Proposta Readequada</p>
          <p className="text-[12px] text-base-400">
            Informe o valor total final (dos lances) e escolha como dividir entre os itens. O sistema ajusta os centavos pra soma fechar exatamente com o valor informado.
          </p>
          {items.some((i) => i.ganhou) ? (
            <p className="text-[11px] text-accent-300">O rateio considera só os {itensGanhos.length} item(ns) marcado(s) como "Ganhou" — os demais ficam de fora da proposta reajustada.</p>
          ) : (
            <p className="text-[11px] text-warning-400">Nenhum item foi marcado como "Ganhou" ainda — o rateio abaixo está considerando todos os itens. Marque na coluna "Ganhou?" da tabela acima pra restringir o rateio só a eles.</p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44">
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Valor Total Final</label>
              <Input placeholder="0,00" value={valorFinal} onChange={(e) => setValorFinal(e.target.value)} />
            </div>
            <div className="w-56">
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Método</label>
              <Select value={metodo} onChange={(e) => setMetodo(e.target.value as 'proporcional' | 'percentual')}>
                <option value="proporcional">Proporcional ao valor original</option>
                <option value="percentual">Percentual manual por item</option>
              </Select>
            </div>
            <label className="flex items-center gap-1.5 text-[12px] text-base-400 pb-2">
              <input type="checkbox" checked={marcarEnviadaAoSalvar} onChange={(e) => setMarcarEnviadaAoSalvar(e.target.checked)} />
              Já marcar como a versão enviada
            </label>
            <Button onClick={handleSalvar} disabled={!rateio || salvarRateio.isPending}>
              {salvarRateio.isPending ? 'Salvando...' : 'Salvar como Nova Versão'}
            </Button>
          </div>
          {metodo === 'percentual' && (
            <p className="text-[11px] text-base-500">Os percentuais não precisam somar 100 — o sistema normaliza entre os itens preenchidos.</p>
          )}
        </div>
      )}

      <HistoricoVersoes biddingId={bidding.id} />
    </div>
  )
}

// Tela enxuta pensada pra ficar aberta numa aba do navegador durante o
// pregão — os itens em fonte grande pra consulta rápida no meio da
// disputa, mais uma calculadora de apoio: informa o último lance de cada
// item e o intervalo mínimo exigido pelo edital entre lances (sugerido
// pela IA, sempre editável) e o sistema calcula o próximo lance sugerido.
// Nada aqui grava sozinho no banco — é só calculadora de apoio durante a
// sessão — exceto o botão opcional "Usar na Proposta Readequada", que
// aplica o último lance digitado como Vl. Unit. Ofertado daquele item
// (reaproveita o mesmo sincronizarItens por diff já usado na AbaProposta).
function AbaSessaoAoVivo({ bidding }: { bidding: Bidding }) {
  const { items, isLoading, sincronizarItens } = useBiddingItemsDaLicitacao(bidding.id)
  const { analysis } = useBiddingAnalysis(bidding.id)
  const { nivel } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao'
  const { showToast } = useToast()

  const analise = (analysis?.analise ?? null) as AnaliseEdital | null

  // Pega só o primeiro número do texto que a IA extraiu (ex: "1% (um por
  // cento) do valor do lance anterior" -> 1) pra sugerir um ponto de
  // partida — nunca assume sozinho, é só uma sugestão editável.
  const percentualSugeridoIA = useMemo(() => {
    const texto = analise?.intervaloLances
    if (!texto) return null
    const match = texto.match(/(\d+(?:[.,]\d+)?)/)
    return match ? parseFloat(match[1].replace(',', '.')) : null
  }, [analise])

  const [percentual, setPercentual] = useState('')
  const [sugestaoAplicadaPara, setSugestaoAplicadaPara] = useState<string | null>(null)
  const [ultimosLances, setUltimosLances] = useState<Record<string, string>>({})

  // Aplica a sugestão da IA assim que ela chegar, só uma vez por licitação
  // — se o usuário já editou o campo manualmente depois, não sobrescreve.
  if (percentualSugeridoIA !== null && sugestaoAplicadaPara !== bidding.id) {
    setPercentual(String(percentualSugeridoIA))
    setSugestaoAplicadaPara(bidding.id)
  }

  const pct = parseFloat(percentual.replace(',', '.')) || 0

  const usarValorNaProposta = (itemId: string, valor: number) => {
    const novosItems = items.map((it) => (it.id === itemId ? { ...it, valorUnitarioOfertado: valor } : it))
    sincronizarItens.mutate(novosItems, {
      onSuccess: () => showToast('Valor aplicado na Proposta Readequada.'),
      onError: (err) => showToast(`Erro ao aplicar o valor: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  if (isLoading) return <SkeletonList itens={3} />

  if (items.length === 0) {
    return <p className="text-[13px] text-base-500 italic py-4">Nenhum item cadastrado nesta licitação.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-base-850/60 border border-accent-500/20 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Intervalo entre lances (%)</label>
          <Input placeholder="Ex: 1" value={percentual} onChange={(e) => setPercentual(e.target.value)} />
        </div>
        <p className="text-[11px] text-base-500 flex-1 min-w-[220px]">
          {percentualSugeridoIA !== null
            ? 'Sugerido pela Análise de Edital — confira contra o edital e ajuste se precisar.'
            : 'A Análise de Edital ainda não identificou esse intervalo — informe manualmente conforme o edital.'}
          {' '}Calculadora de apoio: nada aqui é salvo, exceto se você usar o botão "Usar na Proposta Readequada" em algum item.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((i) => {
          const ultimoLanceTexto = ultimosLances[i.id] ?? ''
          const ultimoLance = parseFloat(ultimoLanceTexto.replace(',', '.')) || 0
          const proximoLance = ultimoLance > 0 && pct > 0 ? ultimoLance * (1 - pct / 100) : null
          return (
            <div key={i.id} className="bg-base-850/60 border border-base-800 rounded-xl px-5 py-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <span className="text-xl font-extrabold font-mono text-accent-300 shrink-0 w-14 text-center">{i.numeroItem}</span>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-base-100">{i.descricao}</p>
                  <p className="text-[11px] text-base-500">Referência: {formatBRL(i.valorUnitarioLicitado)}</p>
                </div>
              </div>

              <div className="w-36 shrink-0">
                <label className="text-[9px] uppercase tracking-wider text-base-500 font-bold block mb-1">Último Lance</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={ultimoLanceTexto}
                  onChange={(e) => setUltimosLances({ ...ultimosLances, [i.id]: e.target.value })}
                  className="w-full bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 text-right text-sm font-mono text-base-100 focus:border-accent-400 outline-none"
                />
              </div>

              <div className="w-36 shrink-0 text-right">
                <p className="text-[9px] uppercase tracking-wider text-base-500 font-bold mb-1">Próximo Sugerido</p>
                <p className="text-lg font-extrabold font-mono text-positive-400">{proximoLance !== null ? formatBRL(proximoLance) : '—'}</p>
              </div>

              {podeEditar && (
                <button
                  onClick={() => usarValorNaProposta(i.id, ultimoLance)}
                  disabled={ultimoLance <= 0 || sincronizarItens.isPending}
                  title="Usar o Último Lance como Vl. Unit. Ofertado na Proposta Readequada"
                  className="text-[11px] font-semibold text-accent-300 hover:text-accent-200 disabled:opacity-30 disabled:cursor-not-allowed border border-accent-500/30 hover:border-accent-500/50 rounded-lg px-2.5 py-1.5 transition shrink-0"
                >
                  Usar na Proposta Readequada
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Formato esperado do JSON retornado pela function analisar-edital
// (tabela/function já existem no banco, criadas por fora deste repo — não
// temos o código-fonte dela aqui). Os nomes de campo abaixo são os
// combinados na especificação da tarefa; se a function usar chaves
// diferentes, as seções correspondentes simplesmente não aparecem (nada
// quebra), já que cada uma só renderiza quando o campo existe.
interface AnaliseEdital {
  municipio?: string
  orgao?: string
  objeto?: string
  numeroEdital?: string
  numeroProcesso?: string
  modalidade?: string
  srp?: boolean
  data?: string
  horario?: string
  portal?: string
  intervaloLances?: string
  resumoTecnico?: string
  itens?: { numero?: string | number; idPortal?: string | number; lote?: string | number; descricao: string; unidade?: string; quantidade?: number; valorReferencia?: number }[]
  validadeProposta?: string
  catalogo?: string
  garantias?: string
  amostras?: string
  marcasPreAprovadas?: string[] | string
  habilitacao?: {
    habilitacaoJuridica?: string
    regularidadeFiscalTrabalhista?: string
    qualificacaoEconomicoFinanceira?: string
    qualificacaoTecnica?: string
    proposta?: string
  }
  prazos?: string
  formaEntrega?: string
  localEntrega?: string
  condicoesPagamento?: string
  clausulasRestritivas?: string
  conclusaoTecnica?: string
  checklistDocumentacao?: { descricao: string; categoria?: string | null; obrigatorio?: boolean }[]
}

const CAMPOS_HABILITACAO: { chave: keyof NonNullable<AnaliseEdital['habilitacao']>; label: string }[] = [
  { chave: 'habilitacaoJuridica', label: 'Habilitação Jurídica' },
  { chave: 'regularidadeFiscalTrabalhista', label: 'Regularidade Fiscal e Trabalhista' },
  { chave: 'qualificacaoEconomicoFinanceira', label: 'Qualificação Econômico-Financeira' },
  { chave: 'qualificacaoTecnica', label: 'Qualificação Técnica' },
  { chave: 'proposta', label: 'Proposta' },
]

const MODALIDADES_VALIDAS: BiddingModalidade[] = [
  'Pregão Eletrônico', 'Pregão Presencial', 'Concorrência Pública', 'Tomada de Preços',
  'Convite', 'Leilão', 'Diálogo Competitivo', 'Dispensa de Licitação', 'Inexigibilidade',
]

const normalizarTexto = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// A IA devolve a modalidade como texto livre — só aceitamos se bater com uma
// das opções válidas do formulário, pra nunca gravar um valor fora do enum.
function encontrarModalidade(texto?: string): BiddingModalidade | null {
  if (!texto) return null
  const alvo = normalizarTexto(texto)
  return MODALIDADES_VALIDAS.find((m) => alvo.includes(normalizarTexto(m))) ?? null
}

// Idem para a data: a IA pode devolver "15/03/2026" ou já em ISO — qualquer
// outro formato (ex: "15 de março") é ignorado em vez de gravar algo errado.
function converterDataParaISO(texto?: string): string | null {
  if (!texto) return null
  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  return null
}

// Monta, a partir da análise de IA, só os campos que ela conseguiu
// identificar (nunca sobrescreve com vazio) e a lista de itens — se a
// análise não trouxe itens, mantém os já cadastrados em vez de apagá-los.
function construirPreenchimento(analise: AnaliseEdital, itensAtuais: BiddingItem[]) {
  // Diagnóstico: loga o item bruto exatamente como veio da análise de IA,
  // antes de qualquer transformação — usado pra confirmar se um valor
  // como quantidade/unidade errado (ex: "405"/"m³" virando "4"/"m") já
  // chega assim da function ou se é introduzido por este código.
  if (analise.itens?.length) {
    console.log('[Preencher Licitação] itens brutos recebidos da análise:', JSON.stringify(analise.itens))
  }

  const campos: Partial<Bidding> = {}
  const resumo: string[] = []

  if (analise.municipio) { campos.municipio = analise.municipio; resumo.push('Município') }
  if (analise.orgao) { campos.orgao = analise.orgao; resumo.push('Órgão') }
  if (analise.objeto) { campos.objeto = analise.objeto; resumo.push('Objeto') }
  if (analise.numeroEdital) { campos.numeroEdital = analise.numeroEdital; resumo.push('Nº Edital') }
  if (analise.numeroProcesso) { campos.processo = analise.numeroProcesso; resumo.push('Processo') }
  if (analise.portal) { campos.portal = analise.portal; resumo.push('Portal') }
  const modalidade = encontrarModalidade(analise.modalidade)
  if (modalidade) { campos.modalidade = modalidade; resumo.push('Modalidade') }
  const dataISO = converterDataParaISO(analise.data)
  if (dataISO) { campos.dataAbertura = dataISO; resumo.push('Data do Pregão') }
  if (analise.validadeProposta) { campos.diasValidadeProposta = analise.validadeProposta; resumo.push('Validade da Proposta') }

  const temItensNaAnalise = !!analise.itens?.length
  const itens: Partial<BiddingItem>[] = temItensNaAnalise
    ? analise.itens!.map((it, idx) => ({
        numeroItem: it.numero != null ? String(it.numero) : String(idx + 1),
        descricao: it.descricao,
        unidade: it.unidade ?? null,
        quantidade: it.quantidade ?? 1,
        marca: null,
        referencia: null,
        valorUnitarioLicitado: it.valorReferencia ?? 0,
        valorUnitarioOfertado: null,
      }))
    : itensAtuais
  if (temItensNaAnalise) resumo.push(`Itens/Lotes (${analise.itens!.length})`)

  return { campos, itens, substituiItens: temItensNaAnalise, resumo }
}

function CampoResumo({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null
  return (
    <div className="bg-base-850/60 border border-base-800 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-0.5">{label}</p>
      <p className="text-[12px] text-base-200">{valor}</p>
    </div>
  )
}

function SecaoTexto({ label, texto }: { label: string; texto?: string | null }) {
  if (!texto) return null
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1.5">{label}</p>
      <p className="text-[12px] text-base-300 whitespace-pre-line">{texto}</p>
    </div>
  )
}

function AnaliseEditalIA({ bidding, temEdital, podeEditar }: { bidding: Bidding; temEdital: boolean; podeEditar: boolean }) {
  const { analysis, analisar, travado } = useBiddingAnalysis(bidding.id)
  const { addItensEmLote } = useBiddingChecklist(bidding.id)
  const { updateBidding } = useBiddings()
  const { items: itensAtuais } = useBiddingItems(bidding.id)
  const { showToast } = useToast()
  const [confirmandoPreenchimento, setConfirmandoPreenchimento] = useState(false)

  const status = analysis?.status
  const processando = (status === 'processando' && !travado) || analisar.isPending
  const analise = (analysis?.analise ?? null) as AnaliseEdital | null

  const localOuFormaEntrega = [analise?.formaEntrega, analise?.localEntrega].filter(Boolean).join(' — ')
  const marcasTexto = Array.isArray(analise?.marcasPreAprovadas) ? analise.marcasPreAprovadas.join(', ') : analise?.marcasPreAprovadas
  const checklistDocumentacao = analise?.checklistDocumentacao ?? []
  const preenchimento = analise ? construirPreenchimento(analise, itensAtuais) : null

  const confirmarPreenchimento = () => {
    if (!preenchimento) return
    updateBidding.mutate({ bidding: { ...bidding, ...preenchimento.campos }, items: preenchimento.itens }, {
      onSuccess: () => { setConfirmandoPreenchimento(false); showToast('Licitação atualizada com os dados da análise.') },
      onError: () => setConfirmandoPreenchimento(false),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => analisar.mutate()} disabled={!temEdital || processando}>
          {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {processando ? 'Analisando...' : status === 'concluido' ? 'Analisar Novamente' : 'Analisar com IA'}
        </Button>
        {!temEdital && (
          <span className="text-[11px] text-base-500 italic">Envie o edital acima antes de analisar.</span>
        )}
      </div>

      {(status === 'erro' || analisar.isError || travado) && (
        <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-negative-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[12px] text-negative-300">
              {travado
                ? 'A análise demorou demais e parece ter travado (provavelmente o edital é grande/escaneado demais pra function atual processar a tempo). Tente novamente.'
                : analysis?.erroMensagem || (analisar.error instanceof Error ? analisar.error.message : null) || 'Não foi possível analisar o edital.'}
            </p>
            <button onClick={() => analisar.mutate()} className="flex items-center gap-1.5 text-[11px] text-accent-300 hover:text-accent-200 transition mt-1.5">
              <RefreshCw className="w-3 h-3" /> Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!status && temEdital && (
        <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 text-[12px] text-accent-300 flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Clique em "Analisar com IA" pra extrair automaticamente o resumo, os itens, a habilitação exigida e o checklist sugerido a partir do edital enviado.</span>
        </div>
      )}

      {status === 'concluido' && analise && (
        <div className="flex flex-col gap-4">
          {podeEditar && preenchimento && preenchimento.resumo.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap bg-accent-500/10 border border-accent-500/25 rounded-lg p-3">
              <Button type="button" variant="secondary" onClick={() => setConfirmandoPreenchimento(true)} disabled={updateBidding.isPending}>
                <Wand2 className="w-4 h-4" /> Preencher Licitação com estes Dados
              </Button>
              <span className="text-[11px] text-base-400 flex-1 min-w-[220px]">
                Atualiza {preenchimento.resumo.join(', ')} desta licitação com o que foi identificado no edital.
              </span>
            </div>
          )}

          {updateBidding.isError && (
            <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 text-[12px] text-negative-300">
              {updateBidding.error instanceof Error ? updateBidding.error.message : 'Não foi possível atualizar a licitação com os dados da análise.'}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <CampoResumo label="Município / Órgão" valor={[analise.municipio, analise.orgao].filter(Boolean).join(' — ')} />
            <CampoResumo label="Nº Edital / Processo" valor={[analise.numeroEdital, analise.numeroProcesso].filter(Boolean).join(' — ')} />
            <CampoResumo label="Objeto" valor={analise.objeto} />
            <CampoResumo label="Modalidade / SRP" valor={[analise.modalidade, analise.srp ? 'SRP' : null].filter(Boolean).join(' — ')} />
            <CampoResumo label="Data / Horário / Portal" valor={[analise.data, analise.horario, analise.portal].filter(Boolean).join(' — ')} />
            <CampoResumo label="Intervalo Mínimo entre Lances" valor={analise.intervaloLances} />
            <CampoResumo label="Validade da Proposta" valor={analise.validadeProposta} />
            <CampoResumo label="Catálogo" valor={analise.catalogo} />
            <CampoResumo label="Forma / Local de Entrega" valor={localOuFormaEntrega} />
          </div>

          <SecaoTexto label="Resumo Técnico" texto={analise.resumoTecnico} />

          {!!analise.itens?.length && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Itens Identificados</p>
              <div className="overflow-x-auto bg-base-850/60 border border-base-800 rounded-xl">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-base-500 border-b border-base-800">
                      <th className="text-left font-semibold px-3 py-2">Item</th>
                      <th className="text-left font-semibold px-3 py-2">Descrição</th>
                      <th className="text-right font-semibold px-3 py-2">Qtd.</th>
                      <th className="text-right font-semibold px-3 py-2">Vl. Referência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analise.itens.map((it, idx) => (
                      <tr key={idx} className="border-t border-base-800/60">
                        <td className="px-3 py-2 text-base-300">{it.numero ?? idx + 1}</td>
                        <td className="px-3 py-2 text-base-300">{it.descricao}</td>
                        <td className="px-3 py-2 text-right text-base-400">{it.quantidade ?? '—'}{it.unidade ? ` ${it.unidade}` : ''}</td>
                        <td className="px-3 py-2 text-right font-mono text-base-400">{it.valorReferencia != null ? formatBRL(Number(it.valorReferencia)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <SecaoTexto label="Garantias" texto={analise.garantias} />
          <SecaoTexto label="Amostras" texto={analise.amostras} />
          <SecaoTexto label="Marcas Pré-Aprovadas" texto={marcasTexto} />

          {analise.habilitacao && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Habilitação</p>
              <div className="flex flex-col gap-2">
                {CAMPOS_HABILITACAO.map(({ chave, label }) => {
                  const texto = analise.habilitacao?.[chave]
                  if (!texto) return null
                  return (
                    <div key={chave} className="bg-base-850/60 border border-base-800 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-bold text-accent-400 uppercase tracking-wider mb-0.5">{label}</p>
                      <p className="text-[12px] text-base-300">{texto}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <SecaoTexto label="Prazos" texto={analise.prazos} />
          <SecaoTexto label="Condições de Pagamento" texto={analise.condicoesPagamento} />
          <SecaoTexto label="Cláusulas Restritivas" texto={analise.clausulasRestritivas} />
          <SecaoTexto label="Conclusão Técnica" texto={analise.conclusaoTecnica} />

          {checklistDocumentacao.length > 0 && (
            <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3">
              <p className="text-[12px] text-accent-300 mb-2">{checklistDocumentacao.length} documento(s) sugerido(s) pela análise pra habilitação.</p>
              <Button variant="secondary" onClick={() => addItensEmLote.mutate(checklistDocumentacao)} disabled={addItensEmLote.isPending}>
                <Plus className="w-4 h-4" /> {addItensEmLote.isPending ? 'Adicionando...' : 'Adicionar ao Checklist'}
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmandoPreenchimento}
        title="Preencher Licitação com os Dados da Análise"
        description={`Isso vai atualizar ${preenchimento?.resumo.join(', ') ?? 'os campos identificados'} desta licitação com o que a IA extraiu do edital${preenchimento?.substituiItens ? ', substituindo também os Itens/Lotes já cadastrados (a versão atual fica salva no histórico de versões dos itens)' : ''}. Deseja continuar?`}
        confirmLabel="Preencher"
        onCancel={() => setConfirmandoPreenchimento(false)}
        onConfirm={confirmarPreenchimento}
        isLoading={updateBidding.isPending}
      />
    </div>
  )
}

const TIPOS_ANALISE_JURIDICA: { tipo: TipoAnaliseJuridica; label: string; icon: typeof HelpCircle }[] = [
  { tipo: 'esclarecimento', label: 'Esclarecimentos', icon: HelpCircle },
  { tipo: 'impugnacao', label: 'Impugnações', icon: Scale },
  { tipo: 'raio_x', label: 'Raio-X', icon: ScanSearch },
]

const COR_NIVEL: Record<string, string> = {
  Alto: 'bg-negative-500/15 text-negative-400 border-negative-500/30',
  Alta: 'bg-negative-500/15 text-negative-400 border-negative-500/30',
  Médio: 'bg-warning-500/15 text-warning-400 border-warning-500/30',
  Média: 'bg-warning-500/15 text-warning-400 border-warning-500/30',
  Baixo: 'bg-base-800 text-base-400 border-base-700',
  Baixa: 'bg-base-800 text-base-400 border-base-700',
}

function Selo({ texto }: { texto?: string | null }) {
  if (!texto) return null
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 shrink-0 ${COR_NIVEL[texto] ?? 'bg-base-800 text-base-400 border-base-700'}`}>
      {texto}
    </span>
  )
}

function PontoJuridicoCard({ p, mostrarTipoPonto }: { p: PontoAnaliseJuridica; mostrarTipoPonto: boolean }) {
  return (
    <div className="bg-base-850/60 border border-base-800 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-[12.5px] font-bold text-accent-300">{p.localizacao}</p>
        <div className="flex items-center gap-1.5">
          {mostrarTipoPonto && <Selo texto={p.tipoPonto} />}
          <Selo texto={p.probabilidade} />
          <Selo texto={p.prioridade} />
        </div>
      </div>
      {p.textoOriginal && <p className="text-[12px] text-base-500 italic">"{p.textoOriginal}"</p>}
      <p className="text-[12px] text-base-300">{p.motivo}</p>
      {p.risco && <p className="text-[11px] text-warning-300"><strong className="font-bold">Risco:</strong> {p.risco}</p>}
      {p.fundamentoLegal && <p className="text-[11px] text-base-500"><strong className="font-bold text-base-400">Fundamento legal:</strong> {p.fundamentoLegal}</p>}
      {p.jurisprudencia && <p className="text-[11px] text-base-500"><strong className="font-bold text-base-400">Jurisprudência:</strong> {p.jurisprudencia}</p>}
      {p.sugestao && (
        <div className="bg-base-900/60 border border-base-700/40 rounded-lg p-2 text-[12px] text-base-200">
          {p.sugestao}
        </div>
      )}
    </div>
  )
}

// Esclarecimentos / Impugnações / Raio-X — 3 análises de IA independentes
// sobre o mesmo edital, cada uma com seu próprio prompt jurídico. Os botões
// funcionam como abas (trocar não dispara a IA de novo à toa) e o botão de
// ação roda/refaz só a análise selecionada no momento.
function AnaliseJuridicaIA({ bidding, temEdital }: { bidding: Bidding; temEdital: boolean }) {
  const [tipoAtivo, setTipoAtivo] = useState<TipoAnaliseJuridica>('esclarecimento')
  const { analysis, analisar, travado } = useAnaliseJuridicaEdital(bidding.id, tipoAtivo)

  const status = analysis?.status
  const processando = (status === 'processando' && !travado) || analisar.isPending
  const resultado = analysis?.resultado ?? null
  const pontos = resultado?.pontos ?? []
  const atual = TIPOS_ANALISE_JURIDICA.find((t) => t.tipo === tipoAtivo)!

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Análise Jurídica do Edital</p>
        <div className="flex items-center gap-2 flex-wrap">
          {TIPOS_ANALISE_JURIDICA.map(({ tipo, label, icon: Icon }) => (
            <button
              key={tipo}
              onClick={() => setTipoAtivo(tipo)}
              className={`flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border transition ${
                tipoAtivo === tipo
                  ? 'bg-accent-500/15 border-accent-500/40 text-accent-300'
                  : 'bg-base-850 border-base-700 text-base-400 hover:text-base-200 hover:border-base-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => analisar.mutate()} disabled={!temEdital || processando}>
          {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <atual.icon className="w-4 h-4" />}
          {processando ? 'Analisando...' : status === 'concluido' ? `Analisar ${atual.label} Novamente` : `Analisar ${atual.label}`}
        </Button>
        {!temEdital && (
          <span className="text-[11px] text-base-500 italic">Envie o edital acima antes de analisar.</span>
        )}
      </div>

      {(status === 'erro' || analisar.isError || travado) && (
        <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-negative-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[12px] text-negative-300">
              {travado
                ? 'A análise demorou demais e parece ter travado (provavelmente o edital é grande/escaneado demais pra function atual processar a tempo). Tente novamente.'
                : analysis?.erroMensagem || (analisar.error instanceof Error ? analisar.error.message : null) || 'Não foi possível concluir esta análise.'}
            </p>
            <button onClick={() => analisar.mutate()} className="flex items-center gap-1.5 text-[11px] text-accent-300 hover:text-accent-200 transition mt-1.5">
              <RefreshCw className="w-3 h-3" /> Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!status && temEdital && (
        <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 text-[12px] text-accent-300 flex items-start gap-2">
          <atual.icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {tipoAtivo === 'esclarecimento' && 'Clique acima pra IA identificar pontos do edital que podem gerar pedido de esclarecimento ao órgão.'}
            {tipoAtivo === 'impugnacao' && 'Clique acima pra IA fazer uma auditoria jurídica em busca de fundamentos pra uma possível impugnação.'}
            {tipoAtivo === 'raio_x' && 'Clique acima pra uma auditoria completa combinando esclarecimentos e impugnações num raio-x só.'}
          </span>
        </div>
      )}

      {status === 'concluido' && (
        <div className="flex flex-col gap-3">
          {resultado?.resumoGeral && <SecaoTexto label="Panorama Geral" texto={resultado.resumoGeral} />}
          {pontos.length === 0 ? (
            <p className="text-[12px] text-base-500 italic">Nenhum ponto relevante identificado.</p>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
                {pontos.length} ponto(s) identificado(s)
              </p>
              <div className="flex flex-col gap-2">
                {pontos.map((p, idx) => (
                  <PontoJuridicoCard key={idx} p={p} mostrarTipoPonto={tipoAtivo === 'raio_x'} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function LicitacaoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { biddings, updateEtapa } = useBiddings()
  const { showToast } = useToast()
  const { clients } = useClients()
  const { nivel: nivelLicitacoes } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivelLicitacoes === 'edicao'
  const [aba, setAba] = useState<AbaKey>('visao')

  const bidding = biddings.find((b) => b.id === id)
  const clientName = bidding ? (clients.find((c) => c.id === bidding.clientId)?.name ?? 'Cliente removido') : ''

  const { files: anexos, uploadFile: uploadAnexo, uploadProgress, deleteFile: deleteAnexo, getDownloadUrl: getAnexoUrl } = useAttachedFiles('licitacao', bidding?.id)
  const { items, addItem, updateItem, deleteItem } = useBiddingChecklist(bidding?.id)
  const { documents: clientDocs, uploadAndSave: uploadClientDoc } = useClientDocuments(bidding?.clientId)
  const { atestados, addAtestado } = useAtestados(bidding?.clientId)
  const clienteDaLicitacao = clients.find((c) => c.id === bidding?.clientId)
  const { buscando, errosBusca, avisosBusca, buscarAutomatico, limparAviso, limparErro } = useBuscaCertidaoAutomatica(bidding?.clientId, clienteDaLicitacao?.cnpj ?? undefined, podeEditar)
  const { limparAnalise } = useBiddingAnalysis(bidding?.id)
  const { limpar: limparAnaliseJuridica } = useLimparAnaliseJuridica(bidding?.id)

  const [enviando, setEnviando] = useState<string | null>(null)
  const [showNovoItem, setShowNovoItem] = useState(false)
  const [novoItem, setNovoItem] = useState({ numeroEdital: '', descricao: '', categoria: CATEGORIAS_CHECKLIST[0], obrigatorio: true, prazo: '', responsavelNome: '' })
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [visualizando, setVisualizando] = useState<{ nome: string; url: string | null } | null>(null)
  const [itemAbertoId, setItemAbertoId] = useState<string | null>(null)
  const [enviandoItemId, setEnviandoItemId] = useState<string | null>(null)
  const [dataValidadeCert, setDataValidadeCert] = useState('')
  const [certFileSelecionado, setCertFileSelecionado] = useState<File | null>(null)
  const [atestadoForm, setAtestadoForm] = useState({ nome: '', objeto: '', orgaoEmissor: '', valor: '', dataEmissao: '' })
  const [atestadoFileSelecionado, setAtestadoFileSelecionado] = useState<File | null>(null)
  const [mostrarDownloadModal, setMostrarDownloadModal] = useState(false)
  const [gerandoReadequada, setGerandoReadequada] = useState(false)
  const [erroReadequada, setErroReadequada] = useState<string | null>(null)

  if (!bidding) {
    return (
      <div className="pb-10">
        <PageHeader title="Licitação" subtitle="Carregando..." icon={Gavel} />
      </div>
    )
  }

  const edital = anexos.find((f) => f.category === 'Edital')
  const termoReferencia = anexos.find((f) => f.category === 'Termo de Referência')
  const contrato = anexos.find((f) => f.category === 'Contrato')
  const propostaEnviada = anexos.find((f) => f.category === 'Proposta')
  const propostaReadequada = anexos.find((f) => f.category === 'Proposta Readequada')

  const handleUploadAnexo = async (file: File, category: 'Edital' | 'Termo de Referência' | 'Contrato' | 'Proposta') => {
    setEnviando(category)
    try {
      await uploadAnexo.mutateAsync({ file, category })
    } catch (err) {
      showToast(`Erro ao enviar: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviando(null)
    }
  }

  // Detecta um item de "Atestado de Capacidade Técnica" pela descrição —
  // esses não têm um clientDocumentTipo fixo (cada edital pede um atestado
  // diferente), mas ainda assim são reaproveitáveis: gravam na mesma seção
  // de Atestados do cliente que já alimenta o Ranking de Compatibilidade.
  const ehAtestadoTecnico = (item: BiddingChecklistItem) => !item.clientDocumentTipo && /atestado/i.test(item.descricao)

  // Enviar/renovar uma das 7 certidões padrão — grava direto no repositório
  // do cliente (client_documents). O item do checklist nem precisa de
  // vínculo próprio: já casa sozinho por clientDocumentTipo, então o mesmo
  // envio também resolve esse item em qualquer outra licitação do cliente.
  const handleEnviarCertidao = async (item: BiddingChecklistItem, file: File) => {
    if (!item.clientDocumentTipo) return
    setEnviandoItemId(item.id)
    try {
      await uploadClientDoc.mutateAsync({
        file,
        tipo: item.clientDocumentTipo,
        nome: CERT_CONFIG[item.clientDocumentTipo].label.split(' — ')[0],
        dataEmissao: new Date().toISOString().split('T')[0],
        dataValidade: dataValidadeCert || null,
      })
      setItemAbertoId(null)
      setDataValidadeCert('')
    } catch (err) {
      showToast(`Erro ao enviar: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviandoItemId(null)
    }
  }

  const handleSalvarAtestadoDoItem = async (item: BiddingChecklistItem, file: File | null) => {
    if (!atestadoForm.nome.trim() || !atestadoForm.objeto.trim()) return
    setEnviandoItemId(item.id)
    try {
      const novoId = await addAtestado.mutateAsync({
        nome: atestadoForm.nome.trim(),
        objeto: atestadoForm.objeto.trim(),
        orgaoEmissor: atestadoForm.orgaoEmissor.trim() || null,
        valor: atestadoForm.valor ? parseFloat(atestadoForm.valor) : null,
        dataEmissao: atestadoForm.dataEmissao || null,
        file,
      })
      await updateItem.mutateAsync({ ...item, atestadoId: novoId, atendido: true })
      setItemAbertoId(null)
      setAtestadoForm({ nome: '', objeto: '', orgaoEmissor: '', valor: '', dataEmissao: '' })
    } catch (err) {
      showToast(`Erro ao salvar atestado: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviandoItemId(null)
    }
  }

  // Item genérico (nem certidão padrão, nem atestado) — ainda assim grava
  // no repositório do cliente como documento manual, numa pasta com o
  // nome da categoria, pra ficar disponível se aparecer de novo em outra
  // licitação parecida, em vez de ficar preso só aqui.
  const handleEnviarDocumentoGenerico = async (item: BiddingChecklistItem, file: File) => {
    setEnviandoItemId(item.id)
    try {
      const { id: novoId } = await uploadClientDoc.mutateAsync({
        file, tipo: 'manual', nome: file.name, pasta: item.categoria || 'Documentos Gerais',
      })
      // CORREÇÃO DE BUG: documento manual (CNPJ, Contrato Social...) não
      // tem data de validade, então a checagem de status pelo
      // clientDocumentId (statusItemChecklist) nunca bate 'válido' e cai
      // sem marcar nada — sem esse atendido:true explícito o item ficava
      // preso em "faltando" pra sempre, mesmo com o arquivo já salvo.
      await updateItem.mutateAsync({ ...item, clientDocumentId: novoId, atendido: true })
      setItemAbertoId(null)
    } catch (err) {
      showToast(`Erro ao enviar documento: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviandoItemId(null)
    }
  }

  // Só desfaz o vínculo deste item com o documento — o arquivo continua no
  // repositório do cliente (pode estar servindo outra licitação).
  const handleDesvincularItem = (item: BiddingChecklistItem) => {
    updateItem.mutate({ ...item, clientDocumentId: null, atestadoId: null, attachedFileId: null, atendido: false })
  }

  const handleVerArquivoDoItem = async (item: BiddingChecklistItem) => {
    const arquivo = arquivoResolvidoDoItem(item, clientDocs, atestados, anexos)
    if (!arquivo) return
    await handleVisualizarAnexo({ id: item.id, name: arquivo.nome, storagePath: arquivo.storagePath })
  }

  const handleAbrirItem = (item: BiddingChecklistItem) => {
    if (itemAbertoId === item.id) { setItemAbertoId(null); return }
    setItemAbertoId(item.id)
    setDataValidadeCert('')
    setCertFileSelecionado(null)
    setAtestadoFileSelecionado(null)
    setAtestadoForm({ nome: item.descricao, objeto: bidding.objeto, orgaoEmissor: '', valor: '', dataEmissao: new Date().toISOString().split('T')[0] })
  }

  // Reaproveita a mesma function que já gera a Proposta Readequada em
  // Cadastros → Licitações — só que aqui, além de baixar na hora, também
  // guarda o resultado em Documentos Finais (categoria 'Proposta
  // Readequada'), pra não precisar gerar de novo só pra ver/baixar depois.
  const handleGerarPropostaReadequada = async () => {
    setGerandoReadequada(true)
    setErroReadequada(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gerar-proposta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ clientId: bidding.clientId, biddingId: bidding.id, tipo: 'readequada' }),
      })
      const resultado = await res.json()
      if (!res.ok || resultado.error) throw new Error(resultado.error || 'Erro desconhecido ao gerar a proposta')

      const bytes = Uint8Array.from(atob(resultado.fileBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: resultado.mimeType })
      const arquivoAntigo = propostaReadequada
      const file = new File([blob], resultado.fileName || 'proposta-readequada.docx', { type: resultado.mimeType })
      await uploadAnexo.mutateAsync({ file, category: 'Proposta Readequada' })
      if (arquivoAntigo) await deleteAnexo.mutateAsync(arquivoAntigo)
    } catch (err) {
      setErroReadequada(err instanceof Error ? err.message : String(err))
    } finally {
      setGerandoReadequada(false)
    }
  }

  const handleAbrirAnexo = async (anexo: { id: string; storagePath: string }) => {
    setAbrindo(anexo.id)
    try {
      const url = await getAnexoUrl(anexo.storagePath)
      window.open(url, '_blank')
    } catch {
      showToast('Não foi possível abrir o arquivo.', 'error')
    } finally {
      setAbrindo(null)
    }
  }

  const handleVisualizarAnexo = async (anexo: { id: string; name: string; storagePath: string }) => {
    setVisualizando({ nome: anexo.name, url: null })
    try {
      const url = await getAnexoUrl(anexo.storagePath)
      setVisualizando({ nome: anexo.name, url })
    } catch {
      showToast('Não foi possível carregar o arquivo pra visualização.', 'error')
      setVisualizando(null)
    }
  }

  const handleAdicionarItem = () => {
    if (!novoItem.descricao.trim()) return
    addItem.mutate(
      {
        numeroEdital: novoItem.numeroEdital.trim() || null,
        descricao: novoItem.descricao.trim(),
        categoria: novoItem.categoria,
        obrigatorio: novoItem.obrigatorio,
        prazo: novoItem.prazo || null,
        responsavelNome: novoItem.responsavelNome.trim() || null,
      },
      { onSuccess: () => { setShowNovoItem(false); setNovoItem({ numeroEdital: '', descricao: '', categoria: CATEGORIAS_CHECKLIST[0], obrigatorio: true, prazo: '', responsavelNome: '' }) } }
    )
  }

  const statusItem = (item: BiddingChecklistItem) => statusItemChecklist(item, clientDocs)

  const {
    status: statusGeral,
    total: totalObrigatorios,
    atendidos: atendidosObrigatorios,
    vencendo: vencendoObrigatorios,
    faltando: faltandoObrigatorios,
    percentual: percentualAderencia,
  } = calcularHabilitacao(items, clientDocs)

  const rankingAtestados = [...atestados]
    .map((a) => ({ atestado: a, similaridade: calcularSimilaridade(bidding.objeto, a.objeto) }))
    .sort((a, b) => b.similaridade - a.similaridade)

  const itensComAnexo = items
    .map((item) => ({ item, arquivo: arquivoResolvidoDoItem(item, clientDocs, atestados, anexos) }))
    .filter((x): x is { item: BiddingChecklistItem; arquivo: { nome: string; storagePath: string } } => !!x.arquivo)

  const PainelStatus = () => statusGeral && (
    <div className={`rounded-xl border p-4 flex items-center justify-between ${
      statusGeral === 'HABILITADO' ? 'bg-positive-500/10 border-positive-500/30' :
      statusGeral === 'ATENÇÃO' ? 'bg-warning-500/10 border-warning-500/30' :
      'bg-negative-500/10 border-negative-500/30'
    }`}>
      <div>
        <p className={`text-lg font-extrabold ${
          statusGeral === 'HABILITADO' ? 'text-positive-400' :
          statusGeral === 'ATENÇÃO' ? 'text-warning-400' : 'text-negative-400'
        }`}>
          {statusGeral === 'HABILITADO' && 'HABILITADO'}
          {statusGeral === 'ATENÇÃO' && 'ATENÇÃO — documento(s) vencendo'}
          {statusGeral === 'INABILITADO' && 'INABILITADO — documentação incompleta'}
        </p>
        <p className="text-[12px] text-base-400 mt-0.5">
          {atendidosObrigatorios}/{totalObrigatorios} itens obrigatórios atendidos
          {faltandoObrigatorios > 0 && ` — faltam ${faltandoObrigatorios}`}
          {vencendoObrigatorios > 0 && ` — ${vencendoObrigatorios} vencendo`}
        </p>
      </div>
      {percentualAderencia !== null && (
        <div className="text-right shrink-0">
          <p className={`text-2xl font-extrabold font-mono ${
            statusGeral === 'HABILITADO' ? 'text-positive-400' :
            statusGeral === 'ATENÇÃO' ? 'text-warning-400' : 'text-negative-400'
          }`}>
            {percentualAderencia}%
          </p>
          <p className="text-[10px] text-base-500 uppercase tracking-wider">aderência</p>
        </div>
      )}
    </div>
  )

  return (
    <div className="pb-10">
      <div className="px-6 pt-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[12px] text-base-500 hover:text-base-300 transition mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>
        <h1 className="font-display font-bold text-xl text-base-100">{bidding.objeto}</h1>
        <p className="text-base-400 text-[13px] mt-0.5">{clientName} — {bidding.orgao} {bidding.municipio ? `(${bidding.municipio}${bidding.uf ? '/' + bidding.uf : ''})` : ''}</p>

        <div className="mt-4">
          <EtapaTrilha
            etapaAtual={bidding.etapa}
            atualizando={updateEtapa.isPending}
            onMudar={(etapa) => updateEtapa.mutate({ biddingId: bidding.id, etapa })}
            podeEditar={podeEditar}
          />
        </div>

        <div className="flex items-center gap-1 mt-4 border-b border-base-800 overflow-x-auto">
          {ABAS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold border-b-2 transition whitespace-nowrap ${
                aba === a.key ? 'border-accent-500 text-accent-300' : 'border-transparent text-base-500 hover:text-base-300'
              }`}
            >
              <a.icon className="w-3.5 h-3.5" /> {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 mt-5 flex flex-col gap-5">
        {aba === 'visao' && (
          <>
            <PainelStatus />
            <ResultadoLicitacao bidding={bidding} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Modalidade</p>
                <p className="text-[13px] text-base-200">{bidding.modalidade}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Data do Pregão</p>
                <p className="text-[13px] text-base-200">{new Date(bidding.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Valor Licitado</p>
                <p className="text-[13px] font-mono text-base-200">{formatBRL(bidding.valorLicitado)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Disputa</p>
                <p className="text-[13px] text-base-200">{bidding.tipoDisputa === 'Lote' ? 'Por Lote' : 'Por Item'}</p>
              </Card>
            </div>
          </>
        )}

        {aba === 'edital' && (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Edital</p>
              {edital ? (
                <div className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
                  <FileText className="w-5 h-5 text-accent-400 shrink-0" />
                  <span className="flex-1 text-[13px] text-base-200 truncate">{edital.name}</span>
                  <button onClick={() => handleVisualizarAnexo(edital)} title="Visualizar" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleAbrirAnexo(edital)} disabled={abrindo === edital.id} title="Abrir em nova aba" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {podeEditar && (
                    <button onClick={() => deleteAnexo.mutate(edital, { onSuccess: () => { limparAnalise.mutate(); limparAnaliseJuridica.mutate() } })} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : podeEditar ? (
                <label className="flex items-center gap-2 justify-center border border-dashed border-base-700 rounded-xl px-4 py-4 cursor-pointer hover:border-accent-500/40 hover:bg-base-850/40 transition text-base-400">
                  {enviando === 'Edital' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="text-[12px] font-medium">{enviando === 'Edital' ? `Enviando...${uploadProgress !== null ? ` ${uploadProgress}%` : ''}` : 'Enviar PDF do edital'}</span>
                  <input type="file" accept=".pdf" className="hidden" disabled={!!enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAnexo(f, 'Edital'); e.target.value = '' }} />
                </label>
              ) : (
                <p className="text-[12px] text-base-500 italic py-2">Nenhum edital enviado ainda.</p>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Termo de Referência</p>
              {termoReferencia ? (
                <div className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
                  <FileText className="w-5 h-5 text-accent-400 shrink-0" />
                  <span className="flex-1 text-[13px] text-base-200 truncate">{termoReferencia.name}</span>
                  <button onClick={() => handleVisualizarAnexo(termoReferencia)} title="Visualizar" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleAbrirAnexo(termoReferencia)} disabled={abrindo === termoReferencia.id} title="Abrir em nova aba" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {podeEditar && (
                    <button onClick={() => deleteAnexo.mutate(termoReferencia)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : podeEditar ? (
                <label className="flex items-center gap-2 justify-center border border-dashed border-base-700 rounded-xl px-4 py-4 cursor-pointer hover:border-accent-500/40 hover:bg-base-850/40 transition text-base-400">
                  {enviando === 'Termo de Referência' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="text-[12px] font-medium">{enviando === 'Termo de Referência' ? `Enviando...${uploadProgress !== null ? ` ${uploadProgress}%` : ''}` : 'Enviar PDF do TR'}</span>
                  <input type="file" accept=".pdf" className="hidden" disabled={!!enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAnexo(f, 'Termo de Referência'); e.target.value = '' }} />
                </label>
              ) : (
                <p className="text-[12px] text-base-500 italic py-2">Nenhum TR enviado ainda.</p>
              )}
            </div>

            <AnaliseEditalIA bidding={bidding} temEdital={!!edital} podeEditar={podeEditar} />

            <AnaliseJuridicaIA bidding={bidding} temEdital={!!edital} />

            {atestados.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> Ranking de Compatibilidade (Atestados Técnicos)
                </p>
                <div className="flex flex-col gap-1.5">
                  {rankingAtestados.map(({ atestado, similaridade }) => (
                    <div key={atestado.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-base-200 truncate">{atestado.nome}</p>
                        <p className="text-[11px] text-base-500 truncate">{atestado.objeto}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-[14px] font-extrabold font-mono ${
                          similaridade >= 60 ? 'text-positive-400' : similaridade >= 30 ? 'text-warning-400' : 'text-base-500'
                        }`}>
                          {similaridade}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-base-600 mt-1.5 italic">
                  Comparação por palavras-chave em comum — uma aproximação. Confira sempre o texto completo antes de decidir.
                </p>
              </div>
            )}
          </>
        )}

        {aba === 'checklist' && (
          <>
            <PainelStatus />
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
                  Checklist da Licitação
                  {totalObrigatorios > 0 && (
                    <span className="ml-2 text-base-400 normal-case font-normal">
                      {atendidosObrigatorios}/{totalObrigatorios} obrigatórios atendidos
                    </span>
                  )}
                </p>
                {podeEditar && (
                  <button onClick={() => setShowNovoItem((v) => !v)} className="flex items-center gap-1 text-[11px] text-accent-300 hover:text-accent-200 transition">
                    <Plus className="w-3 h-3" /> Adicionar item
                  </button>
                )}
              </div>

              {showNovoItem && (
                <div className="bg-base-850/60 border border-accent-500/20 rounded-xl p-3 flex flex-col gap-2 mb-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nº edital (ex: 5.2 a)"
                      value={novoItem.numeroEdital}
                      onChange={(e) => setNovoItem({ ...novoItem, numeroEdital: e.target.value })}
                      className="w-32 shrink-0 font-mono"
                    />
                    <Input
                      placeholder="Ex: Balanço Patrimonial 2025, Atestado de Capacidade Técnica..."
                      value={novoItem.descricao}
                      onChange={(e) => setNovoItem({ ...novoItem, descricao: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select value={novoItem.categoria} onChange={(e) => setNovoItem({ ...novoItem, categoria: e.target.value })} className="flex-1">
                      {CATEGORIAS_CHECKLIST.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                    <label className="flex items-center gap-1.5 text-[12px] text-base-400 shrink-0">
                      <input type="checkbox" checked={novoItem.obrigatorio} onChange={(e) => setNovoItem({ ...novoItem, obrigatorio: e.target.checked })} />
                      Obrigatório
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Prazo</label>
                      <Input type="date" value={novoItem.prazo} onChange={(e) => setNovoItem({ ...novoItem, prazo: e.target.value })} />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Responsável</label>
                      <Input placeholder="Nome de quem vai resolver" value={novoItem.responsavelNome} onChange={(e) => setNovoItem({ ...novoItem, responsavelNome: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setShowNovoItem(false)}>Cancelar</Button>
                    <Button onClick={handleAdicionarItem} disabled={!novoItem.descricao.trim() || addItem.isPending}>
                      {addItem.isPending ? 'Adicionando...' : 'Adicionar'}
                    </Button>
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <p className="text-[12px] text-base-500 italic py-2">Nenhum item no checklist ainda.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {items.map((item) => {
                    const status = statusItem(item)
                    const arquivo = arquivoResolvidoDoItem(item, clientDocs, atestados, anexos)
                    const temVinculoProprio = !!(item.clientDocumentId || item.atestadoId || item.attachedFileId)
                    const tipoConhecido = item.clientDocumentTipo
                    const ehAtestado = ehAtestadoTecnico(item)
                    // Só dá pra desmarcar de volta quando "atendido" foi um clique manual
                    // (sem nenhum documento vinculado por trás) — pros outros casos,
                    // desfazer é via "Desvincular" (X), que também limpa o vínculo real.
                    const somenteManual = !tipoConhecido && !ehAtestado && !temVinculoProprio
                    const aberto = itemAbertoId === item.id
                    const enviandoEste = enviandoItemId === item.id
                    return (
                      <div key={item.id} className="bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
                        <div className="flex items-start gap-3">
                          <div className="pt-0.5 shrink-0 flex">
                            {status === 'atendido' && (
                              podeEditar && somenteManual ? (
                                <button onClick={() => updateItem.mutate({ ...item, atendido: false })} title="Marcar como pendente">
                                  <CheckCircle2 className="w-4 h-4 text-positive-400 hover:text-positive-300 transition" />
                                </button>
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-positive-400" />
                              )
                            )}
                            {status === 'vencendo' && <AlertCircle className="w-4 h-4 text-warning-400" />}
                            {status === 'faltando' && (
                              podeEditar && somenteManual ? (
                                <button onClick={() => updateItem.mutate({ ...item, atendido: true })} title="Marcar como atendido">
                                  <Circle className="w-4 h-4 text-base-600 hover:text-base-400 transition" />
                                </button>
                              ) : (
                                <Circle className="w-4 h-4 text-base-700" />
                              )
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-base-200">
                              {item.numeroEdital && (
                                <span className="font-mono text-[10.5px] font-bold text-accent-300 bg-accent-500/10 rounded px-1.5 py-0.5 mr-1.5">
                                  {item.numeroEdital}
                                </span>
                              )}
                              {item.descricao}
                            </p>
                            <p className="text-[10px] text-base-500">
                              {item.categoria}
                              {item.obrigatorio && <span className="text-warning-400 ml-1.5">· obrigatório</span>}
                              {tipoConhecido && (
                                <span className="ml-1.5 text-accent-400">· certidão {CERT_CONFIG[tipoConhecido]?.label.split(' — ')[0]}</span>
                              )}
                              {item.prazo && (
                                <span className="ml-1.5">· prazo {new Date(item.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                              )}
                              {item.responsavelNome && (
                                <span className="ml-1.5">· {item.responsavelNome}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {arquivo && (
                              <button onClick={() => handleVerArquivoDoItem(item)} title="Ver PDF" className="p-1.5 text-accent-300 hover:text-accent-200 hover:bg-base-800 rounded transition">
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {podeEditar && (
                              <button
                                onClick={() => handleAbrirItem(item)}
                                title={tipoConhecido ? 'Buscar / enviar certidão' : ehAtestado ? 'Salvar atestado' : 'Enviar documento'}
                                className={`p-1.5 rounded transition ${aberto ? 'text-accent-300 bg-accent-500/10' : 'text-base-400 hover:text-accent-300 hover:bg-base-800'}`}
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {podeEditar && temVinculoProprio && (
                              <button onClick={() => handleDesvincularItem(item)} title="Desvincular (o arquivo continua no repositório do cliente)" className="p-1.5 text-base-500 hover:text-negative-400 hover:bg-base-800 rounded transition">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {podeEditar && (
                              <button onClick={() => deleteItem.mutate(item)} title="Excluir item" className="p-1.5 text-base-500 hover:text-negative-400 hover:bg-base-800 rounded transition">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {arquivo && (
                          <p className="text-[10.5px] text-base-500 mt-1.5 pl-7 flex items-center gap-1 truncate">
                            <FileText className="w-3 h-3 shrink-0" /> {arquivo.nome}
                          </p>
                        )}

                        {aberto && podeEditar && (
                          <div className="mt-2.5 pt-2.5 border-t border-dashed border-base-700/60 flex flex-col gap-2.5">
                            {tipoConhecido && (
                              <>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Button
                                    variant="secondary"
                                    onClick={() => buscarAutomatico(tipoConhecido)}
                                    disabled={!clienteDaLicitacao?.cnpj || buscando === tipoConhecido}
                                  >
                                    {buscando === tipoConhecido ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                    {buscando === tipoConhecido ? 'Disparando...' : 'Buscar auto'}
                                  </Button>
                                  {!clienteDaLicitacao?.cnpj && <span className="text-[11px] text-base-500 italic">CNPJ do cliente necessário pra busca automática</span>}
                                </div>

                                {avisosBusca[tipoConhecido] && (
                                  <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-2.5 flex items-start gap-2">
                                    <Info className="w-3.5 h-3.5 text-accent-400 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-accent-300 flex-1">{avisosBusca[tipoConhecido]}</p>
                                    <button onClick={() => limparAviso(tipoConhecido)} className="text-base-500 hover:text-base-300"><X className="w-3 h-3" /></button>
                                  </div>
                                )}
                                {errosBusca[tipoConhecido] && (
                                  <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-2.5 flex items-start gap-2">
                                    <AlertCircle className="w-3.5 h-3.5 text-negative-400 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-negative-400 flex-1">{errosBusca[tipoConhecido]}</p>
                                    <button onClick={() => limparErro(tipoConhecido)} className="text-base-500 hover:text-base-300"><X className="w-3 h-3" /></button>
                                  </div>
                                )}

                                <AcoesDocumentoManual
                                  clientId={bidding.clientId}
                                  tipo={tipoConhecido}
                                  nomeDocumento={CERT_CONFIG[tipoConhecido].label}
                                  uploadAndSave={uploadClientDoc.mutateAsync}
                                />

                                <div className="flex items-center gap-2 flex-wrap bg-base-900/40 border border-base-800 rounded-lg p-2.5">
                                  <span className="text-[11px] text-base-400 shrink-0">Enviar PDF já em mãos:</span>
                                  <input
                                    type="date" value={dataValidadeCert} onChange={(e) => setDataValidadeCert(e.target.value)}
                                    className="bg-base-850 border border-base-700 rounded-lg px-2 py-1 text-[12px] text-base-100 focus:border-accent-400 outline-none"
                                  />
                                  <input
                                    type="file" accept=".pdf,.png,.jpg" onChange={(e) => setCertFileSelecionado(e.target.files?.[0] ?? null)}
                                    className="text-[11px] text-base-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-accent-500 file:text-base-950 file:font-semibold file:text-[11px] hover:file:bg-accent-400 file:cursor-pointer"
                                  />
                                  <Button
                                    onClick={() => certFileSelecionado && handleEnviarCertidao(item, certFileSelecionado)}
                                    disabled={!certFileSelecionado || !dataValidadeCert || enviandoEste}
                                  >
                                    {enviandoEste ? 'Salvando...' : 'Salvar'}
                                  </Button>
                                </div>
                              </>
                            )}

                            {ehAtestado && (
                              <div className="bg-base-900/40 border border-base-800 rounded-lg p-2.5 flex flex-col gap-2">
                                <p className="text-[11px] text-accent-300 font-semibold">Salvar como Atestado de Capacidade Técnica (fica no repositório do cliente, reaproveitável em outras licitações)</p>
                                <Input placeholder="Nome / identificação do atestado" value={atestadoForm.nome} onChange={(e) => setAtestadoForm({ ...atestadoForm, nome: e.target.value })} />
                                <textarea
                                  value={atestadoForm.objeto}
                                  onChange={(e) => setAtestadoForm({ ...atestadoForm, objeto: e.target.value })}
                                  rows={2}
                                  placeholder="Objeto do atestado (usado pra comparar com outros editais)"
                                  className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 placeholder:text-base-500 focus:border-accent-400 outline-none"
                                />
                                <div className="grid grid-cols-3 gap-2">
                                  <Input placeholder="Órgão emissor" value={atestadoForm.orgaoEmissor} onChange={(e) => setAtestadoForm({ ...atestadoForm, orgaoEmissor: e.target.value })} />
                                  <Input type="number" step="0.01" placeholder="Valor (R$)" value={atestadoForm.valor} onChange={(e) => setAtestadoForm({ ...atestadoForm, valor: e.target.value })} />
                                  <Input type="date" value={atestadoForm.dataEmissao} onChange={(e) => setAtestadoForm({ ...atestadoForm, dataEmissao: e.target.value })} />
                                </div>
                                <input
                                  type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setAtestadoFileSelecionado(e.target.files?.[0] ?? null)}
                                  className="text-[11px] text-base-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-accent-500 file:text-base-950 file:font-semibold file:text-[11px] hover:file:bg-accent-400 file:cursor-pointer"
                                />
                                <div className="flex justify-end">
                                  <Button
                                    onClick={() => handleSalvarAtestadoDoItem(item, atestadoFileSelecionado)}
                                    disabled={!atestadoForm.nome.trim() || !atestadoForm.objeto.trim() || enviandoEste}
                                  >
                                    {enviandoEste ? 'Salvando...' : 'Salvar Atestado'}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {!tipoConhecido && !ehAtestado && (
                              <div className="flex items-center gap-2 flex-wrap bg-base-900/40 border border-base-800 rounded-lg p-2.5">
                                <span className="text-[11px] text-base-400">Enviar documento (fica salvo no repositório do cliente, pasta "{item.categoria || 'Documentos Gerais'}"):</span>
                                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 cursor-pointer transition">
                                  {enviandoEste ? 'Enviando...' : 'Escolher arquivo'}
                                  <input
                                    type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" disabled={enviandoEste}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleEnviarDocumentoGenerico(item, f); e.target.value = '' }}
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {aba === 'proposta-inicial' && <AbaCadastrarProposta bidding={bidding} />}

        {aba === 'proposta' && <AbaProposta bidding={bidding} />}

        {aba === 'documentos' && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[12px] text-base-500">Pronto pra enviar pra plataforma? Baixe só o que precisa.</p>
              <Button variant="secondary" onClick={() => setMostrarDownloadModal(true)}>
                <FolderDown className="w-4 h-4" /> Baixar documentos
              </Button>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Documentação do Checklist</p>
              {itensComAnexo.length === 0 ? (
                <p className="text-[12px] text-base-500 italic py-2">
                  Nenhum documento anexado no checklist ainda — anexe pela aba <strong className="text-base-300">Checklist &amp; Habilitação</strong>.
                </p>
              ) : (
                <div className="bg-base-850/60 border border-base-800 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-base-800 rounded-full overflow-hidden">
                      <div className="h-full bg-positive-500 rounded-full" style={{ width: `${Math.round((itensComAnexo.length / items.length) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-positive-400 shrink-0">{itensComAnexo.length}/{items.length} anexados</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {itensComAnexo.map(({ item, arquivo }) => (
                      <div key={item.id} className="flex items-start gap-2 text-[12px] text-base-300 py-1">
                        {item.numeroEdital && <span className="font-mono text-[10px] font-bold text-accent-300 bg-accent-500/10 rounded px-1.5 py-0.5 shrink-0 mt-0.5">{item.numeroEdital}</span>}
                        <span className="flex-1 min-w-0">{item.descricao}</span>
                        <button onClick={() => handleVisualizarAnexo({ id: item.id, name: arquivo.nome, storagePath: arquivo.storagePath })} title="Ver PDF" className="p-1 text-base-400 hover:text-accent-300 transition shrink-0 mt-0.5">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Proposta</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
                  <FileText className="w-5 h-5 text-accent-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-base-200 truncate">{propostaEnviada ? propostaEnviada.name : 'Proposta enviada na plataforma'}</p>
                    {!propostaEnviada && <p className="text-[10.5px] text-base-500">o que você importou/enviou de volta pro portal</p>}
                  </div>
                  {propostaEnviada ? (
                    <>
                      <button onClick={() => handleVisualizarAnexo(propostaEnviada)} title="Visualizar" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      {podeEditar && (
                        <label title="Trocar" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition cursor-pointer">
                          {enviando === 'Proposta' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          <input type="file" accept=".pdf,.doc,.docx" className="hidden" disabled={!!enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) { deleteAnexo.mutate(propostaEnviada); handleUploadAnexo(f, 'Proposta') } e.target.value = '' }} />
                        </label>
                      )}
                      {podeEditar && (
                        <button onClick={() => deleteAnexo.mutate(propostaEnviada)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  ) : podeEditar ? (
                    <label className="inline-flex items-center gap-1.5 shrink-0 bg-base-800 hover:bg-base-700 text-base-200 border border-base-700 font-semibold text-sm px-4 py-2 rounded-lg transition cursor-pointer">
                      {enviando === 'Proposta' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {enviando === 'Proposta' ? `Enviando...${uploadProgress !== null ? ` ${uploadProgress}%` : ''}` : 'Enviar'}
                      <input type="file" accept=".pdf,.doc,.docx" className="hidden" disabled={!!enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAnexo(f, 'Proposta'); e.target.value = '' }} />
                    </label>
                  ) : null}
                </div>

                <div className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
                  <Wand2 className="w-5 h-5 text-accent-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-base-200 truncate">{propostaReadequada ? propostaReadequada.name : 'Proposta Readequada'}</p>
                    <p className="text-[10.5px] text-base-500">{propostaReadequada ? 'gerada a partir dos itens/valores atuais' : 'gerada a partir dos itens/valores atuais da licitação'}</p>
                  </div>
                  {propostaReadequada && (
                    <button onClick={() => handleAbrirAnexo(propostaReadequada)} disabled={abrindo === propostaReadequada.id} title="Baixar" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {podeEditar && (
                    <Button variant="secondary" onClick={handleGerarPropostaReadequada} disabled={gerandoReadequada} className="shrink-0">
                      {gerandoReadequada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                      {gerandoReadequada ? 'Gerando...' : propostaReadequada ? 'Gerar novamente' : 'Gerar'}
                    </Button>
                  )}
                </div>
                {erroReadequada && (
                  <p className="text-[11.5px] text-negative-400">{erroReadequada}</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Contrato Final</p>
              {contrato ? (
                <div className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
                  <FileSignature className="w-5 h-5 text-accent-400 shrink-0" />
                  <span className="flex-1 text-[13px] text-base-200 truncate">{contrato.name}</span>
                  <button onClick={() => handleVisualizarAnexo(contrato)} title="Visualizar" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleAbrirAnexo(contrato)} disabled={abrindo === contrato.id} title="Abrir em nova aba" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {podeEditar && (
                    <button onClick={() => deleteAnexo.mutate(contrato)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : podeEditar ? (
                <label className="flex items-center gap-2 justify-center border border-dashed border-base-700 rounded-xl px-4 py-4 cursor-pointer hover:border-accent-500/40 hover:bg-base-850/40 transition text-base-400">
                  {enviando === 'Contrato' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="text-[12px] font-medium">{enviando === 'Contrato' ? `Enviando...${uploadProgress !== null ? ` ${uploadProgress}%` : ''}` : 'Enviar PDF do contrato assinado'}</span>
                  <input type="file" accept=".pdf" className="hidden" disabled={!!enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAnexo(f, 'Contrato'); e.target.value = '' }} />
                </label>
              ) : (
                <p className="text-[12px] text-base-500 italic py-2">Nenhum contrato enviado ainda.</p>
              )}
            </div>

            <div className="bg-base-850/60 border border-base-800 rounded-lg p-3 text-[12px] text-base-400 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-base-500" />
              <span>
                Documentos institucionais do cliente (contrato social, atestados, certidões) não ficam aqui — eles vivem na
                pasta do próprio cliente, em <strong className="text-base-300">Cadastros → Documentos de Habilitação</strong>. O envio pra
                plataforma do órgão continua manual — cada portal de compras é diferente.
              </span>
            </div>
          </>
        )}

        {aba === 'sessao' && <AbaSessaoAoVivo bidding={bidding} />}
      </div>

      <PdfViewerModal
        open={!!visualizando}
        onClose={() => setVisualizando(null)}
        nome={visualizando?.nome ?? ''}
        url={visualizando?.url ?? null}
      />

      <DownloadDocumentosModal
        open={mostrarDownloadModal}
        onClose={() => setMostrarDownloadModal(false)}
        items={items}
        anexos={anexos}
        clientDocs={clientDocs}
        atestados={atestados}
        propostaEnviada={propostaEnviada ?? null}
        propostaReadequada={propostaReadequada ?? null}
        contrato={contrato ?? null}
        getDownloadUrl={getAnexoUrl}
        nomeLicitacao={bidding.numeroEdital || bidding.objeto}
      />
    </div>
  )
}
