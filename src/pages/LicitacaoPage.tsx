import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, FileText, Upload, Plus, Trash2, CheckCircle2, Circle, Download, Eye,
  AlertCircle, Loader2, Sparkles, Award, Check, History, ChevronDown, ChevronUp,
  ClipboardList, Gavel, Wallet, Send, CircleDot, FileSignature, Info, Activity, RefreshCw, Wand2,
  Paperclip, FolderDown, X, FileSpreadsheet, ScrollText, Copy, Printer, Calculator, Ban, RotateCcw, Archive, Lock,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromBiddingItemRow, toBiddingItemInsert } from '../lib/mappers'
import { useAuth } from '../hooks/useAuth'
import { Button, Input, Select, Textarea, IconButton } from '../components/ui/FormControls'
import { Drawer } from '../components/ui/Drawer'
import { UndoToast } from '../components/ui/UndoToast'
import { PageHeader, Card, StatusBadge } from '../components/ui/Primitives'
import { useUndoableDelete } from '../hooks/useUndoableAction'
import { SkeletonTableRows, SkeletonList } from '../components/ui/Skeleton'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import PdfViewerModal from '../components/ui/PdfViewerModal'
import Modal from '../components/ui/Modal'
import { formatBRL } from '../hooks/useAccountBalances'
import { useAttachedFiles } from '../hooks/useAttachedFiles'
import { useBiddingChecklist, calcularHabilitacao, statusItemChecklist, arquivoResolvidoDoItem, certidaoDisponivelParaItem, extrairNumeroEdital } from '../hooks/useBiddingChecklist'
import { useDeclaracaoAnexos } from '../hooks/useDeclaracaoAnexos'
import { useBuscaCertidaoAutomatica } from '../hooks/useBuscaCertidaoAutomatica'
import AcoesDocumentoManual from '../components/documentos/AcoesDocumentoManual'
import DownloadDocumentosModal from '../components/licitacao/DownloadDocumentosModal'
import DeclaracaoAnexosPanel from '../components/licitacao/DeclaracaoAnexosPanel'
import { useBiddingAnalysis } from '../hooks/useBiddingAnalysis'
import { useAuditLogPorEntidade } from '../hooks/useAuditLog'
import { useAnaliseJuridicaEdital, useLimparAnaliseJuridica } from '../hooks/useAnaliseJuridicaEdital'
import type { TipoAnaliseJuridica } from '../hooks/useAnaliseJuridicaEdital'
import { AnaliseEditalResumo } from '../components/shared/AnaliseEditalResumo'
import { PerguntaEditalPanel } from '../components/shared/PerguntaEditalPanel'
import { usePerguntaEdital } from '../hooks/usePerguntaEdital'
import { AnaliseJuridicaTabs } from '../components/shared/AnaliseJuridicaTabs'
import { useBiddingItems } from '../hooks/useBiddingItems'
import { usePricingProfiles } from '../hooks/usePricingProfiles'
import { calcularValorMinimo, somarLinhasPorTipo } from '../lib/precificacao'
import { useBiddingItemVersions } from '../hooks/useBiddingItemVersions'
import { useClientDocuments, calcDocStatus } from '../hooks/useClientDocuments'
import { useAtestados, calcularSimilaridade } from '../hooks/useAtestados'
import { useBiddings, recalcularValorGanhoSeAutomatico } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import BiddingItemsEditor from '../components/cadastros/BiddingItemsEditor'
import UnlockWithPasswordDialog from '../components/ui/UnlockWithPasswordDialog'
import { useBiddingEditLock } from '../lib/biddingLock'
import {
  parseCsvPortal, stringifyCsvPortal, textoParaBlobLatin1, bufferParaTextoLatin1, formatarNumeroPtBR, detectarColunasPortal,
} from '../lib/csvPortalCompras'
import type { ColunasPortal } from '../lib/csvPortalCompras'
import { parseFlexibleNumber, compararNumeroItem, normalizarNumeroItem } from '../lib/numberParsing'
import { mapearCamposDaAnalise, mapearItensDaAnalise, somarValorLicitado, mensagemAmigavelErroAnalise } from '../lib/analiseEdital'
import { useToast } from '../hooks/useToast'
import { CERT_CONFIG } from '../types/domain'
import type { AnaliseEdital, AttachedFile, Bidding, BiddingChecklistItem, BiddingEtapa, BiddingItem, BiddingStatus, Client } from '../types/domain'

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
  { key: 'precificacao', label: 'Precificação', icon: Calculator },
  { key: 'proposta', label: 'Proposta Readequada', icon: Wallet },
  { key: 'documentos', label: 'Documentos de Habilitação', icon: FileSignature },
  { key: 'documentos-processo', label: 'Documentos do Processo', icon: Archive },
  { key: 'sessao', label: 'Sessão Ao Vivo', icon: Activity },
  { key: 'historico', label: 'Histórico', icon: ScrollText },
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
      const { data, error } = await supabase.from('bidding_items').select('*').eq('bidding_id', biddingId!)
      if (error) throw error
      // Ordena no cliente com comparador numérico (ver compararNumeroItem)
      // — numero_item é texto livre, ORDER BY do Postgres é lexicográfico.
      return data.map(fromBiddingItemRow).sort((a, b) => compararNumeroItem(a.numeroItem, b.numeroItem))
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

      // O rateio muda o valor ofertado dos itens — se a licitação já está
      // Ganhou + Adjudicada e Homologada e o Valor Ganho de Fato ainda não
      // tinha sido preenchido (ver recalcularValorGanhoSeAutomatico), esse é
      // o momento certo de calculá-lo a partir dos itens atualizados.
      await recalcularValorGanhoSeAutomatico(biddingId!)
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
          || (novo.lote ?? null) !== (original.lote ?? null)
          || novo.descricao !== original.descricao
          || (novo.unidade ?? null) !== (original.unidade ?? null)
          || novo.quantidade !== original.quantidade
          || (novo.marca ?? null) !== (original.marca ?? null)
          || (novo.referencia ?? null) !== (original.referencia ?? null)
          || novo.valorUnitarioLicitado !== original.valorUnitarioLicitado
          || (novo.valorUnitarioOfertado ?? null) !== (original.valorUnitarioOfertado ?? null)
          || (novo.ganhou ?? false) !== original.ganhou
        if (!mudou) continue
        // Nunca grava descrição em branco por cima de uma já preenchida —
        // mesma proteção aplicada abaixo pros itens novos (paraInserir):
        // um item sem descrição vira linha vazia na Proposta em PDF e nos
        // totais do Kanban, sem nenhum aviso.
        const descricaoValida = (novo.descricao ?? '').trim() ? novo.descricao! : original.descricao
        const { error } = await supabase.from('bidding_items').update({
          numero_item: novo.numeroItem ?? '',
          lote: novo.lote ?? null,
          descricao: descricaoValida,
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

      // Descarta itens novos sem descrição — a coluna é NOT NULL mas aceita
      // string vazia, e um item sem descrição vira linha vazia na Proposta
      // em PDF e nos totais do Kanban, sem nenhum aviso.
      const paraInserir = novosItems.filter((i) => !i.id && (i.descricao ?? '').trim())
      if (paraInserir.length > 0) {
        const rows = paraInserir.map((i) => toBiddingItemInsert({ ...i, biddingId }, user.id))
        const { error } = await supabase.from('bidding_items').insert(rows)
        if (error) throw error
      }

      // Se a licitação já está Ganhou + Adjudicada e Homologada e o Valor
      // Ganho de Fato ainda não tinha sido preenchido (comum quando o
      // resultado é registrado ANTES de marcar quais itens "Ganhou" nesta
      // aba), esse é o momento certo de calculá-lo a partir dos itens que
      // acabaram de ser salvos — ver recalcularValorGanhoSeAutomatico.
      await recalcularValorGanhoSeAutomatico(biddingId!)

      return { precisaResincronizar: paraInserir.length > 0 }
    },
    // Sempre invalida, mesmo quando só houve UPDATE (precisaResincronizar
    // false): a otimização antiga de só invalidar em INSERT parecia segura
    // — updates não mudam o conjunto de ids — mas quando dois componentes
    // têm cada um sua cópia local dos itens, um componente com uma cópia
    // desatualizada podia chamar sincronizarItens de novo, o diff comparar
    // contra o valor já revertido no banco e reescrever por cima da edição
    // real que tinha acabado de ser salva. Invalidar sempre garante que
    // toda cópia local seja refeita a partir do banco antes da próxima
    // sincronização.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bidding_items', biddingId] })
      queryClient.invalidateQueries({ queryKey: ['biddings'] })
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
  const { nivel, carregando: carregandoPermissao } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao' && !carregandoPermissao
  const [status, setStatus] = useState<BiddingStatus>(bidding.status)
  const [motivo, setMotivo] = useState(bidding.motivoPerda ?? '')
  const [motivoDesistencia, setMotivoDesistencia] = useState(bidding.motivoDesistencia ?? '')
  const [motivoCancelamento, setMotivoCancelamento] = useState(bidding.motivoCancelamento ?? '')

  const mudou = status !== bidding.status
    || (status === 'Perdeu' && motivo !== (bidding.motivoPerda ?? ''))
    || (status === 'Desistiu' && motivoDesistencia !== (bidding.motivoDesistencia ?? ''))
    || (status === 'Cancelada' && motivoCancelamento !== (bidding.motivoCancelamento ?? ''))

  if (!podeEditar) {
    return (
      <div className="text-[12px] text-base-500">
        Resultado: <span className="font-semibold text-base-300">{bidding.status}</span>
        {bidding.motivoPerda && <span> — {bidding.motivoPerda}</span>}
        {bidding.motivoDesistencia && <span> — {bidding.motivoDesistencia}</span>}
        {bidding.motivoCancelamento && <span> — {bidding.motivoCancelamento}</span>}
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
            <option value="Desistiu">Desistiu (cliente)</option>
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
        {status === 'Desistiu' && (
          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Motivo da desistência do cliente"
              value={motivoDesistencia}
              onChange={(e) => setMotivoDesistencia(e.target.value)}
            />
          </div>
        )}
        {status === 'Cancelada' && (
          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Motivo do cancelamento (órgão cancelou o edital)"
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
            />
          </div>
        )}
        <Button
          onClick={() => marcarResultado.mutate({ biddingId: bidding.id, status, motivoPerda: motivo, motivoDesistencia, motivoCancelamento })}
          disabled={!mudou || marcarResultado.isPending}
        >
          {marcarResultado.isPending ? 'Salvando...' : 'Salvar Resultado'}
        </Button>
      </div>
      <p className="text-[11px] text-base-500">
        Registrar o motivo quando perde ou o cliente desiste é o que alimenta o relatório mensal pro cliente depois — sem isso, o "porquê" se perde.
      </p>
    </div>
  )
}

function HistoricoVersoes({ biddingId }: { biddingId: string }) {
  const { versoes, isLoading, marcarComoEnviada } = useBiddingItemVersions(biddingId)
  const { nivel, carregando: carregandoPermissao } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao' && !carregandoPermissao
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
// (AbaProposta logo abaixo), que é o valor final depois de ganhar.
//
// O modelo que o Portal gera pra cada processo já vem com as colunas
// "Não edite" (Processo, ID, [Lote,] Item, Produto, Quantidade)
// preenchidas — só o Portal sabe esses valores, então a única forma
// segura de não estragar o arquivo é nunca reconstruir essas colunas:
// parte da linha ORIGINAL do modelo (todas as colunas, na ordem exata) e
// troca só as editáveis (Modelo/Marca/ANVISA/Descrição/Valor
// unitário/Valor total). A coluna Lote é opcional — confirmado com um
// modelo real sem lotes — por isso as colunas são achadas pelo texto do
// próprio cabeçalho do arquivo (detectarColunasPortal), nunca por
// posição fixa. Como o modelo não muda entre exportações da mesma
// licitação, ele é salvo uma vez (useAttachedFiles, categoria 'Modelo
// Portal Compras') e reaproveitado nas exportações seguintes.
const CATEGORIA_MODELO_PORTAL = 'Modelo Portal Compras' as const

// "Participa" começa pré-marcado a partir da mesma seleção já feita na
// aba Edital & Análise (AnaliseEdital.itens[].participando, os checkboxes
// "Part." do Resumo Técnico) — casado pelo número do item, não pela
// existência em bidding_items (que pode nem estar sincronizado ainda
// nesta fase). Um item do modelo que a IA não identificou na análise
// fica participando por padrão (mesma semântica opt-out de participando
// em toda a base). Em qualquer caso, o checkbox aqui é só o ponto de
// partida — sempre editável, pro usuário ajustar se precisar.
type EdicaoLinhaPortal = { participa: boolean; modelo: string; marca: string; anvisa: string; descricao: string; valorUnitario: string }
type ModeloPortalLido = { cabecalho: string[]; linhas: string[][]; colunas: ColunasPortal }

function edicaoLinhaPadrao(
  linhaModelo: string[], colunas: ColunasPortal, itemPorNumero: Map<string, BiddingItem>, participandoPorNumero: Map<string, boolean>
): EdicaoLinhaPortal {
  const numeroItem = normalizarNumeroItem(linhaModelo[colunas.item])
  const item = itemPorNumero.get(numeroItem)
  return {
    participa: participandoPorNumero.get(numeroItem) ?? true,
    modelo: '',
    marca: item?.marca ?? '',
    anvisa: '',
    descricao: `${linhaModelo[colunas.produto]} Conforme edital`,
    valorUnitario: item ? formatarNumeroPtBR(item.valorUnitarioLicitado) : '',
  }
}

function AbaCadastrarProposta({ bidding }: { bidding: Bidding }) {
  const { items, isLoading: isLoadingItems } = useBiddingItemsDaLicitacao(bidding.id)
  const { analysis, isLoading: isLoadingAnalysis } = useBiddingAnalysis(bidding.id)
  const { nivel, carregando: carregandoPermissao } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao' && !carregandoPermissao
  const { showToast } = useToast()
  const { files: anexos, isLoading: isLoadingAnexos, uploadFile, deleteFile } = useAttachedFiles('licitacao', bidding.id)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [enviandoModelo, setEnviandoModelo] = useState(false)

  // Casa a mesma seleção "participa" já feita na aba Edital & Análise
  // (checkboxes "Part." do Resumo Técnico) pelo número do item — é o
  // ponto de partida do checkbox aqui, não a fonte definitiva.
  const participandoPorNumero = useMemo(() => {
    const analise = (analysis?.analise ?? null) as AnaliseEdital | null
    const mapa = new Map<string, boolean>()
    analise?.itens?.forEach((it) => {
      const numero = it.numero != null ? normalizarNumeroItem(String(it.numero)) : null
      if (numero) mapa.set(numero, it.participando !== false)
    })
    return mapa
  }, [analysis])

  const modeloArquivo = anexos.find((f) => f.category === CATEGORIA_MODELO_PORTAL) ?? null

  const modeloQuery = useQuery({
    queryKey: ['modelo-portal-compras-conteudo', modeloArquivo?.id],
    enabled: !!modeloArquivo,
    queryFn: async (): Promise<ModeloPortalLido> => {
      const { data, error } = await supabase.storage.from('client-documents').createSignedUrl(modeloArquivo!.storagePath, 300)
      if (error || !data) throw new Error('Não foi possível ler o modelo salvo.')
      const res = await fetch(data.signedUrl)
      if (!res.ok) throw new Error('Não foi possível baixar o modelo salvo.')
      const texto = bufferParaTextoLatin1(await res.arrayBuffer())
      const todasLinhas = parseCsvPortal(texto)
      const [cabecalho, ...resto] = todasLinhas
      const colunas = cabecalho ? detectarColunasPortal(cabecalho) : null
      if (!colunas) throw new Error('Não reconheci as colunas desse arquivo como um modelo do Portal — confira se é mesmo o CSV que o Portal gerou pra esta licitação.')
      // Descarta linhas que não têm a mesma quantidade de colunas do
      // cabeçalho (ex: quebra de linha sobrando no fim do arquivo).
      const linhas = resto.filter((l) => l.length === cabecalho.length)
      return { cabecalho, linhas, colunas }
    },
  })

  const linhasModelo = useMemo(() => modeloQuery.data?.linhas ?? [], [modeloQuery.data])
  const colunas = modeloQuery.data?.colunas ?? null
  const temLote = colunas?.lote != null
  const itemPorNumero = useMemo(() => new Map(items.map((i) => [normalizarNumeroItem(i.numeroItem), i])), [items])

  const [edicoes, setEdicoes] = useState<EdicaoLinhaPortal[]>([])
  // Preenche os campos editáveis sozinho assim que o modelo carrega — só
  // uma vez por arquivo-modelo, pra não sobrescrever edições já feitas
  // (ajuste de estado durante o render, comparando com um marcador, em
  // vez de useEffect — mesmo padrão já usado nesta página).
  const [carregadoPara, setCarregadoPara] = useState<string | null>(null)
  if (linhasModelo.length > 0 && colunas && !isLoadingAnalysis && carregadoPara !== modeloArquivo?.id) {
    setEdicoes(linhasModelo.map((linha) => edicaoLinhaPadrao(linha, colunas, itemPorNumero, participandoPorNumero)))
    setCarregadoPara(modeloArquivo?.id ?? null)
  }

  const atualizarEdicao = (idx: number, patch: Partial<EdicaoLinhaPortal>) => {
    setEdicoes((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }

  // O Portal rejeita o arquivo inteiro se uma linha PARTICIPANTE (checkbox
  // marcado) tiver Valor Unitário zerado ou em branco ("O valor unitário
  // deve ser maior do que zero") — confirmado tentando subir um export de
  // verdade. Detecta isso ANTES de gerar o arquivo, em vez de deixar o
  // usuário só descobrir depois de subir no site.
  const indicesSemValorUnitario = useMemo(
    () => edicoes.reduce<number[]>((acc, e, idx) => {
      if (e.participa && (parseFlexibleNumber(e.valorUnitario) ?? 0) <= 0) acc.push(idx)
      return acc
    }, []),
    [edicoes]
  )

  const handleUploadModelo = async (file: File) => {
    setEnviandoModelo(true)
    try {
      const anterior = modeloArquivo
      await uploadFile.mutateAsync({ file, category: CATEGORIA_MODELO_PORTAL })
      // "Trocar modelo" substitui o anterior — sem isso, o arquivo velho
      // ficaria no meio e a busca por categoria passaria a depender da
      // ordenação (mais recente primeiro) em vez de ter só um candidato.
      if (anterior) await deleteFile.mutateAsync(anterior)
    } catch (err) {
      showToast(`Erro ao salvar o modelo do Portal: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviandoModelo(false)
    }
  }

  const handleExportarCsv = () => {
    if (!modeloQuery.data) return
    if (indicesSemValorUnitario.length > 0) {
      const numerosItem = indicesSemValorUnitario
        .map((idx) => modeloQuery.data!.linhas[idx]?.[modeloQuery.data!.colunas.item])
        .filter(Boolean)
        .slice(0, 6)
        .join(', ')
      showToast(
        `O Portal rejeita o arquivo se algum item que você participa ficar com Valor Unitário zerado. Preencha o item ${numerosItem}${indicesSemValorUnitario.length > 6 ? ' e outros' : ''} antes de exportar.`,
        'error'
      )
      return
    }
    if (!edicoes.some((e) => e.participa)) {
      showToast('Nenhum item está marcado como "Participa" — não há o que exportar.', 'error')
      return
    }
    const { cabecalho, linhas, colunas: colunasSaida } = modeloQuery.data
    // O Portal exige Valor Unitário > 0 em TODA linha presente no
    // arquivo, sem exceção pra item zerado (confirmado tentando subir um
    // export com uma linha zerada — rejeitado mesmo com o item marcado
    // como não participante). A única forma de deixar um item de fora da
    // proposta é a linha dele nem aparecer no arquivo, então itens
    // desmarcados são omitidos do export, não zerados.
    const linhasSaida = linhas
      .map((linha, idx) => ({ linha, idx }))
      .filter(({ idx }) => edicoes[idx]?.participa)
      .map(({ linha, idx }) => {
        const edicao = edicoes[idx]
        const quantidade = parseFlexibleNumber(linha[colunasSaida.quantidade]) ?? 0
        const valorUnitario = parseFlexibleNumber(edicao?.valorUnitario ?? '') ?? 0
        const saida = [...linha]
        saida[colunasSaida.modelo] = edicao?.modelo ?? ''
        saida[colunasSaida.marca] = edicao?.marca ?? ''
        saida[colunasSaida.anvisa] = edicao?.anvisa ?? ''
        saida[colunasSaida.descricao] = edicao?.descricao ?? ''
        saida[colunasSaida.valorUnitario] = formatarNumeroPtBR(valorUnitario)
        saida[colunasSaida.valorTotal] = formatarNumeroPtBR(quantidade * valorUnitario)
        return saida
      })
    const texto = stringifyCsvPortal([cabecalho, ...linhasSaida])
    const blob = textoParaBlobLatin1(texto)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const nomeBase = (bidding.numeroEdital ?? bidding.id).replace(/[^\w-]+/g, '_')
    a.download = `Proposta_Inicial_${nomeBase}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const botaoTrocarModelo = podeEditar && (
    <>
      <input
        ref={fileInputRef} type="file" accept=".csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadModelo(f); e.target.value = '' }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={enviandoModelo}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-accent-300 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
      >
        {enviandoModelo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        {enviandoModelo ? 'Enviando...' : 'Trocar Modelo do Portal'}
      </button>
    </>
  )

  if (isLoadingItems || isLoadingAnexos || isLoadingAnalysis) return <SkeletonTableRows linhas={4} colunas={5} />

  if (!modeloArquivo) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Proposta Inicial — Modelo do Portal de Compras Públicas</p>
          <p className="text-[12px] text-base-400">
            Suba o CSV-modelo que o Portal gera pra esta licitação — as colunas Processo, ID, Lote (quando houver), Item, Produto e Quantidade já vêm preenchidas por ele e nunca são alteradas aqui. Salvamos esse modelo uma vez pra você não precisar subir de novo nas próximas exportações.
          </p>
        </div>
        {podeEditar && (
          <div>
            <input
              ref={fileInputRef} type="file" accept=".csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadModelo(f); e.target.value = '' }}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={enviandoModelo}>
              {enviandoModelo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {enviandoModelo ? 'Enviando...' : 'Subir Modelo do Portal (CSV)'}
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (modeloQuery.isLoading) return <SkeletonTableRows linhas={4} colunas={5} />

  if (modeloQuery.isError || !colunas || linhasModelo.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-negative-500/10 border border-negative-500/25 rounded-xl p-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-negative-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-negative-300">
            {modeloQuery.isError
              ? (modeloQuery.error instanceof Error ? modeloQuery.error.message : 'Não foi possível ler o modelo salvo.')
              : 'O modelo salvo não tem nenhuma linha de dados reconhecível — confira se é mesmo o CSV que o Portal gerou pra esta licitação.'}
          </p>
        </div>
        {podeEditar && <div className="flex items-center gap-3">{botaoTrocarModelo}</div>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-base-850/60 border border-accent-500/20 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Proposta Inicial — Modelo do Portal de Compras Públicas</p>
        <p className="text-[12px] text-base-400">
          Processo, ID{temLote ? ', Lote' : ''}, Item, Produto e Quantidade vêm exatamente como no modelo salvo do Portal ("{modeloArquivo.name}") — não são editáveis aqui. "Participa" já vem marcado conforme a seleção feita na aba Edital & Análise, mas continua editável aqui se precisar ajustar. Nos itens participantes, Marca e Valor Unitário já vêm preenchidos com o valor de referência da análise do edital. O Portal exige valor maior que zero em toda linha do arquivo, sem exceção — por isso os itens desmarcados são omitidos do CSV exportado, não zerados.
        </p>
      </div>

      {indicesSemValorUnitario.length > 0 && (
        <div className="bg-warning-500/10 border border-warning-500/25 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-warning-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-warning-300">
            {indicesSemValorUnitario.length} item(ns) marcado(s) como "Participa" sem Valor Unitário preenchido (destacados em vermelho na tabela) — o Portal rejeita o arquivo inteiro se alguma linha participante ficar com valor zerado.
          </p>
        </div>
      )}

      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleExportarCsv} disabled={edicoes.length === 0}>
            <Download className="w-3.5 h-3.5" /> Exportar CSV pro Portal
          </Button>
          {botaoTrocarModelo}
          <span className="text-[11px] text-base-500">
            {edicoes.filter((e) => e.participa).length} de {linhasModelo.length} itens serão exportados (os desmarcados ficam de fora)
          </span>
        </div>
      )}

      <div className="overflow-x-auto bg-base-850/60 border border-base-800 rounded-xl">
        <table className="w-full min-w-[1200px] text-[12px]">
          <thead>
            <tr className="text-base-500 border-b border-base-800">
              <th className="text-center font-semibold px-2 py-2 w-20">Participa</th>
              <th className="text-left font-semibold px-2 py-2 w-24">Processo</th>
              <th className="text-left font-semibold px-2 py-2 w-24">ID (Portal)</th>
              {temLote && <th className="text-left font-semibold px-2 py-2 w-20">Lote</th>}
              <th className="text-left font-semibold px-2 py-2 w-16">Item</th>
              <th className="text-left font-semibold px-2 py-2 min-w-[160px]">Produto</th>
              <th className="text-right font-semibold px-2 py-2 w-20">Qtd.</th>
              <th className="text-left font-semibold px-2 py-2 w-24">Modelo</th>
              <th className="text-left font-semibold px-2 py-2 w-28">Marca/Fabricante</th>
              <th className="text-left font-semibold px-2 py-2 w-24">ANVISA</th>
              <th className="text-left font-semibold px-2 py-2 min-w-[220px]">Descrição detalhada</th>
              <th className="text-right font-semibold px-2 py-2 w-28">Vl. Unitário</th>
              <th className="text-right font-semibold px-2 py-2 w-28">Vl. Total</th>
            </tr>
          </thead>
          <tbody>
            {linhasModelo.map((linha, idx) => {
              const edicao = edicoes[idx] ?? { participa: true, modelo: '', marca: '', anvisa: '', descricao: '', valorUnitario: '' }
              const quantidadeNum = parseFlexibleNumber(linha[colunas.quantidade]) ?? 0
              const valorUnitarioNum = parseFlexibleNumber(edicao.valorUnitario) ?? 0
              const participa = edicao.participa
              return (
                <tr key={idx} className={`border-t border-base-800/60 ${participa ? '' : 'opacity-50'}`}>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={participa}
                      onChange={(e) => atualizarEdicao(idx, { participa: e.target.checked })}
                      disabled={!podeEditar}
                      className="w-4 h-4 rounded accent-accent-500"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-base-400">{linha[colunas.processo]}</td>
                  <td className="px-2 py-1.5 text-base-400">{linha[colunas.id]}</td>
                  {temLote && <td className="px-2 py-1.5 text-base-400">{linha[colunas.lote as number]}</td>}
                  <td className="px-2 py-1.5 text-base-400">{linha[colunas.item]}</td>
                  <td className="px-2 py-1.5 text-base-400 max-w-[200px] truncate" title={participa ? linha[colunas.produto] : `${linha[colunas.produto]} — não participa; a linha não entra no CSV exportado`}>
                    {linha[colunas.produto]}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-base-400">{linha[colunas.quantidade]}</td>
                  {(['modelo', 'marca', 'anvisa', 'descricao'] as const).map((campo) => (
                    <td key={campo} className="px-1.5 py-1.5">
                      <input
                        value={edicao[campo]}
                        onChange={(e) => atualizarEdicao(idx, { [campo]: e.target.value })}
                        disabled={!podeEditar || !participa}
                        className="w-full bg-base-900 border border-base-700 rounded px-1.5 py-1 text-[12px] text-base-100 focus:border-accent-400 outline-none disabled:opacity-60"
                      />
                    </td>
                  ))}
                  <td className="px-1.5 py-1.5">
                    <input
                      value={edicao.valorUnitario}
                      inputMode="decimal"
                      onChange={(e) => atualizarEdicao(idx, { valorUnitario: e.target.value })}
                      disabled={!podeEditar || !participa}
                      title={participa && valorUnitarioNum <= 0 ? 'O Portal exige um valor unitário maior que zero pra este item.' : undefined}
                      className={`w-full bg-base-900 border rounded px-1.5 py-1 text-right text-[12px] font-mono text-base-100 focus:border-accent-400 outline-none disabled:opacity-60 ${participa && valorUnitarioNum <= 0 ? 'border-negative-500/60' : 'border-base-700'}`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-base-300">{formatarNumeroPtBR(quantidadeNum * valorUnitarioNum)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Mesma lógica de supabase/functions/gerar-proposta-pdf/index.ts — pra pré-
// preencher o texto de fechamento editável com o mesmo valor que o PDF usaria
// por padrão, sem repetir "dias" se o campo já vier com a palavra escrita.
function formatarValidadeTexto(valor: string | null | undefined): string {
  const texto = (valor ?? '60 (sessenta)').trim()
  return /\bdias?\b/i.test(texto) ? texto : `${texto} dias`
}

// Mesma lógica de gerar-proposta/gerar-proposta-pdf — evita mostrar bairro/
// cidade duplicados na prévia (client.address já vem completo).
function extrairLogradouroPreview(endereco: string, bairro: string | null | undefined): string {
  const texto = endereco.trim()
  if (!bairro?.trim()) return texto
  const regex = new RegExp(`\\s*-\\s*${bairro.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b.*$`, 'i')
  return texto.replace(regex, '').trim() || texto
}

function AbaProposta({ bidding }: { bidding: Bidding }) {
  const { items, isLoading, salvarRateio, sincronizarItens } = useBiddingItemsDaLicitacao(bidding.id)
  const { nivel, carregando: carregandoPermissao } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao' && !carregandoPermissao
  const { bloqueada, desbloquear } = useBiddingEditLock(bidding)
  const podeEditarItens = podeEditar && !bloqueada
  const [mostrandoUnlockItens, setMostrandoUnlockItens] = useState(false)
  const { updateBidding } = useBiddings()
  const { clients } = useClients()
  const client = clients.find((c) => c.id === bidding.clientId)
  const { showToast } = useToast()

  // Auto-contido (mesmo padrão de AbaCadastrarProposta): busca os anexos
  // desta licitação direto, em vez de receber por prop — "Proposta
  // Readequada" veio de Documentos Finais pra cá, porque é aqui que faz
  // sentido acessá-la (é aqui que se mexe nos valores/itens da proposta).
  const { files: anexosProposta, uploadFile: uploadAnexoProposta, deleteFile: deleteAnexoProposta, getDownloadUrl: getAnexoUrlProposta } = useAttachedFiles('licitacao', bidding.id)
  const propostaReadequada = anexosProposta.find((f) => f.category === 'Proposta Readequada')

  const [gerandoDocx, setGerandoDocx] = useState<'novo' | 'ajustado' | null>(null)
  const [erroDocx, setErroDocx] = useState<string | null>(null)
  const [gerandoPdfProposta, setGerandoPdfProposta] = useState(false)
  const [erroPdfProposta, setErroPdfProposta] = useState<string | null>(null)
  const [pdfPropostaPreview, setPdfPropostaPreview] = useState<{ url: string; nome: string } | null>(null)
  const [enviandoPropostaAssinada, setEnviandoPropostaAssinada] = useState(false)
  // Trava/destrava a prévia editável: "Gerar Proposta Prévia" marca como
  // gerada (desabilita o próprio botão); qualquer edição nos itens ou nos
  // textos de abertura/fechamento destrava de novo. É um estado só de UI —
  // não precisa persistir, a prévia em si já é sempre recalculada ao vivo
  // a partir de items/textoAbertura/textoFechamento.
  const [previaGerada, setPreviaGerada] = useState(false)

  // Texto editável que entra no Word e no PDF gerados (abertura antes da
  // tabela de itens, fechamento depois). Pré-preenchido com o mesmo texto
  // padrão que as functions usariam, pra não começar em branco.
  const textoAberturaPadrao = `Ao órgão licitante ${bidding.orgao ?? '—'}, apresentamos nossa proposta comercial referente ao ${bidding.modalidade} nº ${bidding.numeroEdital ?? '—'}, conforme planilha abaixo:`
  const textoFechamentoPadrao = [
    'Nos preços indicados acima estão incluídos, além dos produtos, todos os custos, benefícios, encargos, tributos e demais contribuições pertinentes.',
    'Declaramos conhecer a legislação de referência desta licitação e que os produtos serão fornecidos de acordo com as condições estabelecidas neste Edital, o que conhecemos e aceitamos em todos os termos, inclusive quanto ao pagamento e outros.',
    `Esta proposta é válida por ${formatarValidadeTexto(bidding.diasValidadeProposta)}, a contar da data de sua apresentação.`,
    'Cumpre informar, ainda, que foram examinados os documentos da licitação, estando a empresa inteirada dos mesmos para elaboração da presente proposta.',
  ].join('\n\n')
  const [textoAbertura, setTextoAbertura] = useState(bidding.propostaTextoAbertura ?? textoAberturaPadrao)
  const [textoFechamento, setTextoFechamento] = useState(bidding.propostaTextoFechamento ?? textoFechamentoPadrao)
  const textoPropostaMudou = textoAbertura !== (bidding.propostaTextoAbertura ?? textoAberturaPadrao) || textoFechamento !== (bidding.propostaTextoFechamento ?? textoFechamentoPadrao)

  const handleTextoAberturaChange = (v: string) => { setTextoAbertura(v); setPreviaGerada(false) }
  const handleTextoFechamentoChange = (v: string) => { setTextoFechamento(v); setPreviaGerada(false) }

  const handleSalvarTextoProposta = () => {
    updateBidding.mutate(
      { bidding: { ...bidding, propostaTextoAbertura: textoAbertura, propostaTextoFechamento: textoFechamento }, items: [] },
      { onError: (err) => showToast(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`, 'error') }
    )
  }

  const handleAbrirAnexoProposta = async (anexo: { storagePath: string }) => {
    try {
      const url = await getAnexoUrlProposta(anexo.storagePath)
      window.open(url, '_blank')
    } catch (err) {
      showToast(`Erro ao abrir o arquivo: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  // Gera o .docx a partir dos itens/valores atuais da licitação e do texto
  // de abertura/fechamento — usada tanto por "Gerar Word" (mantém o texto
  // editado na tela — é a geração normal, a partir da prévia) quanto por
  // "Gerar Proposta Novamente" (reseta o texto pro padrão antes de gerar,
  // um recomeço do zero — só pra corrigir bug/bagunça, não é o caminho
  // principal). As duas sempre reiniciam o ciclo de assinatura (assinada
  // volta pra null): mesmo em cima de uma versão já assinada, gerar de novo
  // é sempre uma versão nova que ainda não foi importada assinada.
  const gerarWord = async (opts: { resetarTexto: boolean }) => {
    setGerandoDocx(opts.resetarTexto ? 'novo' : 'ajustado')
    setErroDocx(null)
    try {
      const atualizacaoBidding: Partial<Bidding> = { propostaReadequadaAssinadaEm: null }
      if (opts.resetarTexto) {
        atualizacaoBidding.propostaTextoAbertura = null
        atualizacaoBidding.propostaTextoFechamento = null
      } else {
        atualizacaoBidding.propostaTextoAbertura = textoAbertura
        atualizacaoBidding.propostaTextoFechamento = textoFechamento
      }
      await updateBidding.mutateAsync({ bidding: { ...bidding, ...atualizacaoBidding }, items: [] })
      if (opts.resetarTexto) {
        setTextoAbertura(textoAberturaPadrao)
        setTextoFechamento(textoFechamentoPadrao)
      }

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
      await uploadAnexoProposta.mutateAsync({ file, category: 'Proposta Readequada' })
      if (arquivoAntigo) await deleteAnexoProposta.mutateAsync(arquivoAntigo)
      if (pdfPropostaPreview) URL.revokeObjectURL(pdfPropostaPreview.url)
      setPdfPropostaPreview(null)
      setPreviaGerada(true)
    } catch (err) {
      setErroDocx(err instanceof Error ? err.message : String(err))
    } finally {
      setGerandoDocx(null)
    }
  }

  // Ação principal: gera o Word a partir da prévia atual (mantém o texto
  // editado na tela).
  const handleGerarWord = () => gerarWord({ resetarTexto: false })
  // Ação secundária/de recuperação: reseta tudo pro padrão e gera do zero —
  // só pra quando alguma edição bagunçou o texto e é mais fácil recomeçar.
  const handleGerarPropostaNovamente = () => gerarWord({ resetarTexto: true })

  // PDF gerado direto dos dados da licitação (não a partir do .docx acima
  // — ver comentário em supabase/functions/gerar-proposta-pdf/index.ts) —
  // fica só na memória do navegador pra prévia/download, não é salvo no
  // Storage até a hora de anexar a versão assinada.
  const handleGerarPdfProposta = async () => {
    setGerandoPdfProposta(true)
    setErroPdfProposta(null)
    try {
      if (textoPropostaMudou) {
        await updateBidding.mutateAsync({ bidding: { ...bidding, propostaTextoAbertura: textoAbertura, propostaTextoFechamento: textoFechamento }, items: [] })
      }
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gerar-proposta-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ clientId: bidding.clientId, biddingId: bidding.id }),
      })
      const resultado = await res.json()
      if (!res.ok || resultado.error) throw new Error(resultado.error || 'Erro desconhecido ao gerar o PDF')
      const bytes = Uint8Array.from(atob(resultado.fileBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: resultado.mimeType })
      if (pdfPropostaPreview) URL.revokeObjectURL(pdfPropostaPreview.url)
      setPdfPropostaPreview({ url: URL.createObjectURL(blob), nome: resultado.fileName || 'Proposta_Readequada.pdf' })
      setPreviaGerada(true)
    } catch (err) {
      setErroPdfProposta(err instanceof Error ? err.message : String(err))
    } finally {
      setGerandoPdfProposta(false)
    }
  }

  const handleBaixarPdfPropostaGerado = () => {
    if (!pdfPropostaPreview) return
    const a = document.createElement('a')
    a.href = pdfPropostaPreview.url
    a.download = pdfPropostaPreview.nome
    a.click()
  }

  // Importa direto a proposta já assinada pelo cliente — substitui o
  // arquivo em "Proposta Readequada" (mesma categoria que já alimenta o ZIP
  // de Documentos Finais, então não precisa de mais nada pra aparecer lá).
  const handleImportarPropostaAssinada = async (file: File) => {
    setEnviandoPropostaAssinada(true)
    try {
      const antigo = propostaReadequada
      await uploadAnexoProposta.mutateAsync({ file, category: 'Proposta Readequada' })
      if (antigo) await deleteAnexoProposta.mutateAsync(antigo)
      await updateBidding.mutateAsync({ bidding: { ...bidding, propostaReadequadaAssinadaEm: new Date().toISOString() }, items: [] })
      showToast('Proposta assinada importada — já disponível no ZIP de Documentos Finais.')
    } catch (err) {
      showToast(`Erro ao importar a proposta assinada: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviandoPropostaAssinada(false)
    }
  }

  const statusProposta: 'rascunho' | 'assinado' = bidding.propostaReadequadaAssinadaEm ? 'assinado' : 'rascunho'
  const passoProposta = statusProposta === 'assinado' ? 1 : 0

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
  // "salvo" é só um resumo visual de ~2s depois de terminar — sem ele, o
  // aviso ia direto de "Salvando..." pra sumir, sem confirmar que gravou de
  // verdade (a mesma dúvida que gera "será que salvou mesmo?").
  const [statusSalvamento, setStatusSalvamento] = useState<'idle' | 'pendente' | 'salvando' | 'salvo'>('idle')

  const dispararSincronizacao = () => {
    if (sincronizarItens.isPending) {
      timeoutRef.current = setTimeout(dispararSincronizacao, 300)
      return
    }
    const dados = pendenteRef.current
    if (!dados) { setStatusSalvamento('idle'); return }
    pendenteRef.current = null
    setStatusSalvamento('salvando')
    sincronizarItens.mutate(dados, {
      onSuccess: () => {
        setStatusSalvamento((s) => (s === 'salvando' ? 'salvo' : s))
        setTimeout(() => setStatusSalvamento((s) => (s === 'salvo' ? 'idle' : s)), 2000)
      },
      onError: () => setStatusSalvamento((s) => (s === 'salvando' ? 'idle' : s)),
    })
  }

  const handleItemsChange = (novosItems: Partial<BiddingItem>[]) => {
    pendenteRef.current = novosItems
    setStatusSalvamento('pendente')
    setPreviaGerada(false)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(dispararSincronizacao, 1200)
  }

  // Edição direta na tabela da prévia do documento — mesmo pipeline de
  // autosave debounçado usado pelo editor completo "Itens da Licitação"
  // logo abaixo (handleItemsChange), então editar aqui ou lá é a mesma
  // gravação, e as duas visões ficam sempre em sincronia.
  const handleAlterarItemPreview = (id: string, patch: Partial<BiddingItem>) => {
    handleItemsChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
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

  // Mesmo agrupamento por lote (com subtotal) usado em gerar-proposta e
  // gerar-proposta-pdf — pra prévia na tela ficar igual ao documento
  // gerado. Especificação/Modelo/Marca/Quant./Vl. Unit. são editáveis célula
  // a célula (via handleAlterarItemPreview); subtotal e total são sempre
  // recalculados, nunca digitados.
  const porLotePreview = bidding.tipoDisputa === 'Lote'
  const itensPreviewOrdenados = [...itensGanhos].sort((a, b) =>
    compararNumeroItem(a.lote || a.numeroItem, b.lote || b.numeroItem) || compararNumeroItem(a.numeroItem, b.numeroItem)
  )
  type LinhaPreview = { tipo: 'item'; item: BiddingItem } | { tipo: 'subtotal'; lote: string; total: number }
  const linhasPreview: LinhaPreview[] = []
  let totalGeralPreview = 0
  let loteAtualPreview: string | null = null
  let totalLotePreview = 0
  for (const item of itensPreviewOrdenados) {
    const identificador = porLotePreview ? (item.lote || '—') : item.numeroItem
    if (porLotePreview && identificador !== loteAtualPreview) {
      if (loteAtualPreview !== null) linhasPreview.push({ tipo: 'subtotal', lote: loteAtualPreview, total: totalLotePreview })
      loteAtualPreview = identificador
      totalLotePreview = 0
    }
    const valorUnitPreview = item.valorUnitarioOfertado ?? item.valorUnitarioLicitado
    const valorTotalItemPreview = item.quantidade * valorUnitPreview
    totalLotePreview += valorTotalItemPreview
    totalGeralPreview += valorTotalItemPreview
    linhasPreview.push({ tipo: 'item', item })
  }
  if (porLotePreview && loteAtualPreview !== null) linhasPreview.push({ tipo: 'subtotal', lote: loteAtualPreview, total: totalLotePreview })

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
      <div className="bg-base-850/60 border border-base-800 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Proposta</p>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(['Proposta Gerada', 'Assinada e Importada'] as const).map((label, idx) => (
            <div key={label} className="flex items-center gap-1.5">
              {idx > 0 && <span className={`w-4 h-px ${idx <= passoProposta ? 'bg-positive-500' : 'bg-base-700'}`} />}
              <div className="flex items-center gap-1">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold font-mono shrink-0 ${
                  idx < passoProposta ? 'bg-positive-500 text-base-950' : idx === passoProposta ? 'bg-accent-500 text-base-950' : 'bg-base-800 border border-base-700 text-base-500'
                }`}>
                  {idx < passoProposta ? <Check className="w-2.5 h-2.5" /> : idx + 1}
                </span>
                <span className={`text-[10.5px] font-semibold ${idx <= passoProposta ? 'text-base-300' : 'text-base-600'}`}>{label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 bg-base-900/50 border border-base-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold text-base-500 uppercase tracking-wider">Proposta Readequada</p>
          <div className="flex items-center gap-2 flex-wrap">
            {podeEditar && items.length > 0 && statusProposta === 'rascunho' && (
              <button
                onClick={() => setPreviaGerada(true)} disabled={previaGerada}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {previaGerada ? <Check className="w-3.5 h-3.5 text-positive-400" /> : <Wand2 className="w-3.5 h-3.5" />}
                {previaGerada ? 'Prévia Gerada' : 'Gerar Proposta Prévia'}
              </button>
            )}
            {podeEditar && items.length > 0 && statusProposta === 'rascunho' && (
              <button onClick={handleGerarWord} disabled={!!gerandoDocx} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition disabled:opacity-60">
                {gerandoDocx === 'ajustado' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                {gerandoDocx === 'ajustado' ? 'Gerando...' : 'Gerar Word'}
              </button>
            )}
            {propostaReadequada && (
              <button onClick={() => handleAbrirAnexoProposta(propostaReadequada)} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition">
                <Download className="w-3.5 h-3.5" /> Baixar Word
              </button>
            )}
            {items.length > 0 && podeEditar && statusProposta === 'rascunho' && (
              <button onClick={handleGerarPdfProposta} disabled={gerandoPdfProposta} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition disabled:opacity-60">
                {gerandoPdfProposta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSignature className="w-3.5 h-3.5" />}
                {gerandoPdfProposta ? 'Gerando PDF...' : pdfPropostaPreview ? 'Gerar PDF novamente' : 'Gerar PDF'}
              </button>
            )}
            {pdfPropostaPreview && (
              <button onClick={handleBaixarPdfPropostaGerado} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition">
                <Download className="w-3.5 h-3.5" /> Baixar PDF
              </button>
            )}
            {podeEditar && propostaReadequada && statusProposta === 'rascunho' && (
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-900 border border-base-700 rounded-lg px-2.5 py-1.5 transition cursor-pointer">
                {enviandoPropostaAssinada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {enviandoPropostaAssinada ? 'Importando...' : 'Importar Proposta Assinada'}
                <input type="file" accept=".pdf" className="hidden" disabled={enviandoPropostaAssinada} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportarPropostaAssinada(f); e.target.value = '' }} />
              </label>
            )}
            {statusProposta === 'assinado' && (
              <>
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-positive-400 bg-positive-500/10 border border-positive-500/25 rounded-full px-2.5 py-1">
                  <Check className="w-3.5 h-3.5" /> Proposta Assinada Importada
                </span>
                <span className="text-[10.5px] text-base-500">disponível no ZIP de Documentos Finais</span>
              </>
            )}
            {podeEditar && propostaReadequada && statusProposta === 'rascunho' && (
              <button
                onClick={handleGerarPropostaNovamente} disabled={!!gerandoDocx}
                title="Reseta o texto e a proposta pro padrão e gera do zero — use só se algo ficou bagunçado, não é o caminho normal"
                className="flex items-center gap-1 text-[10.5px] font-semibold text-base-500 hover:text-base-300 transition ml-auto shrink-0"
              >
                {gerandoDocx === 'novo' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {gerandoDocx === 'novo' ? 'Gerando...' : 'Gerar Proposta Novamente'}
              </button>
            )}
          </div>
          {erroDocx && <p className="text-[11.5px] text-negative-400">{erroDocx}</p>}
          {erroPdfProposta && <p className="text-[11.5px] text-negative-400">{erroPdfProposta}</p>}
        </div>

        {propostaReadequada && items.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-base-500 uppercase tracking-wider">Prévia — cópia fiel do Word gerado</p>
              {podeEditar && statusProposta === 'rascunho' && <span className="text-[10px] font-mono font-bold text-accent-400">✎ texto e tabela editáveis</span>}
            </div>
            <div className="bg-[#f4f1e9] text-[#20241f] rounded-lg border border-base-700 px-8 py-8 flex flex-col" style={{ fontFamily: 'Georgia, serif' }}>
              <div className="text-center leading-relaxed mb-2">
                {(client?.cabecalhoDeclaracao?.trim() || `${client?.name ?? ''}\nCNPJ: ${client?.cnpj ?? ''}`).split('\n').filter(Boolean).map((linha, idx) => (
                  <p key={idx} className={idx === 0 ? 'font-bold text-[15px]' : 'text-[10.5px] text-[#4a4d47]'}>{linha}</p>
                ))}
              </div>
              <div className="h-px bg-[#b9beb0] mb-4" />

              <p className="text-center font-extrabold text-[14px] tracking-wide">PROPOSTA READEQUADA</p>
              <p className="text-center font-bold text-[11.5px] text-[#333] mb-4">{bidding.modalidade} Nº {bidding.numeroEdital ?? '—'}</p>

              <table className="w-full text-[10.5px] mb-4">
                <tbody>
                  <tr><td className="py-0.5 pr-2"><b>Razão Social:</b> {client?.name ?? '—'}</td><td className="py-0.5"><b>CNPJ:</b> {client?.cnpj ?? '—'}</td></tr>
                  <tr><td className="py-0.5 pr-2"><b>I.E:</b> {client?.inscricaoEstadual ?? '—'}</td><td className="py-0.5"><b>Endereço:</b> {extrairLogradouroPreview(client?.address ?? '', client?.bairro)}</td></tr>
                  <tr><td className="py-0.5 pr-2"><b>Bairro:</b> {client?.bairro ?? '—'}</td><td className="py-0.5"><b>Cidade:</b> {client?.cidade ?? '—'}</td></tr>
                  <tr><td className="py-0.5 pr-2"><b>Telefone:</b> {client?.phone ?? '—'}</td><td className="py-0.5"><b>E-mail:</b> {client?.email ?? '—'}</td></tr>
                </tbody>
              </table>

              <div className="relative border-[1.5px] border-dashed border-accent-500/60 rounded px-2.5 py-2 mb-4">
                {podeEditar && statusProposta === 'rascunho' && <span className="absolute -top-2 left-2 bg-accent-500 text-white text-[8.5px] font-mono font-bold px-1.5 rounded-full">editável</span>}
                <textarea
                  value={textoAbertura}
                  onChange={(e) => handleTextoAberturaChange(e.target.value)}
                  disabled={!podeEditar || statusProposta !== 'rascunho'}
                  rows={2}
                  className="w-full bg-transparent text-[11px] leading-relaxed outline-none resize-none disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Georgia, serif' }}
                />
              </div>

              <div className="relative border-[1.5px] border-dashed border-accent-500/60 rounded px-2 pt-3 pb-1.5 mb-4">
                {podeEditar && statusProposta === 'rascunho' && <span className="absolute -top-2 left-2 bg-accent-500 text-white text-[8.5px] font-mono font-bold px-1.5 rounded-full">editável — clique numa célula</span>}
                <div className="overflow-x-auto">
                  <table className="w-full text-[9.5px] border-collapse">
                    <thead>
                      <tr className="bg-[#e9e6da]">
                        <th className="border border-[#b9beb0] px-1 py-1 font-bold">{porLotePreview ? 'Lote' : 'Item'}</th>
                        <th className="border border-[#b9beb0] px-1 py-1 font-bold">Especificação</th>
                        <th className="border border-[#b9beb0] px-1 py-1 font-bold">Modelo</th>
                        <th className="border border-[#b9beb0] px-1 py-1 font-bold">Marca/Fabricante</th>
                        <th className="border border-[#b9beb0] px-1 py-1 font-bold">Quant.</th>
                        <th className="border border-[#b9beb0] px-1 py-1 font-bold">Valor Unit. R$</th>
                        <th className="border border-[#b9beb0] px-1 py-1 font-bold">V. Total R$</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhasPreview.map((linha, idx) => linha.tipo === 'subtotal' ? (
                        <tr key={`sub-${idx}`} className="bg-[#f1efe6] font-bold">
                          <td colSpan={6} className="border border-[#b9beb0] px-1 py-1 text-right">Subtotal — Lote {linha.lote}</td>
                          <td className="border border-[#b9beb0] px-1 py-1 text-right font-mono">{formatarNumeroPtBR(linha.total)}</td>
                        </tr>
                      ) : (
                        <tr key={linha.item.id}>
                          <td className="border border-[#b9beb0] px-1 py-1 text-center font-mono">{porLotePreview ? (linha.item.lote || '—') : linha.item.numeroItem}</td>
                          <td className="border border-[#b9beb0] px-0.5 py-0.5">
                            <input disabled={!podeEditar || statusProposta !== 'rascunho'} value={linha.item.descricao} onChange={(e) => handleAlterarItemPreview(linha.item.id, { descricao: e.target.value })} className="w-full min-w-[140px] bg-transparent px-1 py-0.5 outline-none disabled:cursor-not-allowed" />
                          </td>
                          <td className="border border-[#b9beb0] px-0.5 py-0.5">
                            <input disabled={!podeEditar || statusProposta !== 'rascunho'} value={linha.item.referencia ?? ''} onChange={(e) => handleAlterarItemPreview(linha.item.id, { referencia: e.target.value })} className="w-full min-w-[70px] bg-transparent px-1 py-0.5 outline-none disabled:cursor-not-allowed" />
                          </td>
                          <td className="border border-[#b9beb0] px-0.5 py-0.5">
                            <input disabled={!podeEditar || statusProposta !== 'rascunho'} value={linha.item.marca ?? ''} onChange={(e) => handleAlterarItemPreview(linha.item.id, { marca: e.target.value })} className="w-full min-w-[70px] bg-transparent px-1 py-0.5 outline-none disabled:cursor-not-allowed" />
                          </td>
                          <td className="border border-[#b9beb0] px-0.5 py-0.5">
                            <input type="number" disabled={!podeEditar || statusProposta !== 'rascunho'} value={linha.item.quantidade} onChange={(e) => handleAlterarItemPreview(linha.item.id, { quantidade: parseFloat(e.target.value) || 0 })} className="w-full min-w-[50px] bg-transparent px-1 py-0.5 text-right font-mono outline-none disabled:cursor-not-allowed" />
                          </td>
                          <td className="border border-[#b9beb0] px-0.5 py-0.5">
                            <input type="number" step="0.01" disabled={!podeEditar || statusProposta !== 'rascunho'} value={linha.item.valorUnitarioOfertado ?? linha.item.valorUnitarioLicitado} onChange={(e) => handleAlterarItemPreview(linha.item.id, { valorUnitarioOfertado: parseFloat(e.target.value) || 0 })} className="w-full min-w-[60px] bg-transparent px-1 py-0.5 text-right font-mono outline-none disabled:cursor-not-allowed" />
                          </td>
                          <td className="border border-[#b9beb0] px-1 py-1 text-right font-mono">{formatarNumeroPtBR(linha.item.quantidade * (linha.item.valorUnitarioOfertado ?? linha.item.valorUnitarioLicitado))}</td>
                        </tr>
                      ))}
                      <tr className="bg-[#e4e1d3] font-extrabold">
                        <td colSpan={6} className="border border-[#b9beb0] px-1 py-1 text-right">Valor total da Proposta</td>
                        <td className="border border-[#b9beb0] px-1 py-1 text-right font-mono">{formatarNumeroPtBR(totalGeralPreview)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="relative border-[1.5px] border-dashed border-accent-500/60 rounded px-2.5 py-2 mb-5">
                {podeEditar && statusProposta === 'rascunho' && <span className="absolute -top-2 left-2 bg-accent-500 text-white text-[8.5px] font-mono font-bold px-1.5 rounded-full">editável</span>}
                <textarea
                  value={textoFechamento}
                  onChange={(e) => handleTextoFechamentoChange(e.target.value)}
                  disabled={!podeEditar || statusProposta !== 'rascunho'}
                  rows={6}
                  className="w-full bg-transparent text-[11px] leading-relaxed outline-none resize-none disabled:cursor-not-allowed"
                  style={{ fontFamily: 'Georgia, serif' }}
                />
              </div>

              <p className="text-right font-bold text-[11px] mb-6">{client?.cidade || '[cidade]'}, {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.</p>
              <div className="text-[10.5px] leading-loose">
                <div className="w-[280px] border-t border-[#333] mb-1" />
                Assinatura do representante legal<br />
                Nome: {client?.responsavelNome ?? '—'}<br />
                CPF: {client?.responsavelCpf ?? '—'}<br />
                Cargo: {client?.responsavelCargo ?? '—'}
              </div>
            </div>
            {podeEditar && statusProposta === 'rascunho' && textoPropostaMudou && (
              <Button onClick={handleSalvarTextoProposta} disabled={updateBidding.isPending} className="self-start">
                {updateBidding.isPending ? 'Salvando...' : 'Salvar Texto (sem gerar documento novo)'}
              </Button>
            )}
            {pdfPropostaPreview && (
              <iframe src={pdfPropostaPreview.url} title="Prévia do PDF da Proposta Readequada" className="w-full h-[480px] rounded-lg border border-base-700 bg-base-100" />
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Itens da Licitação</p>
          {podeEditarItens && statusSalvamento !== 'idle' && (
            <span className={`text-[10px] flex items-center gap-1 ${statusSalvamento === 'salvo' ? 'text-positive-400 font-semibold' : 'text-base-500'}`}>
              {statusSalvamento === 'salvando' && (<><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</>)}
              {statusSalvamento === 'pendente' && 'Alteração pendente...'}
              {statusSalvamento === 'salvo' && (<><Check className="w-3 h-3" /> Salvo</>)}
            </span>
          )}
        </div>

        {podeEditar && bloqueada && (
          <div className="flex items-center gap-3 bg-accent-500/10 border border-accent-500/30 rounded-lg p-3 mb-2">
            <Lock className="w-4 h-4 text-accent-400 shrink-0" />
            <p className="flex-1 text-[12px] text-accent-200">
              Esta licitação já está <strong>Ganhou</strong> e <strong>Adjudicada e Homologada</strong> — a edição dos itens está bloqueada.
            </p>
            <Button type="button" variant="secondary" onClick={() => setMostrandoUnlockItens(true)}>Desbloquear com senha</Button>
          </div>
        )}

        {podeEditarItens ? (
          <>
            <p className="text-[11px] text-base-500 mb-2">
              Confira e corrija aqui se a importação automática do edital vier incompleta ou errada — "Adicionar Item" e "Importar Excel" são o plano B pra montar a lista na mão quando for preciso. Cada mudança grava sozinha, não precisa de botão de salvar.
            </p>
            <BiddingItemsEditor
              items={items} onChange={handleItemsChange} tipoDisputa={bidding.tipoDisputa}
              travarValorLicitado onGerarPrevia={() => setPreviaGerada(true)} previaGerada={previaGerada}
            />
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

      <UnlockWithPasswordDialog
        open={mostrandoUnlockItens}
        entityLabel={`Licitação "${bidding.objeto}"`}
        entityId={bidding.id}
        onCancel={() => setMostrandoUnlockItens(false)}
        onUnlocked={() => { desbloquear(); setMostrandoUnlockItens(false) }}
      />
    </div>
  )
}

type DeclaracaoTipo = 'fato_impeditivo' | 'menor_aprendiz' | 'elaboracao_independente'

const DECLARACOES: { key: DeclaracaoTipo; label: string }[] = [
  { key: 'fato_impeditivo', label: 'Inexistência de Fato Impeditivo' },
  { key: 'menor_aprendiz', label: 'Art. 7º, XXXIII da CF (Menor Aprendiz)' },
  { key: 'elaboracao_independente', label: 'Elaboração Independente de Proposta' },
]

// Texto padrão das declarações mais comuns exigidas em habilitação — o
// usuário ainda revisa e assina fora do sistema; isso só elimina a parte
// repetitiva de digitar CNPJ/endereço/representante toda vez, reaproveitando
// dados que já estão cadastrados no cliente e na licitação.
function buildDeclaracaoTexto(tipo: DeclaracaoTipo, opts: {
  clientName: string
  clientCnpj: string
  clientAddress: string
  clientCidade: string
  responsavelNome: string
  responsavelCpf: string
  responsavelCargo: string
  orgao: string
  numeroEdital: string
  cidadeEmissao: string
}): string {
  const cabecalho = `DECLARANTE: ${opts.clientName}, pessoa jurídica inscrita no CNPJ nº ${opts.clientCnpj || '[CNPJ não informado]'}, com sede em ${opts.clientAddress || '[endereço não informado]'}${opts.clientCidade ? `, ${opts.clientCidade}` : ''}, neste ato representada por ${opts.responsavelNome || '[representante não informado]'}${opts.responsavelCpf ? `, portador(a) do CPF nº ${opts.responsavelCpf}` : ''}${opts.responsavelCargo ? `, na qualidade de ${opts.responsavelCargo}` : ''}.`

  const referenciaEdital = opts.numeroEdital
    ? `referente ao Edital nº ${opts.numeroEdital}${opts.orgao ? `, do órgão ${opts.orgao}` : ''}`
    : opts.orgao ? `referente ao processo licitatório do órgão ${opts.orgao}` : 'referente ao processo licitatório em questão'

  const rodape = `${opts.cidadeEmissao || '[cidade]'}, ${new Date().toLocaleDateString('pt-BR')}.\n\n\n_______________________________________\n${opts.responsavelNome || '[representante legal]'}\n${opts.responsavelCargo || 'Representante Legal'}`

  if (tipo === 'fato_impeditivo') {
    return `DECLARAÇÃO DE INEXISTÊNCIA DE FATO IMPEDITIVO DA HABILITAÇÃO\n\n${cabecalho}\n\nDECLARA, sob as penas da lei, para fins de participação em processo licitatório ${referenciaEdital}, que não existe fato impeditivo à sua habilitação, encontrando-se regular perante os órgãos públicos federais, estaduais e municipais, e que se compromete a informar a ocorrência de fato superveniente impeditivo da habilitação, na forma da legislação vigente.\n\n${rodape}`
  }
  if (tipo === 'menor_aprendiz') {
    return `DECLARAÇÃO DE CUMPRIMENTO DO DISPOSTO NO ART. 7º, INCISO XXXIII, DA CONSTITUIÇÃO FEDERAL\n\n${cabecalho}\n\nDECLARA, para fins de participação em processo licitatório ${referenciaEdital}, em atendimento ao disposto no inciso XXXIII do art. 7º da Constituição Federal, que não emprega menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre, e não emprega menor de 16 (dezesseis) anos, salvo na condição de aprendiz, a partir de 14 (quatorze) anos.\n\n${rodape}`
  }
  return `DECLARAÇÃO DE ELABORAÇÃO INDEPENDENTE DE PROPOSTA\n\n${cabecalho}\n\nDECLARA, para fins de participação em processo licitatório ${referenciaEdital}, que a proposta apresentada foi elaborada de maneira independente, e que o conteúdo da proposta não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer outro participante potencial ou de fato do processo licitatório, por qualquer meio ou por qualquer pessoa.\n\n${rodape}`
}

// Gera as declarações padrão de habilitação (Documentos Finais) já
// preenchidas com dados do cliente/licitação — mesmo padrão de "gerar texto
// + Copiar/Imprimir" já usado em ContratosPage.tsx, sem persistir nada
// (regenera na hora, sempre com o dado mais atual do cadastro).
function DeclaracoesPadrao({ bidding, client }: { bidding: Bidding; client: Client | undefined }) {
  const [tipo, setTipo] = useState<DeclaracaoTipo>('fato_impeditivo')

  const texto = useMemo(() => {
    if (!client) return ''
    return buildDeclaracaoTexto(tipo, {
      clientName: client.name,
      clientCnpj: client.cnpj ?? '',
      clientAddress: client.address ?? '',
      clientCidade: client.cidade ?? '',
      responsavelNome: client.responsavelNome ?? '',
      responsavelCpf: client.responsavelCpf ?? '',
      responsavelCargo: client.responsavelCargo ?? '',
      orgao: bidding.orgao,
      numeroEdital: bidding.numeroEdital ?? '',
      cidadeEmissao: client.cidade ?? '',
    })
  }, [tipo, client, bidding])

  if (!client) {
    return <p className="text-[12px] text-base-500 italic py-2">Vincule um cliente a esta licitação pra gerar as declarações padrão.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Declarações Padrão</p>
        <div className="flex items-center gap-2">
          <button onClick={() => navigator.clipboard.writeText(texto)} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition">
            <Copy className="w-3.5 h-3.5" /> Copiar Texto
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
            <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
          </button>
        </div>
      </div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {DECLARACOES.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setTipo(d.key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${tipo === d.key ? 'bg-accent-500 text-base-950' : 'bg-base-850 text-base-400 border border-base-700'}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="print-only border border-base-800 bg-white text-slate-900 rounded-lg p-6 max-h-[420px] overflow-y-auto">
        <pre className="whitespace-pre-wrap font-serif text-[13px] leading-relaxed">{texto}</pre>
      </div>
    </div>
  )
}

type CategoriaProcesso = 'Contrato' | 'Empenho' | 'Ata de Sessão' | 'Outro'
const CATEGORIAS_PROCESSO: { key: CategoriaProcesso; label: string }[] = [
  { key: 'Contrato', label: 'Contrato Final' },
  { key: 'Empenho', label: 'Empenho' },
  { key: 'Ata de Sessão', label: 'Ata de Sessão' },
  { key: 'Outro', label: 'Outro' },
]

// Documentos administrativos que só existem depois da disputa terminar —
// diferente do Checklist (documentos de habilitação, exigidos ANTES/durante
// a disputa) e da Proposta Readequada (a proposta em si), aqui entram papéis
// que o próprio órgão devolve depois de homologar (às vezes com dias de
// atraso): o contrato assinado pelas duas partes, os empenhos emitidos, atas
// de sessão etc. Cada categoria aceita vários arquivos (ao contrário do
// antigo slot único de "Contrato Final"), porque na prática chegam aos
// poucos — o empenho de uma parcela, depois de outra, mais de uma ata.
function AbaDocumentosDoProcesso({
  anexos, enviando, uploadProgress, abrindo, podeEditar, onUpload, onVisualizar, onAbrir, onExcluir,
}: {
  anexos: AttachedFile[]
  enviando: string | null
  uploadProgress: number | null
  abrindo: string | null
  podeEditar: boolean
  onUpload: (file: File, category: CategoriaProcesso) => void
  onVisualizar: (anexo: AttachedFile) => void
  onAbrir: (anexo: AttachedFile) => void
  onExcluir: (anexo: AttachedFile) => void
}) {
  const documentosDoProcesso = anexos.filter((a) => CATEGORIAS_PROCESSO.some((c) => c.key === a.category))

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[12px] text-base-500">
        Contrato final assinado, empenhos, atas de sessão e outros documentos administrativos que chegam depois da disputa
        — geralmente com alguns dias de atraso do órgão. Aceita vários arquivos por categoria.
      </p>

      {CATEGORIAS_PROCESSO.map(({ key, label }) => {
        const desteTipo = documentosDoProcesso.filter((a) => a.category === key)
        return (
          <div key={key}>
            <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">{label}</p>
            {desteTipo.length === 0 && (
              <p className="text-[12px] text-base-500 italic py-1">Nenhum documento enviado ainda.</p>
            )}
            {desteTipo.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2">
                {desteTipo.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-xl px-4 py-2.5">
                    <FileSignature className="w-4 h-4 text-accent-400 shrink-0" />
                    <span className="flex-1 text-[13px] text-base-200 truncate">{a.name}</span>
                    <button onClick={() => onVisualizar(a)} title="Visualizar" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => onAbrir(a)} disabled={abrindo === a.id} title="Abrir em nova aba" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    {podeEditar && (
                      <button onClick={() => onExcluir(a)} title="Excluir" className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {podeEditar && (
              <label className="flex items-center gap-2 justify-center border border-dashed border-base-700 rounded-xl px-4 py-3 cursor-pointer hover:border-accent-500/40 hover:bg-base-850/40 transition text-base-400">
                {enviando === key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-[12px] font-medium">
                  {enviando === key ? `Enviando...${uploadProgress !== null ? ` ${uploadProgress}%` : ''}` : `Enviar ${label.toLowerCase()}`}
                </span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" disabled={!!enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f, key); e.target.value = '' }} />
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Linha do tempo de tudo que já aconteceu com esta licitação — os eventos
// já eram gravados em audit_logs (logEvent, useAuditLog.ts) desde sempre,
// só não existia nenhuma tela que os mostrasse. Filtra por entity_type/
// entity_id (ver migração 021) — logs antigos, gravados antes dessa coluna
// existir, não aparecem aqui (não têm como saber a qual licitação
// pertencem), mas continuam na visão geral de auditoria.
function AbaHistorico({ bidding }: { bidding: Bidding }) {
  const { logs, isLoading } = useAuditLogPorEntidade('bidding', bidding.id)

  if (isLoading) return <SkeletonList itens={4} />

  if (logs.length === 0) {
    return (
      <p className="text-[13px] text-base-500 italic py-4">
        Nenhum evento registrado pra esta licitação ainda (ou ela foi criada antes deste histórico existir).
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-base-500">Linha do tempo de alterações registradas nesta licitação, mais recente primeiro.</p>
      <div className="flex flex-col">
        {logs.map((log, idx) => (
          <div key={log.id} className="relative pl-6 pb-4">
            {idx < logs.length - 1 && <span className="absolute left-[7px] top-3 bottom-0 w-px bg-base-800" />}
            <span className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full bg-accent-500/20 border-2 border-accent-400" />
            <div className="bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[12px] font-semibold text-base-200">{log.action}</p>
                <p className="text-[10px] text-base-500 font-mono whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
              {log.details && <p className="text-[11px] text-base-400 mt-0.5">{log.details}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type PrecificacaoDraft = { custo: string; margem: string; participa: boolean }

// Aplica um Perfil de Precificação (Cadastros → Precificação) aos itens da
// licitação — mesma fórmula de markup divisor da Calculadora de Formação de
// Preço, só que com o perfil salvo em vez de digitado toda vez. O Custo
// Unitário e a Margem ficam editáveis por item (a Margem começa igual à do
// perfil, mas pode divergir linha a linha); Impostos/Despesas vêm sempre do
// perfil selecionado. Nada grava sozinho — só quando clica em "Aplicar aos
// Itens Marcados" (aplicarPrecificacao faz um UPDATE direto por item, sem
// mexer em descrição/quantidade/valores licitados/ofertados).
function AbaPrecificacao({ bidding }: { bidding: Bidding }) {
  const { items, isLoading, aplicarPrecificacao } = useBiddingItems(bidding.id)
  const { profiles, isLoading: carregandoPerfis } = usePricingProfiles()
  const { nivel, carregando: carregandoPermissao } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao' && !carregandoPermissao
  const { showToast } = useToast()

  const [perfilId, setPerfilId] = useState('')
  const perfil = profiles.find((p) => p.id === perfilId) ?? null
  const impostosPct = perfil ? somarLinhasPorTipo(perfil.linhas, 'imposto') : 0
  const despesasPct = perfil ? somarLinhasPorTipo(perfil.linhas, 'despesa') : 0

  // Só guarda o que o usuário mexeu (overrides) — o valor de partida de
  // cada campo vem direto do item (custoUnitario/margemPctAplicada já
  // salvos, ou a margem do perfil selecionado como sugestão). Evita
  // sincronizar estado local a partir de props/query num efeito: o rascunho
  // é sempre "base do item + o que foi editado", calculado no render.
  const [overrides, setOverrides] = useState<Record<string, Partial<PrecificacaoDraft>>>({})

  const updateDraft = (itemId: string, patch: Partial<PrecificacaoDraft>) => {
    setOverrides((atual) => ({ ...atual, [itemId]: { ...atual[itemId], ...patch } }))
  }

  const linhas = items.map((item) => {
    const base: PrecificacaoDraft = {
      custo: item.custoUnitario != null ? String(item.custoUnitario) : '',
      margem: item.margemPctAplicada != null ? String(item.margemPctAplicada) : (perfil ? String(perfil.margemPct) : ''),
      participa: item.participaPrecificacao,
    }
    const draft: PrecificacaoDraft = { ...base, ...overrides[item.id] }
    const custo = parseFloat(draft.custo) || 0
    const margem = parseFloat(draft.margem) || 0
    const valorMinimo = draft.participa && perfil ? calcularValorMinimo(custo, impostosPct, despesasPct, margem) : null
    const vsLicitado = valorMinimo !== null && item.valorUnitarioLicitado > 0
      ? ((valorMinimo - item.valorUnitarioLicitado) / item.valorUnitarioLicitado) * 100
      : null
    return { item, draft, valorMinimo, vsLicitado }
  })
  const totalParticipando = linhas.filter((l) => l.draft.participa).length

  const handleAplicar = () => {
    if (!perfil) { showToast('Selecione um perfil de precificação primeiro.', 'error'); return }
    // "Aplicar aos Itens Marcados" só deve aplicar o PERFIL (impostos,
    // despesas, margem) aos itens com o checkbox "participa" marcado — os
    // demais campos continuam sendo gravados pra TODOS os itens (o
    // checkbox em si precisa sincronizar mesmo pra quem acabou de ser
    // desmarcado, e o custo digitado não é exclusivo de quem participa),
    // mas o perfil/impostos/despesas/margem de quem está desmarcado é
    // limpo (null) em vez de herdar o perfil aplicado aos outros — sem
    // isso, clicar aqui gravava o mesmo perfil em TODOS os itens da
    // licitação, inclusive os que a empresa nem está disputando.
    const payload = linhas.map(({ item, draft, valorMinimo }) => ({
      id: item.id,
      custoUnitario: draft.custo.trim() ? parseFloat(draft.custo) : null,
      valorMinimoCalculado: valorMinimo,
      participaPrecificacao: draft.participa,
      pricingProfileId: draft.participa ? perfil.id : null,
      impostosPctAplicado: draft.participa ? impostosPct : null,
      despesasPctAplicado: draft.participa ? despesasPct : null,
      margemPctAplicada: draft.participa && draft.margem.trim() ? parseFloat(draft.margem) : null,
    }))
    aplicarPrecificacao.mutate(payload, {
      onSuccess: () => showToast('Precificação aplicada aos itens marcados.'),
      onError: (err) => showToast(`Erro ao aplicar a precificação: ${err instanceof Error ? err.message : String(err)}`, 'error'),
    })
  }

  if (isLoading || carregandoPerfis) return <SkeletonList itens={4} />

  if (items.length === 0) {
    return (
      <p className="text-[13px] text-base-500 italic py-4">
        Nenhum item cadastrado nesta licitação ainda. Cadastre os itens na aba "Cadastrar Proposta" antes de precificar.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-base-500">
        Calcula o Valor Mínimo de cada item a partir do Custo Unitário e de um Perfil de Precificação salvo — mesma fórmula da Calculadora de Formação de Preço, com Impostos e Despesas reutilizáveis em vez de digitados toda vez.
      </p>

      <div className="flex flex-wrap items-end gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-3">
        <div className="min-w-[220px]">
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Perfil Aplicado</label>
          <Select value={perfilId} onChange={(e) => setPerfilId(e.target.value)} disabled={!podeEditar}>
            <option value="">Selecione um perfil...</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </Select>
        </div>
        {perfil && (
          <span className="text-[11px] font-mono font-bold px-2.5 py-1.5 rounded-full bg-base-800 border border-base-700 text-base-400">
            {totalParticipando} de {items.length} itens participando · Impostos {impostosPct.toFixed(2)}% · Despesas {despesasPct.toFixed(2)}%
          </span>
        )}
        {profiles.length === 0 && (
          <p className="text-[11px] text-warning-400">Nenhum perfil cadastrado ainda — crie um em Cadastros → Precificação.</p>
        )}
        <div className="flex-1" />
        {podeEditar && (
          <Button onClick={handleAplicar} disabled={!perfil || aplicarPrecificacao.isPending}>
            {aplicarPrecificacao.isPending ? 'Aplicando...' : 'Aplicar aos Itens Marcados'}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto border border-base-700/50 rounded-lg">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-base-850 text-left">
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-20 text-center">Participar</th>
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500">Item</th>
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-16 text-right">Qtd.</th>
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28">Custo Unit.</th>
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-20 text-right">Impostos</th>
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-20 text-right">Despesas</th>
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-24">Margem</th>
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28 text-right">Valor Mínimo</th>
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28 text-right">Vl. Licitado</th>
              <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-24 text-right">Vs. Licitado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ item, draft, valorMinimo, vsLicitado }) => (
              <tr key={item.id} className={`border-t border-base-800 ${!draft.participa ? 'opacity-40' : ''}`}>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={draft.participa}
                    disabled={!podeEditar}
                    onChange={(e) => updateDraft(item.id, { participa: e.target.checked })}
                    className="w-4 h-4 accent-accent-500 cursor-pointer"
                  />
                </td>
                <td className="px-2 py-1.5 text-base-300">{item.descricao}</td>
                <td className="px-2 py-1.5 text-right font-mono text-base-300">{item.quantidade}</td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number" step="0.01" value={draft.custo} disabled={!podeEditar || !draft.participa}
                    onChange={(e) => updateDraft(item.id, { custo: e.target.value })}
                    className="!py-1 !px-2 text-[12px] text-right font-mono" placeholder="0,00"
                  />
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-base-500">{perfil ? `${impostosPct.toFixed(2)}%` : '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono text-base-500">{perfil ? `${despesasPct.toFixed(2)}%` : '—'}</td>
                <td className="px-2 py-1.5">
                  <Input
                    type="number" step="0.01" value={draft.margem} disabled={!podeEditar || !draft.participa}
                    onChange={(e) => updateDraft(item.id, { margem: e.target.value })}
                    className="!py-1 !px-2 text-[12px] text-right font-mono" placeholder="%"
                  />
                </td>
                <td className="px-2 py-1.5 text-right font-mono font-bold text-base-100">{valorMinimo !== null ? formatBRL(valorMinimo) : '—'}</td>
                <td className="px-2 py-1.5 text-right font-mono text-base-300">{formatBRL(item.valorUnitarioLicitado)}</td>
                <td className="px-2 py-1.5 text-right">
                  {vsLicitado !== null ? (
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-bold font-mono ${vsLicitado <= 0 ? 'bg-positive-500/15 text-positive-400' : 'bg-negative-500/15 text-negative-400'}`}>
                      {vsLicitado >= 0 ? '+' : ''}{vsLicitado.toFixed(2)}%
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-base-500">
        Vs. Licitado = (Valor Mínimo − Vl. Licitado) ÷ Vl. Licitado. Negativo (verde) = ainda tem folga pra disputar. Positivo (vermelho) = o mínimo calculado já nasce acima do que o edital estima — alerta pra renegociar o custo, revisar a margem ou não disputar esse item.
      </p>
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
  const { nivel, carregando: carregandoPermissao } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao' && !carregandoPermissao
  const { showToast } = useToast()

  const analise = (analysis?.analise ?? null) as AnaliseEdital | null

  // O edital define o intervalo mínimo entre lances de dois jeitos
  // diferentes conforme o caso — percentual ("1% do lance anterior") ou
  // valor fixo ("R$ 50,00 de diferença") — e o texto que a IA extraiu já
  // inclui a unidade (ver o prompt de Analisar-edital). Prioriza % quando
  // os dois aparecem (é o mais comum em pregão eletrônico); nunca assume
  // sozinho, é só uma sugestão editável.
  const intervaloSugeridoIA = useMemo(() => {
    const texto = analise?.intervaloLances
    if (!texto) return null
    const pctMatch = texto.match(/(\d+(?:[.,]\d+)?)\s*%/)
    if (pctMatch) return { modo: 'percentual' as const, valor: parseFloat(pctMatch[1].replace(',', '.')) }
    const valorMatch = texto.match(/R\$\s*([\d.,]+)/i)
    if (valorMatch) {
      const num = parseFlexibleNumber(valorMatch[1])
      if (num !== null) return { modo: 'valor' as const, valor: num }
    }
    return null
  }, [analise])

  const [modo, setModo] = useState<'percentual' | 'valor'>('percentual')
  const [intervalo, setIntervalo] = useState('')
  const [sugestaoAplicadaPara, setSugestaoAplicadaPara] = useState<string | null>(null)
  const [ultimosLances, setUltimosLances] = useState<Record<string, string>>({})

  // Aplica a sugestão da IA (modo + valor) assim que ela chegar, só uma vez
  // por licitação — se o usuário já editou o campo manualmente depois, não
  // sobrescreve.
  if (intervaloSugeridoIA !== null && sugestaoAplicadaPara !== bidding.id) {
    setModo(intervaloSugeridoIA.modo)
    setIntervalo(String(intervaloSugeridoIA.valor))
    setSugestaoAplicadaPara(bidding.id)
  }

  const valorIntervalo = parseFlexibleNumber(intervalo) ?? 0

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
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Intervalo entre lances</label>
          <div className="flex gap-1 bg-base-900 border border-base-700 rounded-lg p-1 mb-1.5 w-fit">
            <button
              type="button"
              onClick={() => setModo('percentual')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition ${modo === 'percentual' ? 'bg-accent-500 text-base-950' : 'text-base-400 hover:text-base-100'}`}
            >
              Percentual (%)
            </button>
            <button
              type="button"
              onClick={() => setModo('valor')}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition ${modo === 'valor' ? 'bg-accent-500 text-base-950' : 'text-base-400 hover:text-base-100'}`}
            >
              Valor Fixo (R$)
            </button>
          </div>
          <Input placeholder={modo === 'percentual' ? 'Ex: 1' : 'Ex: 50,00'} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} className="w-40" />
        </div>
        <p className="text-[11px] text-base-500 flex-1 min-w-[220px]">
          {intervaloSugeridoIA !== null
            ? `Sugerido pela Análise de Edital (${intervaloSugeridoIA.modo === 'percentual' ? 'percentual' : 'valor fixo'}) — confira contra o edital e ajuste se precisar.`
            : 'A Análise de Edital ainda não identificou esse intervalo — informe manualmente conforme o edital.'}
          {' '}Calculadora de apoio: nada aqui é salvo, exceto se você usar o botão "Usar na Proposta Readequada" em algum item.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((i) => {
          const ultimoLanceTexto = ultimosLances[i.id] ?? ''
          const ultimoLance = parseFlexibleNumber(ultimoLanceTexto) ?? 0
          const proximoLance = ultimoLance > 0 && valorIntervalo > 0
            ? (modo === 'percentual' ? ultimoLance * (1 - valorIntervalo / 100) : Math.max(0, ultimoLance - valorIntervalo))
            : null
          return (
            <div key={i.id} className="bg-base-850/60 border border-base-800 rounded-xl px-5 py-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-4 min-w-[200px] flex-1">
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

  const campos = mapearCamposDaAnalise(analise)
  const resumo: string[] = []
  if (campos.municipio) resumo.push('Município')
  if (campos.orgao) resumo.push('Órgão')
  if (campos.objeto) resumo.push('Objeto')
  if (campos.numeroEdital) resumo.push('Nº Edital')
  if (campos.processo) resumo.push('Processo')
  if (campos.portal) resumo.push('Portal')
  if (campos.modalidade) resumo.push('Modalidade')
  if (campos.dataAbertura) resumo.push('Data do Pregão')
  if (campos.diasValidadeProposta) resumo.push('Validade da Proposta')
  if (campos.valorLicitado != null) resumo.push('Valor Total do Edital')

  const itensMapeados = mapearItensDaAnalise(analise)
  const temItensNaAnalise = !!itensMapeados
  const itens: Partial<BiddingItem>[] = itensMapeados ?? itensAtuais
  if (temItensNaAnalise) {
    resumo.push(`Itens/Lotes (${itensMapeados!.length})`)
    // "Valor que Vamos Participar" começa igual à soma dos itens que a IA
    // extraiu — o usuário ainda pode editar depois, e o alerta de
    // divergência (BiddingFormModal) avisa se ficar dessincronizado.
    campos.valorParticipacao = somarValorLicitado(itensMapeados!)
    resumo.push('Valor que Vamos Participar')
  }

  return { campos, itens, substituiItens: temItensNaAnalise, resumo }
}

function AnaliseEditalIA({ bidding, temEdital, podeEditar }: { bidding: Bidding; temEdital: boolean; podeEditar: boolean }) {
  const { analysis, analisar, travado, alternarItemParticipando, definirTodosParticipando } = useBiddingAnalysis(bidding.id)
  const { updateBidding } = useBiddings()
  const { items: itensAtuais } = useBiddingItems(bidding.id)
  const { showToast } = useToast()
  const [confirmandoPreenchimento, setConfirmandoPreenchimento] = useState(false)
  const [mostrandoUnlock, setMostrandoUnlock] = useState(false)
  const { bloqueada, desbloquear } = useBiddingEditLock(bidding)
  const { perguntar, isPending: perguntando } = usePerguntaEdital(bidding.id)

  const status = analysis?.status
  const processando = (status === 'processando' && !travado) || analisar.isPending
  const analise = (analysis?.analise ?? null) as AnaliseEdital | null
  const preenchimento = analise ? construirPreenchimento(analise, itensAtuais) : null

  const confirmarPreenchimento = () => {
    if (!preenchimento) return
    // Une com o que já estava marcado (em vez de substituir) — se uma
    // reanálise não trouxer de novo um campo que uma vez já veio da IA
    // (ex: o edital não tinha "processo" desta vez), o selo daquele campo
    // não desaparece à toa; só some quando alguém edita manualmente.
    const camposPreenchidosPorIa = Array.from(new Set([
      ...(bidding.camposPreenchidosPorIa ?? []),
      ...Object.keys(preenchimento.campos),
    ]))
    updateBidding.mutate({ bidding: { ...bidding, ...preenchimento.campos, camposPreenchidosPorIa }, items: preenchimento.itens }, {
      onSuccess: () => { setConfirmandoPreenchimento(false); showToast('Licitação atualizada com os dados da análise.') },
      onError: () => setConfirmandoPreenchimento(false),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {bloqueada && (
        <div className="flex items-center gap-3 bg-accent-500/10 border border-accent-500/30 rounded-lg p-3">
          <Lock className="w-4 h-4 text-accent-400 shrink-0" />
          <p className="flex-1 text-[12px] text-accent-200">
            Esta licitação já está <strong>Ganhou</strong> e <strong>Adjudicada e Homologada</strong> — nova análise e preenchimento automático estão bloqueados.
          </p>
          <Button type="button" variant="secondary" onClick={() => setMostrandoUnlock(true)}>Desbloquear com senha</Button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => analisar.mutate()} disabled={!temEdital || processando || bloqueada}>
          {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {processando ? 'Analisando...' : status === 'concluido' ? 'Analisar Novamente' : 'Analisar com IA'}
        </Button>
        {!temEdital && (
          <span className="text-[11px] text-base-500 italic">Envie o edital acima antes de analisar.</span>
        )}
        {processando && (
          <span className="text-[11px] text-base-500 italic">Pode levar até 2 minutos em editais grandes ou escaneados.</span>
        )}
      </div>

      {(status === 'erro' || analisar.isError || travado) && (() => {
        const erroTecnico = analysis?.erroMensagem || (analisar.error instanceof Error ? analisar.error.message : null)
        return (
          <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-negative-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[12px] text-negative-300">
                {travado
                  ? 'A análise demorou demais e parece ter travado (provavelmente o edital é grande/escaneado demais pra function atual processar a tempo). Tente novamente.'
                  : mensagemAmigavelErroAnalise(erroTecnico)}
              </p>
              {!travado && erroTecnico && (
                <details className="mt-1">
                  <summary className="text-[10px] text-base-500 cursor-pointer hover:text-base-400">Detalhe técnico</summary>
                  <p className="text-[10px] text-base-500 font-mono mt-1 break-all">{erroTecnico}</p>
                </details>
              )}
              <button onClick={() => analisar.mutate()} className="flex items-center gap-1.5 text-[11px] text-accent-300 hover:text-accent-200 transition mt-1.5">
                <RefreshCw className="w-3 h-3" /> Tentar novamente
              </button>
            </div>
          </div>
        )
      })()}

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
              <Button type="button" variant="secondary" onClick={() => setConfirmandoPreenchimento(true)} disabled={updateBidding.isPending || bloqueada}>
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

          <AnaliseEditalResumo
            analise={analise}
            onToggleItem={podeEditar ? (idx) => alternarItemParticipando.mutate(idx) : undefined}
            onToggleTodos={podeEditar ? (participando) => definirTodosParticipando.mutate(participando) : undefined}
          />

          {(analise.checklistDocumentacao?.length ?? 0) > 0 && (
            <p className="text-[11px] text-base-500 italic">
              {analise.checklistDocumentacao!.length} documento(s) sugerido(s) pela análise já preenchidos automaticamente na aba Checklist &amp; Habilitação.
            </p>
          )}

          <PerguntaEditalPanel perguntar={perguntar} isPending={perguntando} />
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

      <UnlockWithPasswordDialog
        open={mostrandoUnlock}
        entityLabel={`Licitação "${bidding.objeto}"`}
        entityId={bidding.id}
        onCancel={() => setMostrandoUnlock(false)}
        onUnlocked={() => { desbloquear(); setMostrandoUnlock(false) }}
      />
    </div>
  )
}

// Esclarecimentos / Impugnações / Raio-X sobre o edital desta licitação —
// exibição compartilhada com a fase de Oportunidade (ver AnaliseJuridicaTabs).
function AnaliseJuridicaIA({ bidding, temEdital }: { bidding: Bidding; temEdital: boolean }) {
  const [tipoAtivo, setTipoAtivo] = useState<TipoAnaliseJuridica>('esclarecimento')
  const { analysis, analisar, travado } = useAnaliseJuridicaEdital(bidding.id, tipoAtivo)
  return (
    <AnaliseJuridicaTabs
      temEdital={temEdital}
      tipoAtivo={tipoAtivo}
      onTrocarTipo={setTipoAtivo}
      analysis={analysis}
      analisar={analisar}
      travado={travado}
    />
  )
}

export default function LicitacaoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { biddings, updateEtapa, updateBidding } = useBiddings()
  const { showToast } = useToast()
  const { clients } = useClients()
  const { nivel: nivelLicitacoes, carregando: carregandoPermissao } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivelLicitacoes === 'edicao' && !carregandoPermissao
  const [searchParams] = useSearchParams()
  // Permite chegar direto numa aba específica via link (ex: um alerta de
  // pendência em ?aba=checklist) — só aceita chaves reais de ABAS, senão
  // cai no padrão de sempre.
  const abaInicial = ABAS.find((a) => a.key === searchParams.get('aba'))?.key ?? 'visao'
  const [aba, setAba] = useState<AbaKey>(abaInicial)
  const bidding = biddings.find((b) => b.id === id)
  const clientName = bidding ? (clients.find((c) => c.id === bidding.clientId)?.name ?? 'Cliente removido') : ''

  const { files: anexos, uploadFile: uploadAnexo, uploadProgress, deleteFile: deleteAnexo, getDownloadUrl: getAnexoUrl } = useAttachedFiles('licitacao', bidding?.id)
  const { items, isLoading: carregandoChecklist, addItem, updateItem, deleteItem, limparItensIA, addItensEmLote, marcarNaoAplicavel, reverterNaoAplicavel } = useBiddingChecklist(bidding?.id)
  // Excluir um item do checklist some da tela na hora, com uma saída de
  // "Desfazer" por alguns segundos, em vez de travar com um "tem certeza?"
  // antes — é reversível e não arrasta nenhum outro dado junto.
  const { estaPendente: itemPendenteDeExclusao, iniciarExclusao: iniciarExclusaoItem, toast: toastExclusaoItem } = useUndoableDelete<BiddingChecklistItem>()
  const { analisar: analisarAnexosDeclaracao } = useDeclaracaoAnexos(bidding?.id)
  const { documents: clientDocs, uploadAndSave: uploadClientDoc } = useClientDocuments(bidding?.clientId)
  const { atestados, addAtestado } = useAtestados(bidding?.clientId)
  const clienteDaLicitacao = clients.find((c) => c.id === bidding?.clientId)
  const { buscando, errosBusca, avisosBusca, buscarAutomatico, limparAviso, limparErro } = useBuscaCertidaoAutomatica(bidding?.clientId, clienteDaLicitacao?.cnpj ?? undefined, podeEditar)
  const { analysis, limparAnalise } = useBiddingAnalysis(bidding?.id)
  const { limpar: limparAnaliseJuridica } = useLimparAnaliseJuridica(bidding?.id)
  const { items: itensDaProposta, isLoading: carregandoItensProposta } = useBiddingItems(bidding?.id ?? null)

  // Assim que a IA identifica os itens do edital, eles já entram
  // automaticamente em Cadastrar Proposta / Proposta Readequada (ambas leem
  // de bidding_items) — sem precisar clicar em "Preencher Licitação com
  // estes Dados". Só roda enquanto a lista de itens estiver vazia: nunca
  // sobrescreve item já cadastrado/editado manualmente (marca, valor
  // ofertado etc.), e o botão manual continua disponível pra reimportar de
  // propósito depois (ex: se a análise for refeita).
  const itensJaImportadosParaRef = useRef<string | null>(null)
  useEffect(() => {
    if (!bidding || carregandoItensProposta) return
    if (itensJaImportadosParaRef.current === bidding.id) return
    const analise = (analysis?.analise ?? null) as AnaliseEdital | null
    const itensDaAnalise = analise ? mapearItensDaAnalise(analise) : null
    if (itensDaAnalise && itensDaProposta.length === 0) {
      itensJaImportadosParaRef.current = bidding.id
      updateBidding.mutate({ bidding, items: itensDaAnalise })
    }
  }, [bidding, analysis, itensDaProposta, carregandoItensProposta, updateBidding])

  // Documentos sugeridos pela Análise de Edital pra habilitação — comparados
  // com os itens de checklist já existentes (mesma transformação de número
  // usada em addItensEmLote) pra saber quais já foram adicionados e quais
  // ainda faltam, em vez de sempre oferecer "adicionar" tudo de novo.
  // BUG CORRIGIDO (1): antes só comparava com itens de origem='ia' — um item
  // adicionado manualmente com a mesma numeração/descrição do edital (ex:
  // "12.1 a)") não contava como "já existe", então uma nova análise (ou a
  // mesma análise recarregando) reinseria o mesmo item de novo, duplicado.
  // BUG CORRIGIDO (2): a comparação era só por texto exato da descrição —
  // como a Análise de Edital é feita por IA (não determinística), reanalisar
  // o mesmo edital podia devolver a mesma cláusula com redação levemente
  // diferente, o texto não batia no Set, e o item entrava de novo com a
  // mesma numeração de um já existente. Agora compara pelo número do edital
  // (numeroEdital) quando ele existe — muito mais estável entre reanálises
  // — e só cai pra descrição exata quando não há número.
  const checklistDocumentacao = ((analysis?.analise as AnaliseEdital | null)?.checklistDocumentacao ?? [])
  const chavesJaNoChecklist = new Set(items.map((i) => i.numeroEdital?.trim() || i.descricao))
  const checklistSugeridoPendente = checklistDocumentacao.filter((doc) => {
    const { numero, descricao } = extrairNumeroEdital(doc.descricao)
    return !chavesJaNoChecklist.has(numero?.trim() || descricao)
  })

  // Assim que uma análise de edital termina (a primeira ou uma refeita), o
  // checklist e os anexos de declaração se preenchem sozinhos — sem os
  // antigos botões manuais "Adicionar ao Checklist" e "Analisar Anexos do
  // Edital". A chave inclui analysis.updatedAt (não só bidding.id) pra
  // rearmar em cada nova análise concluída, sem duplicar o que já rodou
  // pra essa mesma versão da análise.
  const chaveAnaliseConcluida = bidding && analysis?.status === 'concluido' ? `${bidding.id}:${analysis.updatedAt}` : null

  const checklistAutoPreenchidoRef = useRef<string | null>(null)
  useEffect(() => {
    // BUG CORRIGIDO (3): sem esperar o checklist terminar de carregar
    // (carregandoChecklist), `items` começava vazio (query.data ?? []) —
    // se a query de checklist demorasse mais que a da análise, o dedup via
    // chavesJaNoChecklist rodava vazio e reinseria o checklist inteiro
    // duplicado. Acontecia de forma intermitente a cada F5 numa licitação
    // já analisada, dependendo só de qual query respondia primeiro.
    if (!podeEditar || !chaveAnaliseConcluida || carregandoChecklist) return
    if (checklistAutoPreenchidoRef.current === chaveAnaliseConcluida) return
    if (checklistSugeridoPendente.length === 0) return
    checklistAutoPreenchidoRef.current = chaveAnaliseConcluida
    addItensEmLote.mutate(checklistSugeridoPendente)
  }, [podeEditar, chaveAnaliseConcluida, carregandoChecklist, checklistSugeridoPendente, addItensEmLote])

  const anexosAutoAnalisadosRef = useRef<string | null>(null)
  useEffect(() => {
    if (!podeEditar || !chaveAnaliseConcluida) return
    if (anexosAutoAnalisadosRef.current === chaveAnaliseConcluida) return
    if (!anexos.some((a) => a.category === 'Edital')) return
    anexosAutoAnalisadosRef.current = chaveAnaliseConcluida
    analisarAnexosDeclaracao.mutate()
  }, [podeEditar, chaveAnaliseConcluida, anexos, analisarAnexosDeclaracao])

  const [enviando, setEnviando] = useState<string | null>(null)
  const [showNovoItem, setShowNovoItem] = useState(false)
  const [novoItem, setNovoItem] = useState({ numeroEdital: '', descricao: '', categoria: CATEGORIAS_CHECKLIST[0], obrigatorio: true, prazo: '', responsavelNome: '' })
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [visualizando, setVisualizando] = useState<{ nome: string; url: string | null } | null>(null)
  const [itemAbertoId, setItemAbertoId] = useState<string | null>(null)
  const [enviandoItemId, setEnviandoItemId] = useState<string | null>(null)
  const [dataValidadeCert, setDataValidadeCert] = useState('')
  const [certFileSelecionado, setCertFileSelecionado] = useState<File | null>(null)
  const [confirmandoCertVencendo, setConfirmandoCertVencendo] = useState<{ item: BiddingChecklistItem; file: File } | null>(null)
  const [atestadoForm, setAtestadoForm] = useState({ nome: '', objeto: '', orgaoEmissor: '', valor: '', dataEmissao: '' })
  const [atestadoFileSelecionado, setAtestadoFileSelecionado] = useState<File | null>(null)
  const [mostrarDownloadModal, setMostrarDownloadModal] = useState(false)
  const [confirmandoExclusaoEdital, setConfirmandoExclusaoEdital] = useState(false)
  const [itemMarcandoNaoAplicavel, setItemMarcandoNaoAplicavel] = useState<BiddingChecklistItem | null>(null)
  const [justificativaNaoAplicavel, setJustificativaNaoAplicavel] = useState('')

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

  const handleUploadAnexo = async (file: File, category: 'Edital' | 'Termo de Referência' | 'Contrato' | 'Proposta' | 'Empenho' | 'Ata de Sessão' | 'Outro') => {
    setEnviando(category)
    try {
      await uploadAnexo.mutateAsync({ file, category })
    } catch (err) {
      showToast(`Erro ao enviar: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviando(null)
    }
  }

  // Excluir o edital pode significar que o PDF errado foi enviado — nesse
  // caso, tudo que foi lido automaticamente dele (análise, análise
  // jurídica, itens de checklist sugeridos pela IA) fica errado junto e
  // precisa sumir também. Itens de checklist adicionados manualmente
  // (origem='manual') não têm relação com qual edital foi analisado, então
  // ficam intactos.
  const handleExcluirEdital = () => {
    if (!edital) return
    deleteAnexo.mutate(edital, {
      onSuccess: () => {
        limparAnalise.mutate()
        limparAnaliseJuridica.mutate()
        limparItensIA.mutate()
      },
    })
    setConfirmandoExclusaoEdital(false)
  }

  // Detecta um item de "Atestado de Capacidade Técnica" pela descrição —
  // esses não têm um clientDocumentTipo fixo (cada edital pede um atestado
  // diferente), mas ainda assim são reaproveitáveis: gravam na mesma seção
  // de Atestados do cliente que já alimenta o Ranking de Compatibilidade.
  const ehAtestadoTecnico = (item: BiddingChecklistItem) => !item.clientDocumentTipo && /atestado/i.test(item.descricao)

  // Enviar/renovar uma das 7 certidões padrão — grava direto no repositório
  // do cliente (client_documents). O item do checklist nem precisa de
  // vínculo próprio: já casa sozinho por clientDocumentTipo, então o mesmo
  // envio também resolve esse item em qualquer outra licitação do cliente
  // (a exibição em tela usa o cruzamento ao vivo de statusItemChecklist).
  // CORREÇÃO DE BUG: mas usePendenciasChecklist (painel de Pendências/Hoje/
  // Agenda) filtra atendido/client_document_id direto no SQL, sem passar
  // por esse cruzamento ao vivo — sem gravar client_document_id/atendido
  // aqui também, o item ficava "resolvido" só na tela desta licitação e
  // preso pra sempre naqueles painéis. Atualiza todo item deste checklist
  // com o mesmo clientDocumentTipo (mesmo padrão de match usado por
  // statusItemChecklist/arquivoResolvidoDoItem).
  const handleEnviarCertidao = async (item: BiddingChecklistItem, file: File) => {
    if (!item.clientDocumentTipo) return
    setEnviandoItemId(item.id)
    try {
      const { id: novoId } = await uploadClientDoc.mutateAsync({
        file,
        tipo: item.clientDocumentTipo,
        nome: CERT_CONFIG[item.clientDocumentTipo].label.split(' — ')[0],
        dataEmissao: new Date().toISOString().split('T')[0],
        dataValidade: dataValidadeCert || null,
      })
      const itensParaResolver = items.filter((i) => i.clientDocumentTipo === item.clientDocumentTipo)
      await Promise.all(itensParaResolver.map((i) => updateItem.mutateAsync({ ...i, clientDocumentId: novoId, atendido: true })))
      setItemAbertoId(null)
      setDataValidadeCert('')
    } catch (err) {
      showToast(`Erro ao enviar: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setEnviandoItemId(null)
    }
  }

  // Se a validade digitada já está vencendo (ou já vencida), confirma antes
  // de enviar em vez de aceitar direto — evita salvar sem perceber uma data
  // errada (ou um documento que já nasceu quase sem validade), mas ainda
  // permite enviar mesmo assim quando é intencional (ex: documento provisório).
  const handleClicarSalvarCertidao = (item: BiddingChecklistItem, file: File) => {
    if (!item.clientDocumentTipo) return
    const alertaDias = CERT_CONFIG[item.clientDocumentTipo].alertaDias
    const statusData = calcDocStatus(dataValidadeCert || null, alertaDias)
    if (statusData === 'vencendo' || statusData === 'vencido') {
      setConfirmandoCertVencendo({ item, file })
      return
    }
    handleEnviarCertidao(item, file)
  }

  const handleSalvarAtestadoDoItem = async (item: BiddingChecklistItem, file: File | null) => {
    if (!file) return
    setEnviandoItemId(item.id)
    try {
      const novoId = await addAtestado.mutateAsync({
        // Nome e objeto ficam opcionais — sem digitar, usa o nome do
        // arquivo. Objeto vazio só significa que esse atestado não entra
        // na comparação automática do Ranking de Compatibilidade.
        nome: atestadoForm.nome.trim() || file.name,
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

  // Mesmo ajuste já feito em usePendenciasChecklist (Painel de Pendências):
  // bidding_checklist_items.prazo só é sincronizado pelo trigger do banco
  // enquanto atendido=false — depois de confirmado, o campo cru fica
  // congelado na data de quando foi vinculado, mesmo que a certidão
  // vinculada seja renovada depois. Sobrepõe com a validade AO VIVO do
  // client_documents vinculado quando existir, pra esta aba não mostrar uma
  // data diferente da que o próprio selo de status já reflete.
  const prazoEfetivoItem = (item: BiddingChecklistItem): string | null => {
    if (item.clientDocumentId) {
      const doc = clientDocs.find((d) => d.id === item.clientDocumentId)
      if (doc) return doc.dataValidade ?? item.prazo
    }
    return item.prazo
  }

  const handleAbrirNaoAplicavel = (item: BiddingChecklistItem) => {
    // Pré-preenche com um texto padrão editável — a maioria dos casos é
    // "não se aplica a esta empresa" mesmo, então dá pra confirmar direto;
    // quem precisar de um motivo mais específico só troca o texto.
    setJustificativaNaoAplicavel('Não aplicável — exigência alternativa que não se enquadra para esta empresa.')
    setItemMarcandoNaoAplicavel(item)
  }

  const handleConfirmarNaoAplicavel = () => {
    if (!itemMarcandoNaoAplicavel || !justificativaNaoAplicavel.trim()) return
    marcarNaoAplicavel.mutate(
      { item: itemMarcandoNaoAplicavel, justificativa: justificativaNaoAplicavel.trim() },
      { onSuccess: () => setItemMarcandoNaoAplicavel(null) }
    )
  }

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
    .filter((x): x is { item: BiddingChecklistItem; arquivo: NonNullable<ReturnType<typeof arquivoResolvidoDoItem>> } => !!x.arquivo)

  const painelStatus = statusGeral && (
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
      <div className="px-6 pt-3 pb-2">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[12px] text-base-500 hover:text-base-300 transition mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={bidding.status} />
          <h1 className="font-display font-bold text-xl text-base-100">{bidding.objeto}</h1>
        </div>
        <p className="text-base-400 text-[13px] mt-0.5">{clientName} — {bidding.orgao} {bidding.municipio ? `(${bidding.municipio}${bidding.uf ? '/' + bidding.uf : ''})` : ''}</p>

        <div className="mt-4">
          <EtapaTrilha
            etapaAtual={bidding.etapa}
            atualizando={updateEtapa.isPending}
            onMudar={(etapa) => updateEtapa.mutate({ biddingId: bidding.id, etapa })}
            podeEditar={podeEditar}
          />
        </div>
      </div>

      {/* Barra de abas fixa: sempre com a mesma altura, nunca muda de
          tamanho conforme a rolagem — diferente da versão anterior (que
          encolhia o cabeçalho inteiro num resumo compacto), essa não tem
          nenhum gatilho de reflow ligado ao scroll, então não tem como
          voltar a "travar"/tremer no celular. `top-[56px] lg:top-0` empilha
          certinho embaixo da barra mobile do AppShell (que também é
          sticky), sem sobrepor. */}
      <div className="sticky top-[56px] lg:top-0 z-20 bg-base-950 px-6 border-b border-base-800 shadow-lg shadow-black/20">
        <div className="flex items-center gap-1 overflow-x-auto">
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
            {painelStatus}
            <ResultadoLicitacao bidding={bidding} />
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Modalidade</p>
                <p className="text-[13px] text-base-200">{bidding.modalidade}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Data do Pregão</p>
                <p className="text-[13px] text-base-200">{new Date(bidding.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Valor Total do Edital</p>
                {bidding.valorLicitado > 0 ? (
                  <p className="text-[13px] font-mono text-base-200">{formatBRL(bidding.valorLicitado)}</p>
                ) : (
                  <>
                    <p className="text-[13px] font-mono text-base-200">{formatBRL(somarValorLicitado(itensDaProposta))}</p>
                    <p className="text-[9.5px] text-base-500 mt-0.5">≈ estimado — soma dos itens (o edital não declara um total)</p>
                  </>
                )}
              </Card>
              <Card className="p-3">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Valor de Participação</p>
                <p className="text-[13px] font-mono text-base-200">{bidding.valorParticipacao != null ? formatBRL(bidding.valorParticipacao) : '—'}</p>
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
                    <button onClick={() => setConfirmandoExclusaoEdital(true)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
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
            {painelStatus}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
                  Checklist da Licitação
                  {totalObrigatorios > 0 && (
                    <span className="ml-2 text-base-400 normal-case font-normal">
                      {atendidosObrigatorios}/{totalObrigatorios} obrigatórios atendidos
                    </span>
                  )}
                  {items.some((i) => i.naoAplicavel) && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10.5px] font-semibold normal-case text-base-500 bg-base-800 border border-base-700 rounded-full px-2 py-0.5">
                      <Ban className="w-2.5 h-2.5" /> {items.filter((i) => i.naoAplicavel).length} não aplicável
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
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nº edital (opcional)</label>
                    <Input
                      placeholder="Ex: 5.2 a)"
                      value={novoItem.numeroEdital}
                      onChange={(e) => setNovoItem({ ...novoItem, numeroEdital: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">
                      Descrição <span className="text-negative-400">*</span>
                    </label>
                    <Input
                      placeholder="Ex: Balanço Patrimonial 2025, Atestado de Capacidade Técnica..."
                      value={novoItem.descricao}
                      onChange={(e) => setNovoItem({ ...novoItem, descricao: e.target.value })}
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
                      <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Prazo (opcional)</label>
                      <Input type="date" value={novoItem.prazo} onChange={(e) => setNovoItem({ ...novoItem, prazo: e.target.value })} />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Responsável (opcional)</label>
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
                  {items.filter((item) => !itemPendenteDeExclusao(item.id)).map((item) => {
                    const status = statusItem(item)
                    const arquivo = arquivoResolvidoDoItem(item, clientDocs, atestados, anexos)
                    const certidaoDisponivel = certidaoDisponivelParaItem(item, clientDocs)
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
                      <div key={item.id} className={`bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5 ${item.naoAplicavel ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className="pt-0.5 shrink-0 flex">
                            {item.naoAplicavel ? (
                              <Ban className="w-4 h-4 text-base-500" />
                            ) : (
                              <>
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
                              </>
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
                              {item.naoAplicavel ? (
                                <span className="ml-1.5 font-semibold">· não aplicável</span>
                              ) : (
                                item.obrigatorio && <span className="text-warning-400 ml-1.5">· obrigatório</span>
                              )}
                              {tipoConhecido && (
                                <span className="ml-1.5 text-accent-400">· certidão {CERT_CONFIG[tipoConhecido]?.label.split(' — ')[0]}</span>
                              )}
                              {prazoEfetivoItem(item) && (
                                <span className="ml-1.5">· prazo {new Date(prazoEfetivoItem(item)! + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                              )}
                              {item.responsavelNome && (
                                <span className="ml-1.5">· {item.responsavelNome}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            {arquivo && (
                              <IconButton icon={Eye} label="Ver PDF" tone="accent" onClick={() => handleVerArquivoDoItem(item)} />
                            )}
                            {podeEditar && !item.naoAplicavel && (
                              <IconButton
                                icon={arquivo ? RefreshCw : Paperclip}
                                label={arquivo ? 'Reenviar / substituir documento' : tipoConhecido ? 'Buscar / enviar certidão' : ehAtestado ? 'Salvar atestado' : 'Enviar documento'}
                                tone="accent"
                                onClick={() => handleAbrirItem(item)}
                                className={aberto ? 'text-accent-300 bg-accent-500/10' : ''}
                              />
                            )}
                            {podeEditar && temVinculoProprio && (
                              <IconButton icon={X} label="Desvincular (o arquivo continua no repositório do cliente)" onClick={() => handleDesvincularItem(item)} />
                            )}
                            {podeEditar && (
                              item.naoAplicavel ? (
                                <IconButton icon={RotateCcw} label="Reverter — voltar a exigir este item" tone="accent" onClick={() => reverterNaoAplicavel.mutate(item)} />
                              ) : (
                                <IconButton icon={Ban} label="Marcar como não aplicável" onClick={() => handleAbrirNaoAplicavel(item)} />
                              )
                            )}
                            {podeEditar && (
                              <IconButton
                                icon={Trash2}
                                label="Excluir item"
                                tone="negative"
                                onClick={() => iniciarExclusaoItem(item, {
                                  mensagem: `Item "${item.descricao}" excluído.`,
                                  excluir: (i) => deleteItem.mutate(i),
                                })}
                              />
                            )}
                          </div>
                        </div>

                        {item.naoAplicavel && item.justificativaNaoAplicavel && (
                          <p className="text-[10.5px] text-base-500 mt-1.5 pl-7 flex items-start gap-1.5">
                            <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                            <span><span className="font-semibold text-base-400">Motivo:</span> {item.justificativaNaoAplicavel}</span>
                          </p>
                        )}

                        {certidaoDisponivel && (
                          <div className="mt-1.5 pl-7 flex items-center gap-2 flex-wrap">
                            <span className="text-[10.5px] text-accent-300 bg-accent-500/10 border border-accent-500/25 rounded-full px-2 py-0.5">
                              Encontramos "{certidaoDisponivel.nome}" válida no cadastro do cliente
                            </span>
                            {podeEditar && (
                              <button
                                onClick={() => updateItem.mutate({ ...item, clientDocumentId: certidaoDisponivel.id, atendido: true })}
                                className="text-[10.5px] font-bold text-accent-300 hover:text-accent-200 underline"
                              >
                                Usar este documento
                              </button>
                            )}
                          </div>
                        )}

                        {arquivo && (
                          <p className="text-[10.5px] text-base-500 mt-1.5 pl-7 flex items-center gap-1 truncate">
                            <FileText className="w-3 h-3 shrink-0" /> {arquivo.nome}
                            {arquivo.dataValidade && (
                              <span className={`shrink-0 ${status === 'vencendo' ? 'text-warning-400' : ''}`}>
                                {' '}· válido até {new Date(arquivo.dataValidade + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </span>
                            )}
                            {tipoConhecido && !temVinculoProprio && (
                              <span className="text-base-600 italic shrink-0"> · reaproveitado do repositório do cliente, não deste edital</span>
                            )}
                          </p>
                        )}

                        <Drawer
                          open={aberto && podeEditar}
                          onClose={() => setItemAbertoId(null)}
                          title={<>{item.numeroEdital && <span className="font-mono text-accent-300">{item.numeroEdital} </span>}{item.descricao}</>}
                          subtitle={item.categoria || undefined}
                        >
                          {arquivo && (
                            <div className="bg-warning-500/10 border border-warning-500/25 rounded-lg p-2.5 flex items-start gap-2">
                              <AlertCircle className="w-3.5 h-3.5 text-warning-400 shrink-0 mt-0.5" />
                              <p className="text-[11px] text-warning-300 flex-1">
                                Este item já está enviado ({arquivo.nome}). Enviar um novo arquivo abaixo substitui o atual.
                              </p>
                            </div>
                          )}
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

                              <div className="flex flex-col gap-2 bg-base-900/40 border border-base-800 rounded-lg p-2.5">
                                <span className="text-[11px] text-base-400">Enviar PDF já em mãos:</span>
                                <input
                                  type="date" value={dataValidadeCert} onChange={(e) => setDataValidadeCert(e.target.value)}
                                  className="bg-base-850 border border-base-700 rounded-lg px-2 py-1.5 text-[12px] text-base-100 focus:border-accent-400 outline-none"
                                />
                                <input
                                  type="file" accept=".pdf,.png,.jpg" onChange={(e) => setCertFileSelecionado(e.target.files?.[0] ?? null)}
                                  className="text-[11px] text-base-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-accent-500 file:text-base-950 file:font-semibold file:text-[11px] hover:file:bg-accent-400 file:cursor-pointer"
                                />
                                <Button
                                  onClick={() => certFileSelecionado && handleClicarSalvarCertidao(item, certFileSelecionado)}
                                  disabled={!certFileSelecionado || enviandoEste}
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
                              <div className="grid grid-cols-1 gap-2">
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
                                  disabled={!atestadoFileSelecionado || enviandoEste}
                                >
                                  {enviandoEste ? 'Salvando...' : 'Salvar Atestado'}
                                </Button>
                              </div>
                            </div>
                          )}

                          {!tipoConhecido && !ehAtestado && (
                            <div className="flex flex-col items-start gap-2 bg-base-900/40 border border-base-800 rounded-lg p-2.5">
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
                        </Drawer>
                      </div>
                    )
                  })}
                </div>
              )}

              {checklistDocumentacao.length > 0 && (
                <div className="mt-3 bg-accent-500/10 border border-accent-500/25 rounded-lg p-3">
                  {checklistSugeridoPendente.length > 0 ? (
                    <p className="text-[12px] text-accent-300 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Adicionando automaticamente {checklistSugeridoPendente.length} documento(s) sugerido(s) pela análise ao checklist...
                    </p>
                  ) : (
                    <p className="text-[12px] text-positive-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> {checklistDocumentacao.length} documento(s) sugerido(s) pela análise {checklistDocumentacao.length === 1 ? 'foi adicionado' : 'foram adicionados'} automaticamente ao checklist.
                    </p>
                  )}
                </div>
              )}
            </div>

            <DeclaracaoAnexosPanel bidding={bidding} checklistItems={items} />
          </>
        )}

        {aba === 'proposta-inicial' && <AbaCadastrarProposta bidding={bidding} />}

        {aba === 'precificacao' && <AbaPrecificacao bidding={bidding} />}

        {aba === 'proposta' && <AbaProposta bidding={bidding} />}

        {aba === 'documentos' && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[12px] text-base-500">Pronto pra enviar pra plataforma? Zipe só o que precisa.</p>
              <Button variant="secondary" onClick={() => setMostrarDownloadModal(true)}>
                <FolderDown className="w-4 h-4" /> Zipar Documento
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
                  <div className="flex items-center gap-2" title={`${itensComAnexo.length} de ${items.length} itens do checklist já têm documento anexado`}>
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

            <div className="bg-base-850/60 border border-base-800 rounded-lg p-3 text-[12px] text-base-400 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-base-500" />
              <span>
                Documentos institucionais do cliente (contrato social, atestados, certidões) não ficam aqui — eles vivem na
                pasta do próprio cliente, em <strong className="text-base-300">Cadastros → Documentos de Habilitação</strong> (a
                habilitação da empresa, não desta licitação específica). O contrato final assinado, empenhos e atas
                ficam na aba <strong className="text-base-300">Documentos do Processo</strong>. O envio pra plataforma do
                órgão continua manual — cada portal de compras é diferente.
              </span>
            </div>

            <DeclaracoesPadrao bidding={bidding} client={clienteDaLicitacao} />
          </>
        )}

        {aba === 'documentos-processo' && (
          <AbaDocumentosDoProcesso
            anexos={anexos}
            enviando={enviando}
            uploadProgress={uploadProgress}
            abrindo={abrindo}
            podeEditar={podeEditar}
            onUpload={handleUploadAnexo}
            onVisualizar={handleVisualizarAnexo}
            onAbrir={handleAbrirAnexo}
            onExcluir={(a) => deleteAnexo.mutate(a)}
          />
        )}

        {aba === 'sessao' && <AbaSessaoAoVivo bidding={bidding} />}

        {aba === 'historico' && <AbaHistorico bidding={bidding} />}
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

      <ConfirmDialog
        open={confirmandoExclusaoEdital}
        title="Excluir edital"
        description="Isso também apaga a Análise de Edital, a Análise Jurídica e os itens de checklist sugeridos pela IA a partir deste PDF (os itens que você adicionou manualmente continuam). Use quando o PDF enviado estiver errado."
        confirmLabel="Excluir tudo"
        danger
        isLoading={deleteAnexo.isPending}
        onCancel={() => setConfirmandoExclusaoEdital(false)}
        onConfirm={handleExcluirEdital}
      />

      <ConfirmDialog
        open={!!confirmandoCertVencendo}
        title="Certidão já vencendo (ou vencida)"
        description={`A validade informada (${dataValidadeCert ? new Date(dataValidadeCert + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}) já está vencendo ou vencida. Quer enviar mesmo assim?`}
        confirmLabel="Enviar mesmo assim"
        danger
        isLoading={enviandoItemId === confirmandoCertVencendo?.item.id}
        onCancel={() => setConfirmandoCertVencendo(null)}
        onConfirm={() => {
          if (!confirmandoCertVencendo) return
          const { item, file } = confirmandoCertVencendo
          setConfirmandoCertVencendo(null)
          handleEnviarCertidao(item, file)
        }}
      />

      <Modal
        open={!!itemMarcandoNaoAplicavel}
        onClose={() => setItemMarcandoNaoAplicavel(null)}
        title="Marcar item como não aplicável"
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-base-400">
            Use quando o edital lista uma exigência alternativa (ex: por natureza jurídica) que não vale pra esta empresa. O item continua no checklist, mas sai da contagem de obrigatórios — se precisar, dá pra reverter a qualquer momento.
          </p>
          {itemMarcandoNaoAplicavel && (
            <div className="bg-base-850 border border-base-700 rounded-lg px-3 py-2.5 text-[12px] text-base-300">
              {itemMarcandoNaoAplicavel.numeroEdital && (
                <span className="font-mono text-[10.5px] font-bold text-accent-300 bg-accent-500/10 rounded px-1.5 py-0.5 mr-1.5">
                  {itemMarcandoNaoAplicavel.numeroEdital}
                </span>
              )}
              {itemMarcandoNaoAplicavel.descricao}
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Motivo (fica registrado no checklist)</label>
            <Textarea
              value={justificativaNaoAplicavel}
              onChange={(e) => setJustificativaNaoAplicavel(e.target.value)}
              rows={4}
              placeholder="Ex: Não aplicável — a empresa não se enquadra como empresário individual; é sociedade empresária limitada."
            />
            <p className="text-[11px] text-base-500 mt-1">
              Esse texto substitui o pedido de documento nesse item. Se for pedido em diligência, é isso que explica por que não tem anexo aqui.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setItemMarcandoNaoAplicavel(null)}>Cancelar</Button>
            <Button onClick={handleConfirmarNaoAplicavel} disabled={!justificativaNaoAplicavel.trim() || marcarNaoAplicavel.isPending}>
              <Ban className="w-3.5 h-3.5" /> {marcarNaoAplicavel.isPending ? 'Salvando...' : 'Confirmar Não Aplicável'}
            </Button>
          </div>
        </div>
      </Modal>

      <UndoToast toast={toastExclusaoItem} />
    </div>
  )
}
