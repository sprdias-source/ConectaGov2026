import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/**
 * Seletor de mês em faixa horizontal, no mesmo espírito visual da grade
 * de competência usada no Fluxo de Caixa — mas em 1 linha só, ocupando
 * bem menos altura, e com troca de mês em 1 clique direto (sem precisar
 * abrir um dropdown). O ano fica como um controle compacto ao lado.
 */
export default function MonthHorizontalPicker({
  month, year, onChange,
}: { month: number; year: number; onChange: (month: number, year: number) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = new Date()

  return (
    <div className="flex items-center gap-2 bg-base-900/60 border border-base-700/50 rounded-xl p-1.5">
      <div className="flex items-center gap-0.5 shrink-0 pr-1.5 border-r border-base-800">
        <button
          type="button"
          onClick={() => onChange(month, year - 1)}
          className="p-1 rounded-md text-base-500 hover:text-base-200 hover:bg-base-850 transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[13px] font-bold text-base-200 font-mono w-11 text-center">{year}</span>
        <button
          type="button"
          onClick={() => onChange(month, year + 1)}
          className="p-1 rounded-md text-base-500 hover:text-base-200 hover:bg-base-850 transition"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
        {MONTHS_SHORT.map((m, idx) => {
          const isSelected = idx === month
          const isCurrent = idx === now.getMonth() && year === now.getFullYear()
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(idx, year)}
              className={`px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition shrink-0 border ${
                isSelected
                  ? 'bg-accent-500 text-base-950 border-accent-500'
                  : isCurrent
                    ? 'bg-base-850 text-accent-300 border-accent-500/40'
                    : 'bg-base-850 text-base-400 border-base-700 hover:border-base-600 hover:text-base-200'
              }`}
            >
              {m}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => onChange(now.getMonth(), now.getFullYear())}
        className="text-[11px] font-semibold text-accent-300 hover:text-accent-200 transition shrink-0 px-1.5 whitespace-nowrap"
      >
        Hoje
      </button>
    </div>
  )
}
