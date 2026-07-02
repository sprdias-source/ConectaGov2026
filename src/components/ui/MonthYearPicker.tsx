import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTHS_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function MonthYearPicker({
  month, year, onChange,
}: { month: number; year: number; onChange: (month: number, year: number) => void }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(year)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setViewYear(year)
  }, [open, year])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm font-semibold text-base-100 hover:border-accent-400 transition"
      >
        <Calendar className="w-4 h-4 text-accent-400" />
        {MONTHS_FULL[month]} de {year}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-2 bg-base-900 border border-base-700 rounded-xl shadow-2xl p-4 w-72 animate-rise">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setViewYear((y) => y - 1)} className="p-1.5 hover:bg-base-800 rounded-lg text-base-400 hover:text-base-100 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-bold text-base-100">{viewYear}</span>
            <button type="button" onClick={() => setViewYear((y) => y + 1)} className="p-1.5 hover:bg-base-800 rounded-lg text-base-400 hover:text-base-100 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MONTHS_SHORT.map((m, idx) => {
              const isSelected = idx === month && viewYear === year
              const isCurrent = idx === new Date().getMonth() && viewYear === new Date().getFullYear()
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => { onChange(idx, viewYear); setOpen(false) }}
                  className={`py-2 rounded-lg text-[13px] font-semibold transition border ${
                    isSelected
                      ? 'bg-accent-500 text-base-950 border-accent-500'
                      : isCurrent
                        ? 'bg-base-850 text-accent-300 border-accent-500/40'
                        : 'bg-base-850 text-base-300 border-base-700 hover:border-base-600'
                  }`}
                >
                  {m}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => { const t = new Date(); onChange(t.getMonth(), t.getFullYear()); setOpen(false) }}
            className="w-full mt-3 text-[12px] font-semibold text-accent-300 hover:text-accent-200 transition"
          >
            Ir para o mês atual
          </button>
        </div>
      )}
    </div>
  )
}
