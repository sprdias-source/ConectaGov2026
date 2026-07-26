import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

const DURACAO_MS: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  // Erros ficam mais tempo na tela — o usuário costuma precisar ler a
  // mensagem com calma pra entender o que deu errado, não só "sumir".
  error: 7000,
}

const ESTILO: Record<ToastVariant, { icon: typeof CheckCircle2; classes: string; iconColor: string }> = {
  success: { icon: CheckCircle2, classes: 'bg-base-900 border-positive-500/40', iconColor: 'text-positive-400' },
  error: { icon: AlertCircle, classes: 'bg-base-900 border-negative-500/40', iconColor: 'text-negative-400' },
  info: { icon: Info, classes: 'bg-base-900 border-accent-500/40', iconColor: 'text-accent-400' },
}

// Notificação global — um único lugar consistente pra "salvo com sucesso" /
// "erro ao salvar" em vez de cada tela inventar seu próprio banner inline
// (o app tinha vários jeitos diferentes de mostrar a mesma coisa).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((atual) => atual.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = nextId.current++
    setToasts((atual) => [...atual, { id, message, variant }])
    setTimeout(() => dismiss(id), DURACAO_MS[variant])
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[2000] flex flex-col gap-2 items-end pointer-events-none">
          {toasts.map((t) => {
            const { icon: Icon, classes, iconColor } = ESTILO[t.variant]
            return (
              <div
                key={t.id}
                className={`pointer-events-auto w-full sm:w-auto sm:max-w-sm flex items-start gap-2.5 border rounded-xl shadow-2xl px-4 py-3 animate-rise ${classes}`}
              >
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
                <p className="text-[13px] text-base-200 flex-1">{t.message}</p>
                <button onClick={() => dismiss(t.id)} className="text-base-500 hover:text-base-200 transition shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
