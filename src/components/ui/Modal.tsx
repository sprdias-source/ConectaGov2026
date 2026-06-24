import { type ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({
  open, onClose, title, children, maxWidth = 'max-w-lg',
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; maxWidth?: string }) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} bg-base-900 border border-base-700 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto animate-rise`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-800 sticky top-0 bg-base-900 z-10">
          <h2 className="font-display font-bold text-base text-base-100">{title}</h2>
          <button onClick={onClose} className="p-1.5 text-base-400 hover:text-base-100 hover:bg-base-800 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
