// Placeholder de carregamento — troca o "Carregando..." em texto puro por
// um bloco pulsante do formato aproximado do conteúdo real, dando a
// sensação de app mais rápido/maduro em vez de uma tela em branco/texto.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-base-800 rounded ${className}`} />
}

// Algumas telas usam tabela — simula N linhas com colunas proporcionais
// em vez de travar tudo num "Carregando..." central.
export function SkeletonTableRows({ linhas = 5, colunas = 4 }: { linhas?: number; colunas?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          {Array.from({ length: colunas }).map((_, j) => (
            <Skeleton key={j} className={`h-4 ${j === 0 ? 'flex-[2]' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Lista de cards simples (ex: itens de pendência, eventos do dia).
export function SkeletonList({ itens = 4 }: { itens?: number }) {
  return (
    <div className="flex flex-col gap-2.5 p-4">
      {Array.from({ length: itens }).map((_, i) => (
        <div key={i} className="border border-base-800 rounded-lg p-3 flex flex-col gap-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}
