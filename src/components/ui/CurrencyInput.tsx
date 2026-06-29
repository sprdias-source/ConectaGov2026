import { useEffect, useRef, useState } from 'react'
import { parseFlexibleNumber } from '../../lib/numberParsing'

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

function valueToCents(value: number): number {
  return Math.round(value * 100)
}

/**
 * Campo de valor monetário no estilo "calculadora": dígitos entram pela
 * direita, sem precisar digitar vírgula. Funciona tanto em teclado físico
 * (onKeyDown, mais preciso) quanto em teclado virtual de celular — que
 * não dispara onKeyDown de forma confiável em todos os navegadores
 * móveis. Por isso usamos onInput como mecanismo principal, derivando o
 * próximo valor a partir dos dígitos brutos do campo, e onKeyDown só
 * como atalho extra (Backspace/Delete) em desktop.
 */
export default function CurrencyInput({
  value, onChange, placeholder = 'R$ 0,00', disabled, className = '', autoFocus,
}: CurrencyInputProps) {
  const [cents, setCents] = useState(() => valueToCents(value))
  const lastEmitted = useRef(cents)

  useEffect(() => {
    const next = valueToCents(value)
    setCents(next)
    lastEmitted.current = next
  }, [value])

  const emit = (next: number) => {
    const clamped = Math.min(next, 99_999_999_999_99)
    setCents(clamped)
    if (clamped !== lastEmitted.current) {
      lastEmitted.current = clamped
      onChange(clamped / 100)
    }
  }

  // Mecanismo principal: funciona em qualquer dispositivo, incluindo
  // teclados virtuais de celular. Extrai só os dígitos do valor atual do
  // campo (o navegador já aplicou a tecla pressionada antes de onInput
  // disparar) e usa isso como a nova base em centavos.
  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const raw = e.currentTarget.value
    const digitsOnly = raw.replace(/\D/g, '')
    if (digitsOnly === '') {
      emit(0)
      return
    }
    // Remove zeros à esquerda além do necessário para não travar em
    // overflow prematuro, mas preserva o valor numérico real digitado.
    const next = parseInt(digitsOnly, 10)
    emit(Number.isFinite(next) ? next : 0)
  }

  // Atalhos de teclado físico (desktop): não fazem nada que o onInput já
  // não faria para dígitos, mas garantem Backspace/Delete previsíveis
  // mesmo se o navegador reportar o valor de forma inesperada.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowed = ['Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Backspace', 'Delete']
    if (e.key >= '0' && e.key <= '9') return // deixa o onInput processar
    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) return
    if (allowed.includes(e.key)) return
    e.preventDefault()
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const parsed = parseFlexibleNumber(text)
    if (parsed !== null) {
      emit(Math.round(parsed * 100))
      return
    }
    // Sem nenhuma estrutura decimal reconhecível: trata como dígitos crus
    const digitsOnly = text.replace(/\D/g, '')
    if (!digitsOnly) return
    emit(parseInt(digitsOnly, 10))
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
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onChange={() => {}}
        placeholder={placeholder}
        className="w-full bg-base-850 border border-base-700 rounded-lg pl-9 pr-3 py-2 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition disabled:opacity-50 text-right font-mono tabular-nums"
      />
    </div>
  )
}
