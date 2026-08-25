import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode, TextareaHTMLAttributes, ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'

export function Field({ label, children, required, badge }: { label: string; children: ReactNode; required?: boolean; badge?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wider text-base-400 flex items-center gap-1.5">
        {label} {required && <span className="text-negative-400">*</span>}
        {badge}
      </label>
      {children}
    </div>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition disabled:opacity-50 ${props.className ?? ''}`}
    />
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition disabled:opacity-50 ${props.className ?? ''}`}
    />
  )
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition resize-none disabled:opacity-50 ${props.className ?? ''}`}
    />
  )
}

export function Button({
  children, variant = 'primary', size = 'md', loading, className = '', disabled, ...rest
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'tonal' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  /** Mostra spinner e trava o clique — usar no lugar de trocar o texto manualmente ("Salvando..."). */
  loading?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<string, string> = {
    primary: 'bg-accent-500 hover:bg-accent-400 text-base-950 shadow-lg shadow-accent-500/20',
    secondary: 'bg-base-800 hover:bg-base-700 text-base-200 border border-base-700',
    tonal: 'bg-accent-500/12 hover:bg-accent-500/20 text-accent-300 border border-accent-500/25',
    danger: 'bg-negative-500/15 hover:bg-negative-500/25 text-negative-400 border border-negative-500/30',
    ghost: 'bg-transparent hover:bg-base-850 text-base-400 hover:text-base-200',
  }
  // sm/lg são opt-in — sem a prop, o tamanho fica idêntico ao de antes (px-4 py-2 text-sm).
  const sizes: Record<string, string> = {
    sm: 'px-2.5 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-5 py-2.5 text-sm rounded-xl',
  }
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {loading && (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" aria-hidden="true" />
      )}
      {children}
    </button>
  )
}

// Botão de ícone padronizado — legenda visível ao encostar (mouse ou toque
// com foco), em vez de depender do "title" nativo do navegador, que a
// maioria dos celulares nunca chega a mostrar. Usar em qualquer lugar do
// sistema que hoje tem um <button> cru só com um ícone dentro.
export function IconButton({
  icon: Icon, label, tone = 'default', className = '', ...rest
}: {
  icon: LucideIcon
  label: string
  tone?: 'default' | 'accent' | 'negative'
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const tones: Record<string, string> = {
    default: 'text-base-400 hover:text-base-100 hover:bg-base-800 hover:border-base-700',
    accent: 'text-base-400 hover:text-accent-300 hover:bg-accent-500/10 hover:border-accent-500/30',
    negative: 'text-base-400 hover:text-negative-400 hover:bg-negative-500/10 hover:border-negative-500/30',
  }
  return (
    <button
      {...rest}
      aria-label={label}
      className={`group relative w-8 h-8 shrink-0 rounded-lg border border-transparent flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-transparent ${tones[tone]} ${className}`}
    >
      <Icon className="w-4 h-4" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-base-100 px-2 py-1 text-[11px] font-bold text-base-950 opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 group-focus-visible:opacity-100 group-focus-visible:scale-100 transition z-20">
        {label}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-base-100" />
      </span>
    </button>
  )
}
