import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, FileText, Upload, Plus, Trash2, CheckCircle2, Circle, Download,
  AlertCircle, Loader2, Sparkles, Award, Check, History, ChevronDown, ChevronUp,
  ClipboardList, Gavel, Wallet, Send, CircleDot, FileSignature, Info, Activity, RefreshCw, Wand2,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { fromBiddingItemRow } from '../lib/mappers'
import { useAuth } from '../hooks/useAuth'
import { Button, Input, Select } from '../components/ui/FormControls'
import { PageHeader, Card } from '../components/ui/Primitives'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { formatBRL } from '../hooks/useAccountBalances'
import { useAttachedFiles } from '../hooks/useAttachedFiles'
import { useBiddingChecklist, calcularHabilitacao, statusItemChecklist } from '../hooks/useBiddingChecklist'
import { useBiddingAnalysis } from '../hooks/useBiddingAnalysis'
import { useBiddingItems } from '../hooks/useBiddingItems'
import { useBiddingItemVersions } from '../hooks/useBiddingItemVersions'
import { useClientDocuments } from '../hooks/useClientDocuments'
import { useAtestados, calcularSimilaridade } from '../hooks/useAtestados'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
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
  { key: 'proposta', label: 'Proposta & Itens', icon: Wallet },
  { key: 'documentos', label: 'Documentos', icon: FileSignature },
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

  return { items: query.data ?? [], isLoading: query.isLoading, salvarRateio }
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

function AbaProposta({ bidding }: { bidding: Bidding }) {
  const { items, isLoading, salvarRateio } = useBiddingItemsDaLicitacao(bidding.id)
  const { nivel } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivel === 'edicao'

  const [valorFinal, setValorFinal] = useState('')
  const [metodo, setMetodo] = useState<'proporcional' | 'percentual'>('proporcional')
  const [percentuais, setPercentuais] = useState<Record<string, string>>({})
  const [marcarEnviadaAoSalvar, setMarcarEnviadaAoSalvar] = useState(true)

  const somaOriginal = items.reduce((s, i) => s + i.quantidade * i.valorUnitarioLicitado, 0)

  const pesos: Record<string, number> = {}
  if (metodo === 'proporcional') {
    items.forEach((i) => {
      const total = i.quantidade * i.valorUnitarioLicitado
      pesos[i.id] = somaOriginal > 0 ? total / somaOriginal : 1 / (items.length || 1)
    })
  } else {
    const somaPercentuais = Object.values(percentuais).reduce((s, p) => s + (parseFloat(p.replace(',', '.')) || 0), 0)
    items.forEach((i) => {
      const p = parseFloat((percentuais[i.id] ?? '').replace(',', '.')) || 0
      pesos[i.id] = somaPercentuais > 0 ? p / somaPercentuais : 0
    })
  }

  const valorFinalNum = parseFloat(valorFinal.replace(',', '.')) || 0
  const rateio = valorFinalNum > 0 && items.length > 0 ? calcularRateio(items, valorFinalNum, pesos) : null

  const handleSalvar = () => {
    if (!rateio) return
    salvarRateio.mutate(
      { novosValoresTotais: rateio, observacao: `Rateio — proposta readequada (${metodo})`, marcarEnviada: marcarEnviadaAoSalvar },
      { onSuccess: () => { setValorFinal(''); setPercentuais({}) } }
    )
  }

  if (isLoading) return <p className="text-[13px] text-base-500 py-4">Carregando itens...</p>

  if (items.length === 0) {
    return <p className="text-[13px] text-base-500 italic py-4">Nenhum item cadastrado nesta licitação ainda — os itens entram pela tela de edição da licitação.</p>
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Itens da Licitação</p>
        <div className="overflow-x-auto bg-base-850/60 border border-base-800 rounded-xl">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-base-500 border-b border-base-800">
                <th className="text-left font-semibold px-3 py-2">Item</th>
                <th className="text-left font-semibold px-3 py-2">Descrição</th>
                <th className="text-right font-semibold px-3 py-2">Qtd.</th>
                <th className="text-right font-semibold px-3 py-2">Vl. Unit. Licitado</th>
                <th className="text-right font-semibold px-3 py-2">Vl. Unit. Ofertado</th>
                {metodo === 'percentual' && <th className="text-right font-semibold px-3 py-2">% do Rateio</th>}
                {rateio && <th className="text-right font-semibold px-3 py-2 bg-base-800/40">Novo Vl. Unit.</th>}
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
                  {rateio && (
                    <td className="px-3 py-2 text-right font-mono font-semibold text-accent-300 bg-base-800/20">
                      {formatBRL((rateio[i.id] ?? 0) / (i.quantidade || 1))}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {rateio && (
              <tfoot>
                <tr className="border-t border-base-700">
                  <td colSpan={metodo === 'percentual' ? 6 : 5} className="px-3 py-2 text-right text-[11px] text-base-500">Soma do rateio</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-positive-400 bg-base-800/40">
                    {formatBRL(Object.values(rateio).reduce((s, v) => s + v, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {podeEditar && (
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Rateio da Proposta Readequada</p>
          <p className="text-[12px] text-base-400">
            Informe o valor total final (dos lances) e escolha como dividir entre os itens. O sistema ajusta os centavos pra soma fechar exatamente com o valor informado.
          </p>
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
// pregão — só os itens (número, descrição, valor de referência) em fonte
// grande pra consulta rápida no meio da disputa, sem os outros elementos
// da página (checklist, edital, etc). Reaproveita o mesmo hook local de
// itens já usado pela AbaProposta — mesma query, sem refazer o fetch.
function AbaSessaoAoVivo({ bidding }: { bidding: Bidding }) {
  const { items, isLoading } = useBiddingItemsDaLicitacao(bidding.id)

  if (isLoading) return <p className="text-[13px] text-base-500 py-4">Carregando itens...</p>

  if (items.length === 0) {
    return <p className="text-[13px] text-base-500 italic py-4">Nenhum item cadastrado nesta licitação.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-4 bg-base-850/60 border border-base-800 rounded-xl px-5 py-4">
          <div className="flex items-center gap-4 min-w-0">
            <span className="text-xl font-extrabold font-mono text-accent-300 shrink-0 w-14 text-center">{i.numeroItem}</span>
            <p className="text-base font-semibold text-base-100">{i.descricao}</p>
          </div>
          <span className="text-lg font-extrabold font-mono text-base-100 shrink-0">{formatBRL(i.valorUnitarioLicitado)}</span>
        </div>
      ))}
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
  modalidade?: string
  srp?: boolean
  data?: string
  horario?: string
  portal?: string
  resumoTecnico?: string
  itens?: { numero?: string | number; descricao: string; unidade?: string; quantidade?: number; valorReferencia?: number }[]
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
  const [confirmandoPreenchimento, setConfirmandoPreenchimento] = useState(false)
  const [preenchimentoAplicado, setPreenchimentoAplicado] = useState(false)

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
      onSuccess: () => { setPreenchimentoAplicado(true); setConfirmandoPreenchimento(false) },
      onError: () => setConfirmandoPreenchimento(false),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => { setPreenchimentoAplicado(false); analisar.mutate() }} disabled={!temEdital || processando}>
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
              {preenchimentoAplicado && (
                <span className="text-[11px] text-positive-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Licitação atualizada
                </span>
              )}
            </div>
          )}

          {updateBidding.isError && (
            <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 text-[12px] text-negative-300">
              {updateBidding.error instanceof Error ? updateBidding.error.message : 'Não foi possível atualizar a licitação com os dados da análise.'}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <CampoResumo label="Município / Órgão" valor={[analise.municipio, analise.orgao].filter(Boolean).join(' — ')} />
            <CampoResumo label="Objeto" valor={analise.objeto} />
            <CampoResumo label="Modalidade / SRP" valor={[analise.modalidade, analise.srp ? 'SRP' : null].filter(Boolean).join(' — ')} />
            <CampoResumo label="Data / Horário / Portal" valor={[analise.data, analise.horario, analise.portal].filter(Boolean).join(' — ')} />
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

export default function LicitacaoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { biddings, updateEtapa } = useBiddings()
  const { clients } = useClients()
  const { nivel: nivelLicitacoes } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivelLicitacoes === 'edicao'
  const [aba, setAba] = useState<AbaKey>('visao')

  const bidding = biddings.find((b) => b.id === id)
  const clientName = bidding ? (clients.find((c) => c.id === bidding.clientId)?.name ?? 'Cliente removido') : ''

  const { files: anexos, uploadFile: uploadAnexo, uploadProgress, deleteFile: deleteAnexo, getDownloadUrl: getAnexoUrl } = useAttachedFiles('licitacao', bidding?.id)
  const { items, addItem, updateItem, deleteItem } = useBiddingChecklist(bidding?.id)
  const { documents: clientDocs } = useClientDocuments(bidding?.clientId)
  const { atestados } = useAtestados(bidding?.clientId)
  const { limparAnalise } = useBiddingAnalysis(bidding?.id)

  const [enviando, setEnviando] = useState<string | null>(null)
  const [showNovoItem, setShowNovoItem] = useState(false)
  const [novoItem, setNovoItem] = useState({ descricao: '', categoria: CATEGORIAS_CHECKLIST[0], obrigatorio: true, prazo: '', responsavelNome: '' })
  const [abrindo, setAbrindo] = useState<string | null>(null)

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

  const handleUploadAnexo = async (file: File, category: 'Edital' | 'Termo de Referência' | 'Contrato') => {
    setEnviando(category)
    try {
      await uploadAnexo.mutateAsync({ file, category })
    } catch (err) {
      alert(`Erro ao enviar: ${String(err)}`)
    } finally {
      setEnviando(null)
    }
  }

  const handleAbrirAnexo = async (anexo: { id: string; storagePath: string }) => {
    setAbrindo(anexo.id)
    try {
      const url = await getAnexoUrl(anexo.storagePath)
      window.open(url, '_blank')
    } catch {
      alert('Não foi possível abrir o arquivo.')
    } finally {
      setAbrindo(null)
    }
  }

  const handleAdicionarItem = () => {
    if (!novoItem.descricao.trim()) return
    addItem.mutate(
      {
        descricao: novoItem.descricao.trim(),
        categoria: novoItem.categoria,
        obrigatorio: novoItem.obrigatorio,
        prazo: novoItem.prazo || null,
        responsavelNome: novoItem.responsavelNome.trim() || null,
      },
      { onSuccess: () => { setShowNovoItem(false); setNovoItem({ descricao: '', categoria: CATEGORIAS_CHECKLIST[0], obrigatorio: true, prazo: '', responsavelNome: '' }) } }
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
                  <button onClick={() => handleAbrirAnexo(edital)} disabled={abrindo === edital.id} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {podeEditar && (
                    <button onClick={() => deleteAnexo.mutate(edital, { onSuccess: () => limparAnalise.mutate() })} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
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
                  <button onClick={() => handleAbrirAnexo(termoReferencia)} disabled={abrindo === termoReferencia.id} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
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
                  <Input
                    placeholder="Ex: Balanço Patrimonial 2025, Atestado de Capacidade Técnica..."
                    value={novoItem.descricao}
                    onChange={(e) => setNovoItem({ ...novoItem, descricao: e.target.value })}
                  />
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
                    return (
                      <div key={item.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
                        {status === 'atendido' && <CheckCircle2 className="w-4 h-4 text-positive-400 shrink-0" />}
                        {status === 'vencendo' && <AlertCircle className="w-4 h-4 text-warning-400 shrink-0" />}
                        {status === 'faltando' && (
                          podeEditar ? (
                            <button onClick={() => updateItem.mutate({ ...item, atendido: !item.atendido })} title="Marcar como atendido">
                              <Circle className="w-4 h-4 text-base-600 hover:text-base-400 shrink-0 transition" />
                            </button>
                          ) : (
                            <Circle className="w-4 h-4 text-base-700 shrink-0" />
                          )
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-base-200 truncate">{item.descricao}</p>
                          <p className="text-[10px] text-base-500">
                            {item.categoria}
                            {item.obrigatorio && <span className="text-warning-400 ml-1.5">· obrigatório</span>}
                            {item.clientDocumentTipo && status !== 'faltando' && (
                              <span className="ml-1.5 text-accent-400">· vinculado à {CERT_CONFIG[item.clientDocumentTipo]?.label.split(' — ')[0]}</span>
                            )}
                            {item.prazo && (
                              <span className="ml-1.5">· prazo {new Date(item.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                            )}
                            {item.responsavelNome && (
                              <span className="ml-1.5">· {item.responsavelNome}</span>
                            )}
                          </p>
                        </div>
                        {podeEditar && (
                          <button onClick={() => deleteItem.mutate(item)} className="p-1 text-base-500 hover:text-negative-400 transition shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {aba === 'proposta' && <AbaProposta bidding={bidding} />}

        {aba === 'documentos' && (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Contrato Assinado</p>
              {contrato ? (
                <div className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
                  <FileSignature className="w-5 h-5 text-accent-400 shrink-0" />
                  <span className="flex-1 text-[13px] text-base-200 truncate">{contrato.name}</span>
                  <button onClick={() => handleAbrirAnexo(contrato)} disabled={abrindo === contrato.id} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
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
                pasta do próprio cliente, em <strong className="text-base-300">Cadastros → Documentos de Habilitação</strong>.
              </span>
            </div>
          </>
        )}

        {aba === 'sessao' && <AbaSessaoAoVivo bidding={bidding} />}
      </div>
    </div>
  )
}
