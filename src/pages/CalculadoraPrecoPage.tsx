import { useState, useMemo } from 'react'
import { Calculator, Info, Search, History } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { Input } from '../components/ui/FormControls'
import { formatBRL } from '../hooks/useAccountBalances'
import { useSearchBiddingItems } from '../hooks/useBiddingItems'

// Fórmula do "BDI sobre preço de venda" (markup divisor) — padrão usado em
// licitações de obras/serviços de engenharia no Brasil: em vez de aplicar
// o percentual sobre o custo (o que dá um preço final MENOR que o real
// necessário), divide o custo pelo que sobra depois de tirar todos os
// percentuais — assim o BDI/impostos/margem batem exatamente sobre o
// preço de venda final, não sobre o custo.
//   Preço de Venda = Custo Direto / (1 − (BDI% + Impostos% + Margem%) / 100)
function calcularPrecoVenda(custoDireto: number, bdiPct: number, impostosPct: number, margemPct: number) {
  const percentualTotal = (bdiPct + impostosPct + margemPct) / 100
  if (percentualTotal >= 1) return null // percentuais somam 100% ou mais — inviável
  const precoVenda = custoDireto / (1 - percentualTotal)
  return {
    precoVenda,
    valorBdi: precoVenda * (bdiPct / 100),
    valorImpostos: precoVenda * (impostosPct / 100),
    valorMargem: precoVenda * (margemPct / 100),
  }
}

export default function CalculadoraPrecoPage() {
  const [custoDireto, setCustoDireto] = useState('')
  const [bdiPct, setBdiPct] = useState('20')
  const [impostosPct, setImpostosPct] = useState('6')
  const [margemPct, setMargemPct] = useState('8')
  const [quantidade, setQuantidade] = useState('1')

  const [buscaItem, setBuscaItem] = useState('')
  const { resultados: historicoItens, isLoading: buscandoHistorico } = useSearchBiddingItems(buscaItem)

  const resultado = useMemo(() => {
    const custo = parseFloat(custoDireto)
    if (!custo || custo <= 0) return null
    return calcularPrecoVenda(custo, parseFloat(bdiPct) || 0, parseFloat(impostosPct) || 0, parseFloat(margemPct) || 0)
  }, [custoDireto, bdiPct, impostosPct, margemPct])

  const qtd = parseFloat(quantidade) || 1

  return (
    <div className="pb-10">
      <PageHeader
        title="Calculadora de Formação de Preço"
        subtitle="BDI, impostos e margem — do custo direto ao preço de venda, com a mesma fórmula usada em licitações de obras e serviços"
        icon={Calculator}
      />

      <div className="px-6 mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-[12px] font-bold text-base-200 mb-3">Dados do Item</p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Custo Direto Unitário (R$)</label>
              <Input type="number" step="0.01" value={custoDireto} onChange={(e) => setCustoDireto(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Quantidade (pra ver o total)</label>
              <Input type="number" step="1" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">BDI (%)</label>
                <Input type="number" step="0.01" value={bdiPct} onChange={(e) => setBdiPct(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Impostos (%)</label>
                <Input type="number" step="0.01" value={impostosPct} onChange={(e) => setImpostosPct(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Margem (%)</label>
                <Input type="number" step="0.01" value={margemPct} onChange={(e) => setMargemPct(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="mt-4 bg-base-850/60 border border-base-700/50 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-base-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-base-500">
              Fórmula: Preço de Venda = Custo Direto ÷ (1 − (BDI% + Impostos% + Margem%) ÷ 100). Ajuste os percentuais conforme o regime tributário do cliente (Simples Nacional, Lucro Presumido etc.) — essa calculadora não sabe qual é o regime, só faz a conta.
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-[12px] font-bold text-base-200 mb-3">Resultado</p>
          {!resultado ? (
            <p className="text-[13px] text-base-500 italic py-8 text-center">
              {custoDireto && (parseFloat(bdiPct) || 0) + (parseFloat(impostosPct) || 0) + (parseFloat(margemPct) || 0) >= 100
                ? 'BDI + Impostos + Margem somam 100% ou mais — ajuste os percentuais, essa conta não fecha.'
                : 'Preencha o custo direto pra ver o preço de venda calculado.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="bg-accent-500/10 border border-accent-500/25 rounded-xl p-4 text-center">
                <p className="text-[10px] uppercase tracking-wider text-accent-400 font-bold mb-1">Preço de Venda Unitário</p>
                <p className="text-2xl font-extrabold font-mono text-accent-300">{formatBRL(resultado.precoVenda)}</p>
              </div>
              {qtd > 1 && (
                <div className="bg-positive-500/10 border border-positive-500/25 rounded-xl p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-positive-400 font-bold mb-1">Total ({qtd}x)</p>
                  <p className="text-xl font-extrabold font-mono text-positive-400">{formatBRL(resultado.precoVenda * qtd)}</p>
                </div>
              )}
              <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex justify-between text-[12px] py-1.5 border-b border-base-800">
                  <span className="text-base-400">Custo Direto</span>
                  <span className="font-mono text-base-300">{formatBRL(parseFloat(custoDireto))}</span>
                </div>
                <div className="flex justify-between text-[12px] py-1.5 border-b border-base-800">
                  <span className="text-base-400">BDI ({bdiPct}%)</span>
                  <span className="font-mono text-base-300">{formatBRL(resultado.valorBdi)}</span>
                </div>
                <div className="flex justify-between text-[12px] py-1.5 border-b border-base-800">
                  <span className="text-base-400">Impostos ({impostosPct}%)</span>
                  <span className="font-mono text-base-300">{formatBRL(resultado.valorImpostos)}</span>
                </div>
                <div className="flex justify-between text-[12px] py-1.5">
                  <span className="text-base-400">Margem de Lucro ({margemPct}%)</span>
                  <span className="font-mono text-positive-400 font-semibold">{formatBRL(resultado.valorMargem)}</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="px-6 mt-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <History className="w-4 h-4 text-accent-400" />
            <p className="text-[12px] font-bold text-base-200">Histórico de Preços por Item</p>
          </div>
          <p className="text-[12px] text-base-500 mb-3">
            Pesquise por itens parecidos já cotados em licitações anteriores — pra qual órgão/cliente foi, e por qual valor.
          </p>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-500" />
            <input
              value={buscaItem}
              onChange={(e) => setBuscaItem(e.target.value)}
              placeholder="Ex: Notebook, Ar-condicionado, Combustível... (mín. 3 letras)"
              className="w-full bg-base-850 border border-base-700 rounded-lg pl-9 pr-3 py-2 text-[13px] text-base-100 placeholder:text-base-500 outline-none focus:border-accent-400"
            />
          </div>

          {buscaItem.trim().length > 0 && buscaItem.trim().length < 3 ? (
            <p className="text-[12px] text-base-500 italic py-4 text-center">Digite pelo menos 3 letras pra buscar.</p>
          ) : buscandoHistorico ? (
            <div className="p-6 text-center text-base-500 text-sm">Buscando...</div>
          ) : buscaItem.trim().length >= 3 && historicoItens.length === 0 ? (
            <p className="text-[12px] text-base-500 italic py-4 text-center">Nenhum item parecido encontrado no histórico.</p>
          ) : historicoItens.length > 0 ? (
            <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
              {historicoItens.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-base-200 truncate">{i.descricao}</p>
                    <p className="text-[11px] text-base-500 truncate">{i.clientName} — {i.biddingOrgao} · {i.biddingObjeto.slice(0, 50)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-[13px] text-accent-300">{formatBRL(i.valorUnitarioLicitado)}</p>
                    {i.valorUnitarioOfertado && (
                      <p className="font-mono text-[11px] text-positive-400">ofertado: {formatBRL(i.valorUnitarioOfertado)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  )
}
