import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'conectagov-theme'

// Preferência de exibição (não é dado do cliente/licitação, é só a tela do
// usuário) — por isso fica salva no navegador (localStorage), não no banco.
// Sem escolha salva ainda, mantém o padrão de sempre: modo escuro.
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((atual) => (atual === 'dark' ? 'light' : 'dark'))
  }

  return { theme, toggleTheme }
}
