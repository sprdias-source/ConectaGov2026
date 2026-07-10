import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = {
  value: string
  onChange: (valor: string) => void
  placeholder?: string
  id?: string
  autoComplete?: string
}

/**
 * Campo de senha com botão de "olhinho" pra mostrar/ocultar o texto
 * digitado. Reutilizável em qualquer tela que peça senha (login, criar
 * conta, redefinir senha, trocar senha nas configurações da conta).
 */
export default function CampoSenha({ value, onChange, placeholder, id, autoComplete }: Props) {
  const [mostrar, setMostrar] = useState(false)

  return (
    <div className="relative w-full">
      <input
        id={id}
        type={mostrar ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Senha'}
        autoComplete={autoComplete ?? 'current-password'}
        className="w-full bg-base-850 border border-base-700 rounded-lg pl-3 pr-10 py-2 text-[13px] text-base-100 placeholder:text-base-500 outline-none focus:border-accent-400"
      />
      <button
        type="button"
        onClick={() => setMostrar((m) => !m)}
        aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-base-500 hover:text-base-200 transition"
      >
        {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}
