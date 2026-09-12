import { useMemo } from 'react'
import { Landmark } from 'lucide-react'
import { Card, EmptyState } from '../ui/Primitives'
import TopScrollTable from '../ui/TopScrollTable'
import { formatBRL } from '../../hooks/useAccountBalances'
import type { Client, Transaction } from '../../types/domain'

function diasEntre(dataInicial: string, dataFinal: string): number {
  return Math.floor(
    (new Date(dataFinal + 'T00:00:00').getTime() - new Date(dataInicial + 'T00:00:00').getTime())
    / (1000 * 60 * 60 * 24)
  )
}

interface ResumoRepasseCliente {
  clientId: string
  // Repasses já concluídos (comissão recebida) com as duas datas da
  // prefeitura preenchidas — é só sobre esses que dá pra calcular quantos
  // dias o cliente levou de fato.
  qtdConcluidos: number
  mediaDias: number | null
  // Comissões onde a prefeitura já liquidou (registrado) mas o cliente
  // ainda não repassou — o mesmo universo do alerta na Central de Prazos,
  // aqui somado por cliente pra mostrar quem tem risco em aberto agora.
  qtdEmAberto: number
  valorEmAberto: number
}

// Agrupa só o que tem dado suficiente pra dizer algo: comissão de empenho
// (empenhoId preenchido) com Liquidação na Prefeitura registrada. Sem essa
// data o cliente nunca entra nesta lista — não tem como medir repasse sem
// saber quando a prefeitura pagou ele.
function calcularResumosPorCliente(transactions: Transaction[]): Map<string, ResumoRepasseCliente> {
  const mapa = new Map<string, ResumoRepasseCliente>()

  const pegar = (clientId: string): ResumoRepasseCliente => {
    const existente = mapa.get(clientId)
    if (existente) return existente
    const novo: ResumoRepasseCliente = { clientId, qtdConcluidos: 0, mediaDias: null, qtdEmAberto: 0, valorEmAberto: 0 }
    mapa.set(clientId, novo)
    return novo
  }

  // Soma de dias por cliente, separada da média final — a média só é
  // calculada depois de somar tudo, pra não perder precisão arredondando a
  // cada lançamento novo do mesmo cliente.
  const somaDias = new Map<string, number>()

  for (const t of transactions) {
    if (t.type !== 'Receber' || !t.empenhoId || !t.clientId || !t.dataLiquidacaoPrefeitura) continue

    if (t.status === 'Pago' && t.paymentDate) {
      const resumo = pegar(t.clientId)
      resumo.qtdConcluidos += 1
      somaDias.set(t.clientId, (somaDias.get(t.clientId) ?? 0) + diasEntre(t.dataLiquidacaoPrefeitura, t.paymentDate))
    } else if (t.status !== 'Pago') {
      const resumo = pegar(t.clientId)
      resumo.qtdEmAberto += 1
      resumo.valorEmAberto += t.value
    }
  }

  for (const resumo of mapa.values()) {
    if (resumo.qtdConcluidos > 0) {
      resumo.mediaDias = Math.round((somaDias.get(resumo.clientId) ?? 0) / resumo.qtdConcluidos)
    }
  }

  return mapa
}

function corMediaDias(dias: number): string {
  if (dias > 15) return 'text-negative-400'
  if (dias > 5) return 'text-warning-400'
  return 'text-positive-400'
}

// Relatório separado dos demais (Faturamento/Despesas) porque não é sobre
// UM lançamento nem sobre UMA licitação — é um cruzamento entre clientes,
// pra responder "quem demora a repassar a comissão depois que a
// prefeitura já pagou ele" (ver TransactionFormModal.tsx, campos Vencimento
// na Prefeitura / Liquidação na Prefeitura).
export default function RelatorioRepassePorCliente({ clients, transactions }: { clients: Client[]; transactions: Transaction[] }) {
  const resumos = useMemo(() => calcularResumosPorCliente(transactions), [transactions])

  const linhas = useMemo(() => {
    return Array.from(resumos.values())
      .map((r) => ({ ...r, cliente: clients.find((c) => c.id === r.clientId) ?? null }))
      .filter((r) => r.cliente)
      // Pior primeiro: quem não tem nenhum repasse concluído ainda (só em
      // aberto) fica no topo — é o caso mais urgente de acompanhar, ainda
      // sem histórico nenhum de quanto tempo costuma levar.
      .sort((a, b) => (b.mediaDias ?? Infinity) - (a.mediaDias ?? Infinity))
  }, [resumos, clients])

  if (linhas.length === 0) {
    return (
      <Card className="screen-only">
        <EmptyState
          icon={Landmark}
          title="Nenhum dado de repasse ainda"
          description="Preencha a Liquidação na Prefeitura ao dar baixa numa comissão de empenho — assim que houver pelo menos um repasse registrado, o ranking aparece aqui."
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-base-500 screen-only">
        Média de dias entre a prefeitura liquidar (pagar o cliente) e o cliente de fato repassar a comissão — só entram clientes com pelo menos uma comissão de empenho com Liquidação na Prefeitura preenchida.
      </p>
      <Card className="overflow-hidden screen-only">
        <TopScrollTable>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-800 text-left">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cliente</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Repasses Concluídos</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Média de Dias</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Em Aberto Agora</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.clientId} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                  <td className="px-4 py-2.5 font-semibold text-base-100 text-[13px]">{r.cliente!.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-base-300 text-[12px]">{r.qtdConcluidos}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-[13px] bg-base-850/25">
                    {r.mediaDias !== null ? <span className={corMediaDias(r.mediaDias)}>{r.mediaDias} dia(s)</span> : <span className="text-base-600">Sem histórico</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[12px]">
                    {r.qtdEmAberto > 0 ? (
                      <span className="font-mono font-bold text-warning-400">{r.qtdEmAberto} · {formatBRL(r.valorEmAberto)}</span>
                    ) : (
                      <span className="text-base-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TopScrollTable>
        <p className="text-[11px] text-base-500 px-4 py-2 border-t border-base-800">
          Média de Dias = tempo entre Liquidação na Prefeitura e a Data efetiva do recebimento, só nas comissões já recebidas. Em Aberto Agora = comissões com prefeitura já liquidada, mas ainda não recebidas.
        </p>
      </Card>
    </div>
  )
}
