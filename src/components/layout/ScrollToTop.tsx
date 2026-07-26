import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// React Router não reseta o scroll ao navegar (diferente de uma troca de
// página tradicional) — sem isso, ir para uma tela nova enquanto a anterior
// estava rolada pra baixo mantém a posição, obrigando o usuário a rolar pra
// cima manualmente pra ver o topo da tela nova.
export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
