import { AlertTriangle } from 'lucide-react'

function extractMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { message?: string; details?: string; hint?: string }
    return maybe.message || maybe.details || maybe.hint || JSON.stringify(error)
  }
  return String(error)
}

export default function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null
  const message = extractMessage(error)

  return (
    <div className="flex items-start gap-2 bg-negative-500/10 border border-negative-500/30 rounded-lg px-3 py-2.5">
      <AlertTriangle className="w-4 h-4 text-negative-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-negative-400">Não foi possível salvar</p>
        <p className="text-[12px] text-negative-300/90 mt-0.5 break-words">{message}</p>
      </div>
    </div>
  )
}
