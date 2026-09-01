import { useMemo } from 'react'
import { Users, Percent } from 'lucide-react'
import { Card } from '../ui/Primitives'
import { formatBRL } from '../../hooks/useAccountBalances'
import { useEmployees } from '../../hooks/useEmployees'
import { useTransactions } from '../../hooks/useTransactions'
import { useSimplesNacional } from '../../hooks/useSimplesNacional'
import { useRegimeTributario } from '../../hooks/useRegimeTributario'
import { todayLocalISO } from '../../lib/dateUtils'

const CATEGORIAS_FOLHA = ['Folha de Pagamento', 'Pró-Labore']

export default function AbaPessoal() {
  const { employees } = useEmployees()
  const { transactions } = useTransactions()
  const { calcularRbt12 } = useSimplesNacional()
  const { vigente } = useRegimeTributario()

  const activeEmployees = employees.filter((e) => e.isActive)
  const competenciaAtual = todayLocalISO().slice(0, 7)

  const folhaMesAtual = useMemo(
    () => transactions
      .filter((t) => t.type === 'Pagar' && CATEGORIAS_FOLHA.includes(t.category) && t.dueDate.slice(0, 7) === competenciaAtual)
      .reduce((s, t) => s + t.value, 0),
    [transactions, competenciaAtual]
  )

  // Fator R: (folha + pró-labore dos últimos 12 meses) ÷ RBT12 — define se o
  // anexo correto do Simples Nacional é III (≥28%) ou V (<28%). Só faz
  // sentido enquanto o regime vigente for Simples Nacional.
  const { folha12Meses, rbt12, fatorR } = useMemo(() => {
    const [ano, mes] = competenciaAtual.split('-').map(Number)
    const inicio = new Date(ano, mes - 12, 1)
    const fim = new Date(ano, mes - 1, 1)
    const folha = transactions
      .filter((t) => t.type === 'Pagar' && CATEGORIAS_FOLHA.includes(t.category))
      .filter((t) => {
        const d = new Date(t.dueDate + 'T12:00:00')
        const dMes = new Date(d.getFullYear(), d.getMonth(), 1)
        return dMes >= inicio && dMes <= fim
      })
      .reduce((s, t) => s + t.value, 0)
    const rbt = calcularRbt12(competenciaAtual)
    return { folha12Meses: folha, rbt12: rbt, fatorR: rbt > 0 ? (folha / rbt) * 100 : 0 }
  }, [transactions, competenciaAtual, calcularRbt12])

  return (
    <div className="px-6 mt-4 pb-10 flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4 text-accent-400" />
          <h3 className="text-sm font-bold text-base-100">Folha do Mês</h3>
        </div>
        <p className="text-[12px] text-base-500 mb-3">Vem da tela Funcionários — sem cadastro duplicado aqui.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-base-900 border border-base-800 rounded-lg p-3">
            <p className="text-[10px] uppercase text-base-500 font-bold">Colaboradores Ativos</p>
            <p className="text-[16px] font-extrabold text-base-100">{activeEmployees.length}</p>
          </div>
          <div className="bg-base-900 border border-base-800 rounded-lg p-3">
            <p className="text-[10px] uppercase text-base-500 font-bold">Folha + Pró-labore ({competenciaAtual})</p>
            <p className="text-[16px] font-extrabold font-mono text-base-100">{formatBRL(folhaMesAtual)}</p>
          </div>
        </div>
      </Card>

      {vigente?.regime === 'simples_nacional' && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-1">
            <Percent className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-base-100">Fator R</h3>
          </div>
          <p className="text-[12px] text-base-500 mb-3">
            (Folha + Pró-labore dos últimos 12 meses) ÷ RBT12 — define se o anexo correto é III (≥ 28%) ou V (&lt; 28%).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-base-900 border border-base-800 rounded-lg p-3">
              <p className="text-[10px] uppercase text-base-500 font-bold">Folha + Pró-labore (12m)</p>
              <p className="text-[15px] font-extrabold font-mono text-base-100">{formatBRL(folha12Meses)}</p>
            </div>
            <div className="bg-base-900 border border-base-800 rounded-lg p-3">
              <p className="text-[10px] uppercase text-base-500 font-bold">RBT12</p>
              <p className="text-[15px] font-extrabold font-mono text-base-100">{formatBRL(rbt12)}</p>
            </div>
            <div className="bg-base-900 border border-base-800 rounded-lg p-3">
              <p className="text-[10px] uppercase text-base-500 font-bold">Fator R</p>
              <p className={`text-[15px] font-extrabold font-mono ${fatorR >= 28 ? 'text-positive-400' : 'text-negative-400'}`}>
                {rbt12 > 0 ? `${fatorR.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
          <div className="relative h-2.5 bg-base-800 rounded-full mt-4 overflow-hidden">
            <div className={`h-full rounded-full ${fatorR >= 28 ? 'bg-positive-500' : 'bg-negative-500'}`} style={{ width: `${Math.min(100, fatorR)}%` }} />
            <div className="absolute top-[-3px] w-0.5 h-4 bg-base-400" style={{ left: '28%' }} />
          </div>
          <p className="text-[10.5px] text-base-500 mt-3">
            {rbt12 <= 0
              ? 'Sem RBT12 suficiente ainda pra calcular.'
              : fatorR >= 28
                ? 'Acima do limite — Anexo III confirmado.'
                : 'Abaixo de 28% — o anexo correto pode ser o V, não o III. Confirme com o contador antes de trocar a vigência.'}
          </p>
        </Card>
      )}
    </div>
  )
}
