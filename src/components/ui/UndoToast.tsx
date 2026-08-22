import { createPortal } from 'react-dom'
import type { UndoToastState } from '../../hooks/useUndoableAction'

// Aviso "Item excluído · Desfazer" no canto da tela — companheiro visual de
// useUndoableDelete (ver ali o porquê do padrão "exclui na hora, desfaz
// depois" em vez de confirmar antes).
export function UndoToast({ toast }: { toast: UndoToastState | null }) {
  if (!toast) return null

  return createPortal(
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1600] animate-slide-up">
      <div className="flex items-center gap-3 bg-base-800 border border-base-700 rounded-xl pl-4 pr-2 py-2.5 shadow-2xl">
        <span className="text-[13px] text-base-200">{toast.message}</span>
        <button
          onClick={toast.onUndo}
          className="text-[12px] font-extrabold text-accent-300 hover:text-accent-200 px-2.5 py-1.5 rounded-lg hover:bg-accent-500/10 transition"
        >
          Desfazer
        </button>
      </div>
    </div>,
    document.body
  )
}
