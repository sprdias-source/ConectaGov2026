import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

// Barra de rolagem horizontal "fantasma" fixada ACIMA da tabela, sincronizada
// com o scroll real por baixo — o navegador só desenha a barra nativa
// embaixo do conteúdo, então pra ter uma no topo (tabelas largas que hoje
// obrigam descer até o fim da página só pra rolar pros lados) precisa desse
// elemento espelho. Mesmo padrão já usado no quadro do Kanban
// (KanbanLicitacoesPage.tsx), generalizado aqui pra qualquer tabela do
// sistema — troca só o `<div className="overflow-x-auto ...">` que já
// envolve a tabela por este componente, com o mesmo className.
// Só começa a tratar como "arrastando" depois desse tanto de movimento —
// sem isso, qualquer clique normal num botão/link de dentro da tabela
// (editar, excluir, alternar) contaria como um arraste de 0px e o clique
// de verdade nunca chegaria a disparar.
const LIMIAR_ARRASTE_PX = 4

export default function TopScrollTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  const topoRef = useRef<HTMLDivElement>(null)
  const conteudoRef = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  const sincronizandoRef = useRef<'topo' | 'conteudo' | null>(null)

  // Clique-e-arraste ("mãozinha") pra rolar a tabela pro lado a partir de
  // qualquer ponto dela, não só acertando a barra de rolagem. Guardado em
  // ref (não state) porque muda a cada pixel do mouse — só o "estou
  // arrastando de verdade" (arrastando, abaixo) precisa virar re-render,
  // pra aplicar a classe que troca o cursor e desliga clique nos filhos.
  const arrasteRef = useRef<{ pointerId: number; xInicial: number; scrollInicial: number; arrastando: boolean } | null>(null)
  const [arrastando, setArrastando] = useState(false)

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Só o botão esquerdo do mouse inicia o gesto (botão direito é menu de
    // contexto, meio costuma abrir em nova aba) — toque continua rolando
    // do jeito nativo do navegador, sem passar por aqui.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.pointerType !== 'mouse') return
    const el = conteudoRef.current
    if (!el) return
    arrasteRef.current = { pointerId: e.pointerId, xInicial: e.clientX, scrollInicial: el.scrollLeft, arrastando: false }
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const estado = arrasteRef.current
    const el = conteudoRef.current
    if (!estado || !el || estado.pointerId !== e.pointerId) return
    const delta = e.clientX - estado.xInicial
    if (!estado.arrastando) {
      if (Math.abs(delta) < LIMIAR_ARRASTE_PX) return
      estado.arrastando = true
      el.setPointerCapture(e.pointerId)
      setArrastando(true)
    }
    el.scrollLeft = estado.scrollInicial - delta
  }

  const pararArraste = (e: PointerEvent<HTMLDivElement>) => {
    if (arrasteRef.current?.pointerId !== e.pointerId) return
    arrasteRef.current = null
    setArrastando(false)
  }

  // Duas fontes de remedição, porque nenhuma sozinha cobre os dois jeitos
  // da largura mudar: o ResizeObserver no próprio contêiner pega quando a
  // JANELA muda de tamanho (o contêiner tem w-full, então redimensiona com
  // ela) — mas um <div overflow-x-auto> não redimensiona sozinho só porque
  // o CONTEÚDO de dentro cresceu (é exatamente pra isso que existe o
  // overflow). Por isso o useLayoutEffect sem dependências, que roda depois
  // de toda renderização (filtro mudou, dado carregou, colunas mudaram) e
  // relê o scrollWidth de verdade.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- de propósito sem deps: precisa reler o scrollWidth depois de TODA renderização (não só na montagem), e setState com o mesmo número não gera um novo render, então não há risco de loop infinito.
  useLayoutEffect(() => {
    const el = conteudoRef.current
    if (!el) return
    setLargura(el.scrollWidth)
  })

  useEffect(() => {
    const el = conteudoRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setLargura(el.scrollWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleScrollTopo = () => {
    if (sincronizandoRef.current === 'conteudo') { sincronizandoRef.current = null; return }
    if (!topoRef.current || !conteudoRef.current) return
    sincronizandoRef.current = 'topo'
    conteudoRef.current.scrollLeft = topoRef.current.scrollLeft
  }
  const handleScrollConteudo = () => {
    if (sincronizandoRef.current === 'topo') { sincronizandoRef.current = null; return }
    if (!topoRef.current || !conteudoRef.current) return
    sincronizandoRef.current = 'conteudo'
    topoRef.current.scrollLeft = conteudoRef.current.scrollLeft
  }

  return (
    <div>
      {largura > 0 && (
        <div ref={topoRef} onScroll={handleScrollTopo} className="top-scrollbar overflow-x-auto overflow-y-hidden mb-1.5">
          <div style={{ width: largura, height: 1 }} />
        </div>
      )}
      <div
        ref={conteudoRef}
        onScroll={handleScrollConteudo}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={pararArraste}
        onPointerCancel={pararArraste}
        className={`table-scroll overflow-x-auto ${arrastando ? 'dragging' : ''} ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
