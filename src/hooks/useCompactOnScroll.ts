import { useEffect, useState } from 'react'

// Fica `true` assim que a página rola além do limiar — usado pra encolher
// um cabeçalho fixo (nome grande + abas) numa barra compacta, sem duplicar
// o listener de scroll em cada tela que quiser o mesmo comportamento (hoje
// só LicitacaoPage.tsx usa; Kanban e outras telas longas podem reaproveitar
// depois só chamando este hook).
//
// Usa dois limiares (com folga) em vez de um só: encolher/expandir o
// cabeçalho muda a altura dele, o que por sua vez desloca o conteúdo — se o
// dedo parar rolando bem perto do limiar único (ou no "elástico" do iOS no
// topo da página), esse deslocamento faz o scrollY cruzar o limiar de novo
// sozinho, entrando num liga-desliga (o "bugando"/tremendo que ficava mais
// visível no Checklist por ter mais conteúdo pra rolar por perto do limiar).
// Com folga, só expande de volta bem abaixo de onde encolheu.
export function useCompactOnScroll(threshold = 64, folga = 24) {
  const [compacto, setCompacto] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setCompacto((atual) => {
        if (!atual && window.scrollY > threshold + folga) return true
        if (atual && window.scrollY < threshold - folga) return false
        return atual
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold, folga])

  return compacto
}
