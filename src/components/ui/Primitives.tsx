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
  label, value, icon: Icon, tone = 'neutral', sublabel,
}: {
  label: string
  value: string
  icon?: LucideIcon
  tone?: 'positive' | 'negative' | 'warning' | 'accent' | 'neutral'
  sublabel?: string
}) {
  const toneColors: Record<string, string> = {
    positive: 'text-positive-400',
    negative: 'text-negative-400',
    warning: 'text-warning-400',
    accent: 'text-accent-400',
    neutral: 'text-base-100',
  }
  return (
    <div className="bg-base-900/60 border border-base-700/50 rounded-xl p-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-base-500">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 text-base-500" />}
      </div>
      <div className={`text-2xl font-extrabold font-mono tabular-nums tracking-tight ${toneColors[tone]}`}>
        {value}
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

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'Pago': 'bg-positive-500/15 text-positive-400 border-positive-500/30',
    'Pendente': 'bg-warning-500/15 text-warning-400 border-warning-500/30',
    'Atrasado': 'bg-negative-500/15 text-negative-400 border-negative-500/30',
    'Vence Hoje': 'bg-warning-500/15 text-warning-400 border-warning-500/30',
    'Ganhou': 'bg-positive-500/15 text-positive-400 border-positive-500/30',
    'Perdeu': 'bg-negative-500/15 text-negative-400 border-negative-500/30',
    'Em Andamento': 'bg-accent-500/15 text-accent-400 border-accent-500/30',
    'Cancelada': 'bg-base-600/30 text-base-400 border-base-600/40',
    'Cancelado': 'bg-base-600/30 text-base-400 border-base-600/40',
    'Faturado': 'bg-positive-500/15 text-positive-400 border-positive-500/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${styles[status] ?? 'bg-base-700/30 text-base-300 border-base-600/40'}`}>
      {status}
    </span>
  )
}

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full bg-base-850 border border-base-700 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-base-500" />
      </div>
      <h3 className="text-base-200 font-semibold text-sm mb-1">{title}</h3>
      <p className="text-base-500 text-[13px] max-w-sm">{description}</p>
    </div>
  )
}
