import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'

export interface ActionsMenuItem {
  key: string
  label: string
  icon: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  // Pra itens que precisam de um elemento próprio (ex: label + <input type="file">
  // escondido) em vez de um <button> simples — recebe uma função pra fechar o
  // menu quando a ação interna terminar (ex: depois de escolher o arquivo).
  render?: (fechar: () => void) => ReactNode
}

// Menu "..." genérico pra linhas de tabela/card com muitas ações — evita
// enfileirar 6+ ícones lado a lado (fica ilegível e some com o scroll
// horizontal). Mantém só as ações mais usadas visíveis fora do menu.
export default function ActionsMenu({ items }: { items: ActionsMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
        onClick={() => setOpen((v) => !v)}
        title="Mais ações"
        className="p-1.5 text-base-400 hover:text-base-100 hover:bg-base-800 rounded transition"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-base-900 border border-base-700 rounded-lg shadow-2xl z-20 py-1 animate-fade-in">
          {items.map((item) =>
            item.render ? (
              <div key={item.key}>{item.render(() => setOpen(false))}</div>
            ) : (
              <button
                key={item.key}
                onClick={() => { item.onClick?.(); setOpen(false) }}
                disabled={item.disabled}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-left transition disabled:opacity-50 disabled:cursor-wait ${
                  item.danger ? 'text-negative-400 hover:bg-negative-500/10' : 'text-base-200 hover:bg-base-800'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
