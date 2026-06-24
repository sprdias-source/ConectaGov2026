import type { InputHTMLAttributes, SelectHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wider text-base-400">
        {label} {required && <span className="text-negative-400">*</span>}
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
  children, variant = 'primary', className = '', ...rest
}: { children: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | 'ghost' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<string, string> = {
    primary: 'bg-accent-500 hover:bg-accent-400 text-base-950 shadow-lg shadow-accent-500/20',
    secondary: 'bg-base-800 hover:bg-base-700 text-base-200 border border-base-700',
    danger: 'bg-negative-500/15 hover:bg-negative-500/25 text-negative-400 border border-negative-500/30',
    ghost: 'bg-transparent hover:bg-base-850 text-base-400 hover:text-base-200',
  }
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold text-sm px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
