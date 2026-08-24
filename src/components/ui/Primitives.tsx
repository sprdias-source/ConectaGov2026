import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function PageHeader({
  title, subtitle, icon: Icon, actions,
}: { title: string; subtitle?: string; icon?: LucideIcon; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6 pb-2">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="w-5 h-5 text-accent-400" />
          </div>
        )}
        <div>
          <h1 className="font-display font-bold text-xl text-base-100 tracking-tight">{title}</h1>
          {subtitle && <p className="text-base-400 text-[13px] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

export function KpiCard({
  label, value, icon: Icon, tone = 'neutral', sublabel, delta, elevated,
}: {
  label: string
  value: string
  icon?: LucideIcon
  tone?: 'positive' | 'negative' | 'warning' | 'accent' | 'neutral'
  sublabel?: string
  /** Variação percentual vs período anterior. Positivo = subiu, negativo = caiu.
   *  `goodDirection` define se "subir" é bom (receita) ou ruim (despesa/atraso) — isso decide a cor da seta. */
  delta?: { value: number; goodDirection?: 'up' | 'down' }
  /** Destaca este card como mais importante (borda mais clara, fundo levemente elevado). Use com moderação — 1 a 2 por tela. */
  elevated?: boolean
}) {
  const toneColors: Record<string, string> = {
    positive: 'text-positive-400',
    negative: 'text-negative-400',
    warning: 'text-warning-400',
    accent: 'text-accent-400',
    neutral: 'text-base-100',
  }

  const deltaIsGood = delta ? (delta.goodDirection === 'down' ? delta.value < 0 : delta.value >= 0) : null
  const deltaColor = deltaIsGood === null ? '' : deltaIsGood ? 'text-positive-400' : 'text-negative-300'

  return (
    <div className={`rounded-xl p-4 flex flex-col gap-1.5 transition-all duration-200 hover:-translate-y-0.5 ${
      elevated
        ? 'bg-base-850/80 border border-base-600/60 shadow-[0_0_0_1px_rgba(45,190,203,0.08)] hover:border-base-600'
        : 'bg-base-900/60 border border-base-700/50 hover:border-base-600/70'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-base-500">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 text-base-500" />}
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-extrabold font-mono tabular-nums tracking-tight ${toneColors[tone]}`}>
          {value}
        </span>
        {delta && (
          <span className={`text-[11px] font-bold font-mono flex items-center gap-0.5 ${deltaColor}`}>
            {delta.value >= 0 ? '▲' : '▼'} {Math.abs(delta.value).toFixed(1)}%
          </span>
        )}
      </div>
      {sublabel && <span className="text-[11px] text-base-500">{sublabel}</span>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-base-900/60 border border-base-700/50 rounded-xl ${className}`}>
      {children}
    </div>
  )
}

// Pill com pontinho em vez de caixa-alta com borda: lê-se mais rápido nas
// tabelas e deixa o status "vivo" (o pulso só nos que pedem atenção agora —
// atrasado/perdeu).
const STATUS_TONES: Record<string, 'positive' | 'negative' | 'warning' | 'accent' | 'neutral'> = {
  'Pago': 'positive',
  'Pendente': 'warning',
  'Atrasado': 'negative',
  'Vence Hoje': 'warning',
  'Ganhou': 'positive',
  'Perdeu': 'negative',
  'Em Andamento': 'accent',
  'Cancelada': 'neutral',
  'Cancelado': 'neutral',
  'Desistiu': 'warning',
  'Faturado': 'positive',
}
const PILL_TONES: Record<string, string> = {
  positive: 'bg-positive-500/12 text-positive-400',
  negative: 'bg-negative-500/12 text-negative-400',
  warning: 'bg-warning-500/13 text-warning-400',
  accent: 'bg-accent-500/13 text-accent-400',
  neutral: 'bg-base-700/40 text-base-300',
}

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? 'neutral'
  const pulsar = tone === 'negative'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${PILL_TONES[tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current shrink-0 ${pulsar ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}

export function EmptyState({
  icon: Icon, title, description, action,
}: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full bg-base-850 border border-base-700 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-base-500" />
      </div>
      <h3 className="text-base-200 font-semibold text-sm mb-1">{title}</h3>
      <p className="text-base-500 text-[13px] max-w-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
