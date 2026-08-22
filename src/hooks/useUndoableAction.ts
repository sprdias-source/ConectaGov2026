import { useCallback, useRef, useState } from 'react'

export interface UndoToastState {
  message: string
  onUndo: () => void
}

// Some da tela na hora (sem diálogo de confirmação antes) e só manda de
// verdade pro banco depois de alguns segundos — dando uma saída de
// "Desfazer" nesse meio-tempo. Em vez de travar toda exclusão pequena com
// um "tem certeza?" prévio. Só faz sentido pra ações realmente reversíveis
// e sem efeito em cascata (ex: um item de checklist digitado errado);
// exclusões que arrastam outros dados junto continuam com ConfirmDialog.
//
// `estaPendente(id)` diz se um item deve sumir da lista (exclusão ainda não
// confirmada, mas já escondida) — o componente que usa isso deve filtrar a
// lista renderizada com esse helper.
export function useUndoableDelete<T extends { id: string }>(segundosParaExpirar = 6) {
  const [pendentes, setPendentes] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<UndoToastState | null>(null)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const estaPendente = useCallback((id: string) => pendentes.has(id), [pendentes])

  const iniciarExclusao = useCallback((item: T, opts: { mensagem: string; excluir: (item: T) => void }) => {
    setPendentes((prev) => new Set(prev).add(item.id))
    setToast({
      message: opts.mensagem,
      onUndo: () => {
        const timer = timersRef.current.get(item.id)
        if (timer) clearTimeout(timer)
        timersRef.current.delete(item.id)
        setPendentes((prev) => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
        setToast(null)
      },
    })
    const timer = setTimeout(() => {
      timersRef.current.delete(item.id)
      opts.excluir(item)
      setToast((atual) => (atual?.message === opts.mensagem ? null : atual))
    }, segundosParaExpirar * 1000)
    timersRef.current.set(item.id, timer)
  }, [segundosParaExpirar])

  return { estaPendente, iniciarExclusao, toast }
}
