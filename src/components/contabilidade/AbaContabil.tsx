import { useMemo, useState } from 'react'
import { Printer, Pencil } from 'lucide-react'
import { Card } from '../ui/Primitives'
import { Select, Input, Button } from '../ui/FormControls'
import { formatBRL } from '../../hooks/useAccountBalances'
import { useTransactions } from '../../hooks/useTransactions'
import { useCategories } from '../../hooks/useCategories'
import { useGruposContabeis } from '../../hooks/useGruposContabeis'
import { useFinancialAccounts } from '../../hooks/useFinancialAccounts'
import { useAccountBalances } from '../../hooks/useAccountBalances'
import { useEmpresaPerfil } from '../../hooks/useEmpresaPerfil'
import { useSimplesNacional } from '../../hooks/useSimplesNacional'
import { todayLocalISO } from '../../lib/dateUtils'
import type { GrupoContabil } from '../../types/domain'

type LinhaCategoria = { nome: string; valor: number }
type GrupoDre = { grupo: GrupoContabil; total: number; categorias: LinhaCategoria[] }

const fmtParen = (valor: number, negativo: boolean) => (negativo ? `(${formatBRL(Math.abs(valor))})` : formatBRL(valor))
const fmtPct = (valor: number, base: number, negativo: boolean) => {
  if (base <= 0) return '—'
  const pct = (Math.abs(valor) / base) * 100
  return negativo ? `(${pct.toFixed(1)}%)` : `${pct.toFixed(1)}%`
}

export default function AbaContabil() {
  const { transactions } = useTransactions()
  const { allCategories } = useCategories()
  const { grupos } = useGruposContabeis()
  const { accounts } = useFinancialAccounts()
  const { patrimonioTotal } = useAccountBalances(accounts, transactions)
  const { perfil, salvarPerfil } = useEmpresaPerfil()
  const { conferenciaDas } = useSimplesNacional()

  const currentYear = new Date().getFullYear()
  const [dreYear, setDreYear] = useState(currentYear)
  const [comparar, setComparar] = useState(false)
  const [editandoPerfil, setEditandoPerfil] = useState(false)
  const [formPerfil, setFormPerfil] = useState({
    razaoSocial: perfil?.razaoSocial ?? '',
    cnpj: perfil?.cnpj ?? '',
    endereco: perfil?.endereco ?? '',
    capitalSocial: perfil?.capitalSocial ?? 0,
  })

  const availableYears = useMemo(() => {
    const years = new Set(
      transactions.filter((t) => t.status === 'Pago' && t.paymentDate).map((t) => Number(t.paymentDate!.slice(0, 4)))
    )
    years.add(currentYear)
    return Array.from(years).sort((a, b) => b - a)
  }, [transactions, currentYear])

  // Monta o DRE de um ano agrupado pelos grupos contábeis da Fase 5 — só os
  // grupos com entraDre=true entram na conta (Distribuição de Lucros e
  // Retirada de Sócio, por exemplo, ficam de fora: são movimentação de
  // patrimônio líquido, não resultado do exercício). Regime de caixa
  // (data de pagamento), mesmo critério que a página já usava antes —
  // profissionalizar o visual não muda a base de apuração.
  const montarDreAno = (ano: number) => {
    const pagas = transactions.filter((t) => t.status === 'Pago' && t.paymentDate?.startsWith(String(ano)))
    const grupoIdPorCategoria = new Map(allCategories.map((c) => [`${c.type}::${c.name}`, c.grupoId]))
    const totalPorChave = new Map<string, number>()
    for (const t of pagas) {
      const grupoId = grupoIdPorCategoria.get(`${t.type}::${t.category}`)
      if (!grupoId) continue
      const chave = `${grupoId}::${t.category}`
      totalPorChave.set(chave, (totalPorChave.get(chave) ?? 0) + t.value)
    }
    const montarLado = (tipo: 'Receber' | 'Pagar'): GrupoDre[] =>
      grupos
        .filter((g) => g.type === tipo && g.entraDre)
        .sort((a, b) => a.ordem - b.ordem)
        .map((g) => {
          const categorias = Array.from(totalPorChave.entries())
            .filter(([chave]) => chave.startsWith(`${g.id}::`))
            .map(([chave, valor]) => ({ nome: chave.split('::')[1], valor }))
            .sort((a, b) => b.valor - a.valor)
          return { grupo: g, total: categorias.reduce((s, c) => s + c.valor, 0), categorias }
        })
        .filter((g) => g.categorias.length > 0)

    const receita = montarLado('Receber')
    const despesa = montarLado('Pagar')
    const receitaTotal = receita.reduce((s, g) => s + g.total, 0)
    const despesaTotal = despesa.reduce((s, g) => s + g.total, 0)
    return { receita, despesa, receitaTotal, despesaTotal, resultado: receitaTotal - despesaTotal }
  }

  const dre = useMemo(
    () => montarDreAno(dreYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, allCategories, grupos, dreYear]
  )
  const temDadosAnoAnterior = useMemo(
    () => transactions.some((t) => t.status === 'Pago' && t.paymentDate?.startsWith(String(dreYear - 1))),
    [transactions, dreYear]
  )
  const dreAnterior = useMemo(
    () => (comparar && temDadosAnoAnterior ? montarDreAno(dreYear - 1) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comparar, temDadosAnoAnterior, transactions, allCategories, grupos, dreYear]
  )

  // --- Balanço Patrimonial simplificado -------------------------------------
  const contasAReceber = transactions.filter((t) => t.type === 'Receber' && t.status !== 'Pago').reduce((s, t) => s + t.value, 0)
  const contasAPagar = transactions.filter((t) => t.type === 'Pagar' && t.status !== 'Pago').reduce((s, t) => s + t.value, 0)
  const competenciaAtual = todayLocalISO().slice(0, 7)
  const impostosARecolher = conferenciaDas(competenciaAtual)?.dasEstimado ?? 0

  const ativoTotal = patrimonioTotal + contasAReceber
  const passivoTotal = contasAPagar + impostosARecolher
  const capitalSocial = perfil?.capitalSocial ?? 0
  const lucrosAcumulados = ativoTotal - passivoTotal - capitalSocial

  const salvarFormPerfil = () => {
    salvarPerfil.mutate(formPerfil, { onSuccess: () => setEditandoPerfil(false) })
  }

  return (
    <div className="px-6 mt-4 pb-10">
      <Card className="p-4 mb-4 screen-only">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-base-100">Demonstração do Resultado do Exercício</h3>
            <p className="text-[12px] text-base-500">Regime de caixa · agrupado pelo plano de contas</p>
          </div>
          <div className="flex items-center gap-2">
            {temDadosAnoAnterior && (
              <label className="flex items-center gap-1.5 text-[11.5px] text-base-400">
                <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} className="accent-accent-500" />
                Comparar com exercício anterior
              </label>
            )}
            <Select value={dreYear} onChange={(e) => setDreYear(parseInt(e.target.value))} className="w-32 !py-1.5 text-[12px]">
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir / Exportar PDF
            </button>
          </div>
        </div>
      </Card>

      {(!perfil?.razaoSocial || editandoPerfil) && (
        <Card className="p-4 mb-4 screen-only">
          <h3 className="text-sm font-bold text-base-100 mb-1">Dados da Empresa</h3>
          <p className="text-[12px] text-base-500 mb-3">Aparecem no cabeçalho do DRE — preencha uma vez.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="Razão Social" value={formPerfil.razaoSocial} onChange={(e) => setFormPerfil({ ...formPerfil, razaoSocial: e.target.value })} />
            <Input placeholder="CNPJ" value={formPerfil.cnpj} onChange={(e) => setFormPerfil({ ...formPerfil, cnpj: e.target.value })} />
            <Input placeholder="Endereço" value={formPerfil.endereco} onChange={(e) => setFormPerfil({ ...formPerfil, endereco: e.target.value })} />
            <Input
              type="number" step="0.01" placeholder="Capital Social (R$)"
              value={formPerfil.capitalSocial || ''}
              onChange={(e) => setFormPerfil({ ...formPerfil, capitalSocial: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="flex justify-end gap-2 mt-3">
            {perfil?.razaoSocial && <Button variant="secondary" onClick={() => setEditandoPerfil(false)}>Cancelar</Button>}
            <Button onClick={salvarFormPerfil} disabled={salvarPerfil.isPending}>{salvarPerfil.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </Card>
      )}

      {/* Demonstração profissional — visível na tela E usada como conteúdo
          de impressão (.print-only sem display:none inline, ao contrário
          do padrão antigo, porque agora a própria tela já tem a cara de
          documento formal, então não precisamos de duas versões). */}
      <div className="max-w-3xl mx-auto">
        <div className="print-only font-serif bg-white text-[#1c1c1a] rounded-sm shadow-lg border-t-4 border-accent-500 px-10 py-12">
          <div className="text-center mb-1 relative">
            {perfil?.razaoSocial && (
              <button onClick={() => setEditandoPerfil(true)} className="screen-only absolute right-0 top-0 p-1 text-slate-300 hover:text-accent-500">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            <p className="text-lg font-bold tracking-wide">{perfil?.razaoSocial || 'Complete os dados da empresa acima'}</p>
            <p className="text-[11.5px] text-slate-500 font-sans mt-0.5">
              {perfil?.cnpj ? `CNPJ ${perfil.cnpj}` : ''}{perfil?.cnpj && perfil?.endereco ? ' · ' : ''}{perfil?.endereco ?? ''}
            </p>
          </div>

          <div className="text-center my-6 py-3 border-t border-b border-slate-300">
            <p className="text-[13px] font-bold uppercase tracking-[0.09em]">Demonstração do Resultado do Exercício</p>
            <p className="text-[11px] text-slate-500 font-sans mt-1">
              Exercício findo em 31 de dezembro de {dreYear} · Valores expressos em Reais (R$)
            </p>
          </div>

          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b-2 border-[#1c1c1a]">
                <th className="text-left font-sans text-[9.5px] uppercase tracking-wider text-slate-500 font-bold pb-2">Descrição</th>
                <th className="text-right font-sans text-[9.5px] uppercase tracking-wider text-slate-500 font-bold pb-2">{dreYear}</th>
                <th className="text-right font-sans text-[9.5px] uppercase tracking-wider text-slate-500 font-bold pb-2 w-14">AV%</th>
                {dreAnterior && <th className="text-right font-sans text-[9.5px] uppercase tracking-wider text-slate-500 font-bold pb-2">{dreYear - 1}</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pt-4 font-bold uppercase text-[11.5px] tracking-wide" colSpan={dreAnterior ? 4 : 3}>Receita Operacional Bruta</td>
              </tr>
              {dre.receita.flatMap((g) => g.categorias.map((c) => (
                <tr key={`${g.grupo.id}-${c.nome}`}>
                  <td className="py-1 pl-5 text-slate-600 text-[12.5px]">{c.nome}</td>
                  <td className="py-1 text-right tabular-nums">{formatBRL(c.valor)}</td>
                  <td className="py-1 text-right tabular-nums text-[11.5px] text-slate-500">{fmtPct(c.valor, dre.receitaTotal, false)}</td>
                  {dreAnterior && <td className="py-1 text-right tabular-nums text-slate-500">{formatBRL(dreAnterior.receita.flatMap((gg) => gg.categorias).find((cc) => cc.nome === c.nome)?.valor ?? 0)}</td>}
                </tr>
              )))}

              <tr className="border-t border-slate-300">
                <td className="py-2 font-bold text-[12.5px]">Receita Operacional Líquida</td>
                <td className="py-2 text-right tabular-nums font-bold">{formatBRL(dre.receitaTotal)}</td>
                <td className="py-2 text-right tabular-nums font-bold text-[11.5px]">100,0%</td>
                {dreAnterior && <td className="py-2 text-right tabular-nums font-bold">{formatBRL(dreAnterior.receitaTotal)}</td>}
              </tr>

              <tr>
                <td className="pt-5 font-bold uppercase text-[11.5px] tracking-wide" colSpan={dreAnterior ? 4 : 3}>(–) Despesas Operacionais</td>
              </tr>
              {dre.despesa.flatMap((g) => g.categorias.map((c) => (
                <tr key={`${g.grupo.id}-${c.nome}`}>
                  <td className="py-1 pl-5 text-slate-600 text-[12.5px]">{c.nome}</td>
                  <td className="py-1 text-right tabular-nums text-[#7a2d2d]">{fmtParen(c.valor, true)}</td>
                  <td className="py-1 text-right tabular-nums text-[11.5px] text-slate-500">{fmtPct(c.valor, dre.receitaTotal, true)}</td>
                  {dreAnterior && <td className="py-1 text-right tabular-nums text-slate-500">{fmtParen(dreAnterior.despesa.flatMap((gg) => gg.categorias).find((cc) => cc.nome === c.nome)?.valor ?? 0, true)}</td>}
                </tr>
              )))}

              <tr className="border-t border-slate-300">
                <td className="py-2 font-bold text-[12.5px]">Total das Despesas Operacionais</td>
                <td className="py-2 text-right tabular-nums font-bold text-[#7a2d2d]">{fmtParen(dre.despesaTotal, true)}</td>
                <td className="py-2 text-right tabular-nums font-bold text-[11.5px]">{fmtPct(dre.despesaTotal, dre.receitaTotal, true)}</td>
                {dreAnterior && <td className="py-2 text-right tabular-nums font-bold">{fmtParen(dreAnterior.despesaTotal, true)}</td>}
              </tr>

              <tr className="border-t-2 border-[#1c1c1a]" style={{ borderBottom: '4px double #1c1c1a' }}>
                <td className="py-3 font-bold uppercase tracking-wide text-[14px]">Resultado Líquido do Exercício</td>
                <td className="py-3 text-right tabular-nums font-bold text-[15px] text-accent-500">{formatBRL(dre.resultado)}</td>
                <td className="py-3 text-right tabular-nums font-bold text-[12px]">{fmtPct(dre.resultado, dre.receitaTotal, false)}</td>
                {dreAnterior && <td className="py-3 text-right tabular-nums font-bold text-[15px]">{formatBRL(dreAnterior.resultado)}</td>}
              </tr>
            </tbody>
          </table>

          <div className="flex justify-end gap-8 mt-6 font-sans">
            <div className="text-right">
              <p className="text-[9.5px] uppercase tracking-wider text-slate-500 font-bold">Margem Líquida</p>
              <p className="text-[15px] font-bold text-accent-500 tabular-nums">{fmtPct(dre.resultado, dre.receitaTotal, false)}</p>
            </div>
          </div>

          <div className="flex justify-between items-end mt-10 font-sans">
            <div className="border-t border-[#1c1c1a] w-56 pt-1.5 text-[11px]">Sócio-Administrador</div>
            <p className="text-[11px] text-slate-500">Gerado em {new Date().toLocaleDateString('pt-BR')}</p>
          </div>

          <p className="text-[10px] text-slate-500 mt-8 pt-3 border-t border-slate-300 font-sans leading-relaxed">
            Demonstrativo gerado para fins gerenciais e de conferência interna, com base nos lançamentos registrados no sistema.
            A apuração fiscal oficial (DAS, PGDAS-D e demais obrigações acessórias) permanece sob responsabilidade da contabilidade externa.
            Documento gerado automaticamente pelo sistema ConectaGov.
          </p>
        </div>
      </div>

      {/* --- Balanço Patrimonial ------------------------------------------- */}
      <Card className="p-5 mt-4 max-w-3xl mx-auto screen-only">
        <h3 className="text-sm font-bold text-base-100 mb-1">Balanço Patrimonial</h3>
        <p className="text-[12px] text-base-500 mb-4">
          Simplificado — alimentado pelas mesmas contas bancárias e lançamentos já usados no resto do sistema, mais o DAS estimado do mês vigente.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-[10.5px] uppercase tracking-wider text-base-500 font-bold border-b border-base-800 pb-1.5 mb-2">Ativo</h4>
            <div className="flex justify-between text-[13px] py-1"><span className="text-base-400">Caixa e Bancos</span><span className="font-mono text-base-200">{formatBRL(patrimonioTotal)}</span></div>
            <div className="flex justify-between text-[13px] py-1"><span className="text-base-400">Contas a Receber</span><span className="font-mono text-base-200">{formatBRL(contasAReceber)}</span></div>
            <div className="flex justify-between text-[13px] py-2 mt-1 border-t border-base-800 font-bold"><span className="text-base-200">Total do Ativo</span><span className="font-mono text-base-100">{formatBRL(ativoTotal)}</span></div>
          </div>
          <div>
            <h4 className="text-[10.5px] uppercase tracking-wider text-base-500 font-bold border-b border-base-800 pb-1.5 mb-2">Passivo + Patrimônio Líquido</h4>
            <div className="flex justify-between text-[13px] py-1"><span className="text-base-400">Contas a Pagar</span><span className="font-mono text-base-200">{formatBRL(contasAPagar)}</span></div>
            <div className="flex justify-between text-[13px] py-1"><span className="text-base-400">Impostos a Recolher (DAS do mês)</span><span className="font-mono text-base-200">{formatBRL(impostosARecolher)}</span></div>
            <div className="flex justify-between text-[13px] py-1"><span className="text-base-400">Capital Social</span><span className="font-mono text-base-200">{formatBRL(capitalSocial)}</span></div>
            <div className="flex justify-between text-[13px] py-1"><span className="text-base-400">Lucros Acumulados <span className="text-[10px] text-base-500">(calculado)</span></span><span className="font-mono text-base-200">{formatBRL(lucrosAcumulados)}</span></div>
            <div className="flex justify-between text-[13px] py-2 mt-1 border-t border-base-800 font-bold"><span className="text-base-200">Total</span><span className="font-mono text-base-100">{formatBRL(passivoTotal + capitalSocial + lucrosAcumulados)}</span></div>
          </div>
        </div>
        {!perfil?.capitalSocial && (
          <p className="text-[11px] text-warning-400 mt-3">
            Capital Social não preenchido — complete nos "Dados da Empresa" acima pro Balanço refletir o valor real do contrato social.
          </p>
        )}
      </Card>
    </div>
  )
}
