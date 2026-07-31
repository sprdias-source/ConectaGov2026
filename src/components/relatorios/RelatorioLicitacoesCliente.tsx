import { useMemo, useState } from 'react'
import { Printer, Gavel } from 'lucide-react'
import { Card, StatusBadge, EmptyState } from '../ui/Primitives'
import { Select } from '../ui/FormControls'
import { formatBRL } from '../../hooks/useAccountBalances'
import { useBiddingItemsPorLicitacoes } from '../../hooks/useBiddingItems'
import { useOpportunities } from '../../hooks/useOpportunities'
import type { Client, Bidding, BiddingItem } from '../../types/domain'

// Valor "fechado" de uma licitação ganha e "valor em jogo" de uma perdida —
// mesma convenção usada no BI de Concorrência (valorOfertadoReal quando
// existe, senão cai pro valor licitado original). Usado só como reserva
// pra licitações antigas sem itens cadastrados (ver resumoItensBidding).
const valorRelevante = (b: Bidding) => b.valorOfertadoReal ?? b.valorLicitado

interface ResumoItensBidding {
  valorLicitado: number
  valorParticipado: number
  valorGanho: number
  diferenca: number
  temItens: boolean
}

// Cruza a licitação com os itens dela pra saber, de verdade, quanto era o
// edital todo, quanto o cliente participou (itens com oferta lançada) e
// quanto ele ganhou (só os itens marcados como ganhos) — em vez de tratar
// a licitação inteira como "ganha" ou "perdida" de uma vez só. Se a
// licitação não tem itens cadastrados (editor nunca foi usado), cai pro
// valor da licitação inteira, pra licitações antigas continuarem aparecendo.
function resumoItensBidding(b: Bidding, itens: BiddingItem[]): ResumoItensBidding {
  if (itens.length === 0) {
    const valorGanho = b.status === 'Ganhou' ? valorRelevante(b) : 0
    return {
      valorLicitado: b.valorLicitado,
      valorParticipado: b.status !== 'Cancelada' && b.status !== 'Desistiu' ? b.valorLicitado : 0,
      valorGanho,
      diferenca: b.status === 'Ganhou' ? b.valorLicitado - valorGanho : 0,
      temItens: false,
    }
  }
  const valorLicitado = itens.reduce((s, i) => s + i.quantidade * i.valorUnitarioLicitado, 0)
  const participados = itens.filter((i) => i.valorUnitarioOfertado !== null)
  const valorParticipado = participados.reduce((s, i) => s + i.quantidade * i.valorUnitarioLicitado, 0)
  const ganhos = itens.filter((i) => i.ganhou)
  const valorLicitadoGanhos = ganhos.reduce((s, i) => s + i.quantidade * i.valorUnitarioLicitado, 0)
  const valorGanho = ganhos.reduce((s, i) => s + i.quantidade * (i.valorUnitarioOfertado ?? i.valorUnitarioLicitado), 0)
  return {
    valorLicitado,
    valorParticipado,
    valorGanho,
    diferenca: valorLicitadoGanhos - valorGanho,
    temItens: true,
  }
}

export default function RelatorioLicitacoesCliente({ clients, biddings }: { clients: Client[]; biddings: Bidding[] }) {
  const [clientId, setClientId] = useState('')
  const [modo, setModo] = useState<'consolidado' | 'normal'>('consolidado')

  const cliente = clients.find((c) => c.id === clientId) ?? null

  const doCliente = useMemo(
    () => biddings.filter((b) => b.clientId === clientId && b.isActive).sort((a, b) => a.dataAbertura.localeCompare(b.dataAbertura)),
    [biddings, clientId]
  )

  const biddingIds = useMemo(() => doCliente.map((b) => b.id), [doCliente])
  const { items: todosItens } = useBiddingItemsPorLicitacoes(biddingIds)

  const itensPorBidding = useMemo(() => {
    const mapa = new Map<string, BiddingItem[]>()
    for (const i of todosItens) {
      const lista = mapa.get(i.biddingId) ?? []
      lista.push(i)
      mapa.set(i.biddingId, lista)
    }
    return mapa
  }, [todosItens])

  const resumos = useMemo(() => {
    const mapa = new Map<string, ResumoItensBidding>()
    for (const b of doCliente) {
      mapa.set(b.id, resumoItensBidding(b, itensPorBidding.get(b.id) ?? []))
    }
    return mapa
  }, [doCliente, itensPorBidding])

  const stats = useMemo(() => {
    const participou = doCliente.filter((b) => b.status !== 'Cancelada' && b.status !== 'Desistiu')
    const ganhou = doCliente.filter((b) => b.status === 'Ganhou')
    const perdeu = doCliente.filter((b) => b.status === 'Perdeu')
    const emAndamento = doCliente.filter((b) => b.status === 'Em Andamento')
    const canceladas = doCliente.filter((b) => b.status === 'Cancelada')
    // Separado de "Cancelada" (o órgão que cancelou o edital) — aqui é o
    // cliente que desistiu depois de já estar no funil, informação que o
    // relatório precisa mostrar à parte.
    const desistiu = doCliente.filter((b) => b.status === 'Desistiu')
    // Valor fechado agora vem do que foi ganho ITEM A ITEM, não da
    // licitação inteira — um cliente que ganhou 1 de 4 itens não pode
    // aparecer como se tivesse fechado o edital todo.
    const valorFechado = ganhou.reduce((s, b) => s + (resumos.get(b.id)?.valorGanho ?? valorRelevante(b)), 0)
    // "Quanto deixou de ganhar" = soma do valor das oportunidades perdidas.
    const valorPerdido = perdeu.reduce((s, b) => s + valorRelevante(b), 0)
    return {
      totalEnviadas: doCliente.length,
      totalParticipou: participou.length,
      totalGanhou: ganhou.length,
      totalPerdeu: perdeu.length,
      totalEmAndamento: emAndamento.length,
      totalCanceladas: canceladas.length,
      totalDesistiu: desistiu.length,
      valorFechado,
      valorPerdido,
    }
  }, [doCliente, resumos])

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 screen-only">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72">
            <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Cliente</label>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Selecione um cliente...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          {cliente && (
            <div className="flex gap-1 bg-base-900 border border-base-800 rounded-lg p-1 w-fit">
              <button
                onClick={() => setModo('consolidado')}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition ${modo === 'consolidado' ? 'bg-accent-500 text-base-950' : 'text-base-400 hover:text-base-100'}`}
              >
                Consolidado
              </button>
              <button
                onClick={() => setModo('normal')}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition ${modo === 'normal' ? 'bg-accent-500 text-base-950' : 'text-base-400 hover:text-base-100'}`}
              >
                Normal (por item)
              </button>
            </div>
          )}
        </div>
      </Card>

      {!cliente ? (
        <Card className="screen-only">
          <EmptyState icon={Gavel} title="Selecione um cliente" description="Escolha um cliente acima para gerar o relatório detalhado de oportunidades enviadas, participação e resultados." />
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between screen-only">
            <div>
              <p className="text-[15px] font-bold text-base-100">{cliente.name}</p>
              {cliente.cnpj && <p className="text-[12px] text-base-500">CNPJ: {cliente.cnpj}</p>}
            </div>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[12px] font-semibold text-base-300 hover:text-base-100 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition">
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 screen-only">
            <CardEstatistica label="Oportunidades Enviadas" valor={stats.totalEnviadas} />
            <CardEstatistica label="Participou" valor={stats.totalParticipou} />
            <CardEstatistica label="Ganhou" valor={stats.totalGanhou} cor="text-positive-400" />
            <CardEstatistica label="Perdeu" valor={stats.totalPerdeu} cor="text-negative-400" />
            <CardEstatistica label="Em Andamento" valor={stats.totalEmAndamento} cor="text-accent-400" />
            <CardEstatistica label="Cancelada (órgão)" valor={stats.totalCanceladas} />
            <CardEstatistica label="Desistiu (cliente)" valor={stats.totalDesistiu} />
            <CardEstatistica label="Valor Ganho (por item)" valor={formatBRL(stats.valorFechado)} cor="text-positive-400" mono />
            <CardEstatistica label="Deixou de Ganhar (Perdidas)" valor={formatBRL(stats.valorPerdido)} cor="text-negative-400" mono />
          </div>

          <OportunidadesResumoCliente clientId={clientId} />

          {doCliente.length === 0 ? (
            <Card className="screen-only">
              <EmptyState icon={Gavel} title="Nenhuma oportunidade cadastrada" description="Este cliente ainda não tem licitações cadastradas no sistema." />
            </Card>
          ) : modo === 'consolidado' ? (
            <TabelaConsolidada doCliente={doCliente} resumos={resumos} />
          ) : (
            <TabelaNormal doCliente={doCliente} itensPorBidding={itensPorBidding} />
          )}

          {doCliente.length > 0 && (
            <div className="print-only bg-white text-slate-900 rounded-lg p-6" style={{ display: 'none' }}>
              <h2 className="text-center font-bold text-lg uppercase mb-1">Relatório de Oportunidades — {cliente.name}</h2>
              {cliente.cnpj && <p className="text-center text-sm">CNPJ: {cliente.cnpj}</p>}
              <p className="text-center text-sm mb-4">Gerado em {new Date().toLocaleDateString('pt-BR')} · Modo {modo === 'consolidado' ? 'Consolidado' : 'Normal (por item)'}</p>

              <table className="w-full text-[12px] mb-4">
                <tbody>
                  <tr><td className="py-0.5 pr-2 font-semibold">Oportunidades enviadas:</td><td>{stats.totalEnviadas}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Participou:</td><td>{stats.totalParticipou}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Ganhou:</td><td>{stats.totalGanhou}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Perdeu:</td><td>{stats.totalPerdeu}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Em andamento:</td><td>{stats.totalEmAndamento}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Cancelada pelo órgão:</td><td>{stats.totalCanceladas}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Desistiu (cliente):</td><td>{stats.totalDesistiu}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Valor ganho (por item):</td><td>{formatBRL(stats.valorFechado)}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Valor deixado de ganhar (oportunidades perdidas):</td><td>{formatBRL(stats.valorPerdido)}</td></tr>
                </tbody>
              </table>

              {modo === 'consolidado' ? (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-400 text-left">
                      <th className="py-1.5 pr-2">Abertura</th>
                      <th className="py-1.5 pr-2">Órgão</th>
                      <th className="py-1.5 pr-2">Local</th>
                      <th className="py-1.5 pr-2">Objeto</th>
                      <th className="py-1.5 pr-2">Status</th>
                      <th className="py-1.5 pr-2 text-right">Vl. Licitado</th>
                      <th className="py-1.5 pr-2 text-right">Vl. Participado</th>
                      <th className="py-1.5 pr-2 text-right">Vl. Ganho</th>
                      <th className="py-1.5 text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doCliente.map((b) => {
                      const r = resumos.get(b.id)!
                      return (
                        <tr key={b.id} className="border-b border-slate-200">
                          <td className="py-1 pr-2">{new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                          <td className="py-1 pr-2">{b.orgao}</td>
                          <td className="py-1 pr-2">{[b.municipio, b.uf].filter(Boolean).join('/')}</td>
                          <td className="py-1 pr-2">{b.objeto}</td>
                          <td className="py-1 pr-2">{b.status}</td>
                          <td className="py-1 pr-2 text-right">{formatBRL(r.valorLicitado)}</td>
                          <td className="py-1 pr-2 text-right">{formatBRL(r.valorParticipado)}</td>
                          <td className="py-1 pr-2 text-right">{formatBRL(r.valorGanho)}</td>
                          <td className="py-1 text-right">{r.valorGanho > 0 ? formatBRL(r.diferenca) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                doCliente.map((b) => {
                  const itens = itensPorBidding.get(b.id) ?? []
                  return (
                    <div key={b.id} className="mb-4">
                      <p className="font-bold text-[12px] mb-1">{b.objeto} — {b.orgao} — {new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')} — {b.status}</p>
                      {itens.length === 0 ? (
                        <p className="text-[11px] italic">Sem itens detalhados cadastrados. Valor licitado: {formatBRL(b.valorLicitado)}</p>
                      ) : (
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-slate-400 text-left">
                              <th className="py-1 pr-2">Item</th>
                              <th className="py-1 pr-2">Descrição</th>
                              <th className="py-1 pr-2 text-right">Qtd</th>
                              <th className="py-1 pr-2 text-right">Vl. Unit. Licitado</th>
                              <th className="py-1 pr-2 text-right">Vl. Total Licitado</th>
                              <th className="py-1 pr-2 text-right">Vl. Unit. Ofertado</th>
                              <th className="py-1 pr-2">Participou</th>
                              <th className="py-1 text-right">Ganhou</th>
                            </tr>
                          </thead>
                          <tbody>
                            {itens.map((i) => (
                              <tr key={i.id} className="border-b border-slate-200">
                                <td className="py-1 pr-2">{i.numeroItem}</td>
                                <td className="py-1 pr-2">{i.descricao}</td>
                                <td className="py-1 pr-2 text-right">{i.quantidade}</td>
                                <td className="py-1 pr-2 text-right">{formatBRL(i.valorUnitarioLicitado)}</td>
                                <td className="py-1 pr-2 text-right">{formatBRL(i.quantidade * i.valorUnitarioLicitado)}</td>
                                <td className="py-1 pr-2 text-right">{i.valorUnitarioOfertado !== null ? formatBRL(i.valorUnitarioOfertado) : '—'}</td>
                                <td className="py-1 pr-2">{i.valorUnitarioOfertado !== null ? 'Sim' : 'Não'}</td>
                                <td className="py-1 text-right">{i.ganhou ? 'Sim' : 'Não'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TabelaConsolidada({ doCliente, resumos }: { doCliente: Bidding[]; resumos: Map<string, ResumoItensBidding> }) {
  return (
    <Card className="overflow-hidden screen-only">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base-800 text-left">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Abertura</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Órgão</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Objeto</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Vl. Licitado</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Vl. Participado</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Vl. Ganho</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {doCliente.map((b) => {
              const r = resumos.get(b.id)!
              return (
                <tr key={b.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                  <td className="px-4 py-2.5 text-base-300 text-[12px] whitespace-nowrap">{new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-2.5 text-base-300 text-[12px] max-w-[160px] truncate">{b.orgao}</td>
                  <td className="px-4 py-2.5 text-base-400 text-[12px] max-w-[220px] truncate">{b.objeto}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-2.5 text-right font-mono text-base-300 text-[12px]">{formatBRL(r.valorLicitado)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-base-300 text-[12px]">{formatBRL(r.valorParticipado)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-[12px]">
                    {r.valorGanho > 0 ? <span className="text-positive-400">{formatBRL(r.valorGanho)}</span> : <span className="text-base-600">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-[12px] bg-base-850/25">
                    {r.valorGanho > 0 ? <span className={r.diferenca >= 0 ? 'text-positive-400' : 'text-negative-400'}>{formatBRL(r.diferenca)}</span> : <span className="text-base-600">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-base-500 px-4 py-2 border-t border-base-800">
        Vl. Participado = soma dos itens em que houve oferta. Vl. Ganho = soma só dos itens vencidos. Diferença = valor licitado menos valor ganho, nos itens vencidos.
      </p>
    </Card>
  )
}

function TabelaNormal({ doCliente, itensPorBidding }: { doCliente: Bidding[]; itensPorBidding: Map<string, BiddingItem[]> }) {
  return (
    <div className="flex flex-col gap-3 screen-only">
      {doCliente.map((b) => {
        const itens = itensPorBidding.get(b.id) ?? []
        return (
          <Card key={b.id} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-base-800 bg-base-850/40">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-base-100 truncate">{b.objeto}</p>
                <p className="text-[11px] text-base-500 truncate">{b.orgao} · {[b.municipio, b.uf].filter(Boolean).join('/')} · {new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
              </div>
              <StatusBadge status={b.status} />
            </div>
            {itens.length === 0 ? (
              <p className="px-4 py-3 text-[12px] text-base-500 italic">Sem itens detalhados cadastrados nesta licitação. Valor licitado: {formatBRL(b.valorLicitado)}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-800 text-left">
                      <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-base-500">Item</th>
                      <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-base-500">Descrição</th>
                      <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Qtd</th>
                      <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Vl. Unit. Licitado</th>
                      <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Vl. Total Licitado</th>
                      <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Vl. Unit. Ofertado</th>
                      <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-base-500 text-center">Participou</th>
                      <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-base-500 text-center bg-base-850/40">Ganhou</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => {
                      const participou = i.valorUnitarioOfertado !== null
                      return (
                        <tr key={i.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                          <td className="px-4 py-2 text-base-300 text-[12px]">{i.numeroItem}</td>
                          <td className="px-4 py-2 text-base-300 text-[12px] max-w-[280px] truncate">{i.descricao}</td>
                          <td className="px-4 py-2 text-right font-mono text-base-300 text-[12px]">{i.quantidade}</td>
                          <td className="px-4 py-2 text-right font-mono text-base-300 text-[12px]">{formatBRL(i.valorUnitarioLicitado)}</td>
                          <td className="px-4 py-2 text-right font-mono text-base-300 text-[12px]">{formatBRL(i.quantidade * i.valorUnitarioLicitado)}</td>
                          <td className="px-4 py-2 text-right font-mono text-base-300 text-[12px]">{participou ? formatBRL(i.valorUnitarioOfertado!) : '—'}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${participou ? 'bg-accent-500/15 text-accent-400 border-accent-500/30' : 'bg-base-700/30 text-base-500 border-base-600/40'}`}>
                              {participou ? 'Sim' : 'Não'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center bg-base-850/25">
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${i.ganhou ? 'bg-positive-500/15 text-positive-400 border-positive-500/30' : 'bg-base-700/30 text-base-500 border-base-600/40'}`}>
                              {i.ganhou ? 'Sim' : 'Não'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// Oportunidades (editais enviados pra avaliação antes de virar licitação de
// verdade) somadas ao mesmo relatório — o cliente também precisa ver quantas
// foram enviadas, quantas aceitou/recusou e quantas ainda estão esperando
// resposta dele.
function OportunidadesResumoCliente({ clientId }: { clientId: string }) {
  const { opportunities } = useOpportunities()
  const doCliente = useMemo(() => opportunities.filter((o) => o.clientId === clientId), [opportunities, clientId])

  if (doCliente.length === 0) return null

  const aceitas = doCliente.filter((o) => o.resposta === 'aceita').length
  const recusadas = doCliente.filter((o) => o.resposta === 'recusada').length
  const aguardando = doCliente.filter((o) => o.resposta === 'pendente').length

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 screen-only">
        <CardEstatistica label="Oportunidades Identificadas" valor={doCliente.length} />
        <CardEstatistica label="Aceitas p/ Participar" valor={aceitas} cor="text-positive-400" />
        <CardEstatistica label="Recusadas pelo Cliente" valor={recusadas} cor="text-negative-400" />
        <CardEstatistica label="Aguardando Resposta" valor={aguardando} cor="text-warning-400" />
      </div>
      <div className="print-only" style={{ display: 'none' }}>
        <table className="w-full text-[12px] mb-4">
          <tbody>
            <tr><td className="py-0.5 pr-2 font-semibold">Oportunidades identificadas:</td><td>{doCliente.length}</td></tr>
            <tr><td className="py-0.5 pr-2 font-semibold">Aceitas p/ participar:</td><td>{aceitas}</td></tr>
            <tr><td className="py-0.5 pr-2 font-semibold">Recusadas pelo cliente:</td><td>{recusadas}</td></tr>
            <tr><td className="py-0.5 pr-2 font-semibold">Aguardando resposta:</td><td>{aguardando}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

function CardEstatistica({ label, valor, cor = 'text-base-100', mono = false }: { label: string; valor: string | number; cor?: string; mono?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">{label}</p>
      <p className={`text-lg font-extrabold ${mono ? 'font-mono' : ''} ${cor}`}>{valor}</p>
    </Card>
  )
}
