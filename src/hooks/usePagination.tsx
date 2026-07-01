import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 25

export function usePagination<T>(items: T[], pageSize: number = PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  // Mantém a página dentro do intervalo válido se a lista encolher
  // (ex: depois de um filtro ou exclusão).
  const safePage = Math.min(page, totalPages)

  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  return {
    paginated,
    page: safePage,
    setPage,
    totalPages,
    totalItems: items.length,
    pageSize,
  }
}

export function PaginationControls({
  page, totalPages, totalItems, pageSize, onPageChange,
}: { page: number; totalPages: number; totalItems: number; pageSize: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-base-800">
      <span className="text-[12px] text-base-500">
        Mostrando <strong className="text-base-300">{start}–{end}</strong> de <strong className="text-base-300">{totalItems}</strong>
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-base-700 text-base-400 hover:text-base-100 hover:border-base-600 disabled:opacity-40 disabled:hover:text-base-400 transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[12px] text-base-400 px-2 font-mono">{page} / {totalPages}</span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg border border-base-700 text-base-400 hover:text-base-100 hover:border-base-600 disabled:opacity-40 disabled:hover:text-base-400 transition"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
