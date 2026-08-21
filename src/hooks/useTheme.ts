import { useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'conectagov-theme'

// Preferência de exibição (não é dado do cliente/licitação, é só a tela do
// usuário) — por isso fica salva no navegador (localStorage), não no banco.
// Sem escolha salva ainda, mantém o padrão de sempre: modo escuro.
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Navegação privada, cota estourada, etc. — o tema continua valendo
      // na sessão atual, só não persiste pra próxima.
    }
  }, [theme])

  const toggleTheme = () => {
    setTheme((atual) => (atual === 'dark' ? 'light' : 'dark'))
  }

  return { theme, toggleTheme }
}
