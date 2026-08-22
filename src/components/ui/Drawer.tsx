import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from './FormControls'

// Painel deslizante genérico (gaveta lateral) — pra ações que hoje abrem
// "empurrando" o conteúdo pra baixo (ex: enviar/buscar uma certidão dentro
// da aba Checklist da Licitação). Mesmo padrão de overlay já usado em
// GlobalSearch.tsx (portal, trava o scroll do body, fecha com Esc), só que
// deslizando da direita em vez de aparecer centralizado.
export function Drawer({
  open, onClose, title, subtitle, children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[1500] flex justify-end animate-fade-in">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-base-900 border-l border-base-700 h-full flex flex-col shadow-2xl animate-slide-in-right">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-base-800 shrink-0">
          <div className="min-w-0">
            <h3 className="text-[13.5px] font-bold text-base-100 truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-base-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <IconButton icon={X} label="Fechar" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3.5">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
