import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface FilterDropdownOption<T extends string> {
  value: T
  label: string
  description?: string
  dotClassName?: string
}

// Caixa de seleção genérica pra filtros de toolbar (Regime, Status, etc.):
// mostra o valor atual + seta, abre um menu com uma linha de descrição por
// opção. Mesmo padrão de abrir/fechar (clique fora + Esc) já usado e
// validado em ActionsMenu.tsx — só troca "lista de ações" por "escolha
// única com valor selecionado".
export default function FilterDropdown<T extends string>({
  label, value, options, onChange,
}: {
  label: string
  value: T
  options: FilterDropdownOption<T>[]
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const handlerEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    window.addEventListener('keydown', handlerEsc)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', handlerEsc)
    }
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg border bg-base-850 transition ${
          open ? 'border-accent-500 text-base-100' : 'border-base-700 text-base-300 hover:border-base-600'
        }`}
      >
        <span className="text-base-500 font-medium">{label}:</span>
        <span>{selected?.label ?? '—'}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-base-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-base-900 border border-base-700 rounded-lg shadow-2xl z-20 py-1 animate-fade-in">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full text-left px-3 py-2 transition ${o.value === value ? 'bg-accent-500/10' : 'hover:bg-base-800'}`}
            >
              <span className="flex items-center gap-2">
                {o.dotClassName && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${o.dotClassName}`} />}
                <span className={`text-[13px] font-semibold ${o.value === value ? 'text-accent-300' : 'text-base-200'}`}>{o.label}</span>
                {o.value === value && <Check className="w-3.5 h-3.5 text-accent-400 ml-auto shrink-0" />}
              </span>
              {o.description && <span className="block text-[11px] text-base-500 mt-0.5 pl-3.5">{o.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
