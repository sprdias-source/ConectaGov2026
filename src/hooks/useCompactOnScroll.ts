import { useEffect, useState } from 'react'

// Fica `true` assim que a página rola além do limiar — usado pra encolher
// um cabeçalho fixo (nome grande + abas) numa barra compacta, sem duplicar
// o listener de scroll em cada tela que quiser o mesmo comportamento (hoje
// só LicitacaoPage.tsx usa; Kanban e outras telas longas podem reaproveitar
// depois só chamando este hook).
export function useCompactOnScroll(threshold = 64) {
  const [compacto, setCompacto] = useState(false)

  useEffect(() => {
    const onScroll = () => setCompacto(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return compacto
}
