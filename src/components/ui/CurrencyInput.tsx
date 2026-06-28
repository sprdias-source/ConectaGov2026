import { useEffect, useState } from 'react'

interface CurrencyInputProps {
  value: number
  onChange: (value: number) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
}

// Formata um número de centavos (inteiro) para exibição "1.234,56"
function centsToDisplay(cents: number): string {
  if (cents === 0) return ''
  const reais = cents / 100
  return reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Converte um valor decimal (ex: 1234.56) para sua representação em centavos
function valueToCents(value: number): number {
  return Math.round(value * 100)
}

/**
 * Campo de valor monetário no estilo "calculadora": o usuário digita os
 * dígitos da direita para a esquerda (como em caixas eletrônicos e apps
 * bancários), sem precisar digitar vírgula ou ponto. Bem mais rápido que
 * um <input type="number"> para valores em Real.
 */
export default function CurrencyInput({
  value, onChange, placeholder = 'R$ 0,00', disabled, className = '', autoFocus,
}: CurrencyInputProps) {
  const [cents, setCents] = useState(() => valueToCents(value))

  // Mantém sincronizado se o valor externo mudar (ex: ao abrir modal de edição)
  useEffect(() => {
    setCents(valueToCents(value))
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      const next = cents * 10 + parseInt(e.key, 10)
      // Limite de segurança: evita overflow absurdo (acima de 999 bilhões)
      if (next > 99_999_999_999_99) return
      setCents(next)
      onChange(next / 100)
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      const next = Math.floor(cents / 10)
      setCents(next)
      onChange(next / 100)
    } else if (e.key === 'Delete' || (e.key === 'a' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault()
      setCents(0)
      onChange(0)
    } else if (
      ['Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)
    ) {
      // permite navegação normal
    } else {
      e.preventDefault()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const digitsOnly = text.replace(/\D/g, '')
    if (!digitsOnly) return
    const next = parseInt(digitsOnly, 10)
    setCents(next)
    onChange(next / 100)
  }

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base-500 text-sm font-medium pointer-events-none">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        autoFocus={autoFocus}
        value={centsToDisplay(cents)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onChange={() => {}}
        placeholder={placeholder}
        className="w-full bg-base-850 border border-base-700 rounded-lg pl-9 pr-3 py-2 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition disabled:opacity-50 text-right font-mono tabular-nums"
      />
    </div>
  )
}
