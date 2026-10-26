import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function Modal({
  open, onClose, title, children, maxWidth = 'max-w-lg', sheetNoCelular = false,
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; maxWidth?: string
  /** No celular vira bottom sheet (largura total, preso embaixo, arredondado só em cima) — pra modais
   *  com bastante conteúdo/texto pra colar, onde o modal centralizado sobra pouco espaço útil. */
  sheetNoCelular?: boolean
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
    <div className={`fixed inset-0 z-[1000] flex justify-center animate-fade-in ${sheetNoCelular ? 'items-end sm:items-center p-0 sm:p-4' : 'items-center p-4'}`}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className={`relative w-full ${maxWidth} bg-base-900 border border-base-700 shadow-2xl overflow-y-auto animate-rise ${sheetNoCelular ? 'rounded-t-2xl sm:rounded-2xl border-b-0 sm:border-b max-h-[92vh] sm:max-h-[90vh]' : 'rounded-2xl max-h-[90vh]'}`}>
        <div className={`flex items-center justify-between py-4 border-b border-base-800 sticky top-0 bg-base-900 z-10 ${sheetNoCelular ? 'px-4 sm:px-6' : 'px-6'}`}>
          <h2 className="font-display font-bold text-base text-base-100">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-base-400 hover:text-base-100 hover:bg-base-800 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className={sheetNoCelular ? 'p-4 sm:p-6' : 'p-6'}>{children}</div>
      </div>
    </div>,
    document.body
  )
}
