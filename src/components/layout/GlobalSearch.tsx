import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search, Gavel, Users, X } from 'lucide-react'
import { useBiddings } from '../../hooks/useBiddings'
import { useClients } from '../../hooks/useClients'

// Busca global (Ctrl/Cmd+K) — encontra rapidamente uma licitação ou cliente
// sem precisar navegar até a lista certa e filtrar manualmente. Clientes
// ainda não têm rota própria (a edição vive dentro da aba Clientes de
// Cadastros), então o clique leva pra lá — licitações já têm página própria
// e abrem direto nela.
export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { biddings } = useBiddings()
  const { clients } = useClients()
  const [termo, setTermo] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Limpa o termo de busca ao fechar (não ao abrir) — assim o efeito abaixo
  // só cuida de assinar eventos/focar o campo, sem chamar setState direto
  // no corpo do efeito.
  const fecharBusca = () => {
    setTermo('')
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0)
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') fecharBusca() }
    window.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(focusTimer)
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const q = termo.trim().toLowerCase()

  const resultadosLicitacoes = useMemo(() => {
    if (q.length < 2) return []
    return biddings.filter((b) =>
      b.objeto.toLowerCase().includes(q)
      || b.orgao.toLowerCase().includes(q)
      || (b.municipio ?? '').toLowerCase().includes(q)
      || (b.numeroEdital ?? '').toLowerCase().includes(q)
    ).slice(0, 6)
  }, [biddings, q])

  const resultadosClientes = useMemo(() => {
    if (q.length < 2) return []
    return clients.filter((c) => c.name.toLowerCase().includes(q) || (c.cnpj ?? '').includes(q)).slice(0, 6)
  }, [clients, q])

  const irParaLicitacao = (id: string) => { fecharBusca(); navigate(`/licitacoes/${id}`) }
  const irParaClientes = () => { fecharBusca(); navigate('/cadastros') }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-start justify-center pt-[10vh] px-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={fecharBusca} />
      <div className="relative w-full max-w-lg bg-base-900 border border-base-700 rounded-2xl shadow-2xl overflow-hidden animate-rise">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-base-800">
          <Search className="w-4 h-4 text-base-500 shrink-0" />
          <input
            ref={inputRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar licitações ou clientes..."
            className="flex-1 bg-transparent outline-none text-[14px] text-base-100 placeholder:text-base-500"
          />
          <button onClick={fecharBusca} className="text-base-500 hover:text-base-200 transition shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {q.length < 2 ? (
            <p className="px-4 py-6 text-center text-[12px] text-base-500">Digite ao menos 2 letras pra buscar.</p>
          ) : resultadosLicitacoes.length === 0 && resultadosClientes.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-base-500">Nenhum resultado para "{termo}".</p>
          ) : (
            <>
              {resultadosLicitacoes.length > 0 && (
                <div className="py-2">
                  <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-base-500">Licitações</p>
                  {resultadosLicitacoes.map((b) => (
                    <button key={b.id} onClick={() => irParaLicitacao(b.id)} className="w-full flex items-start gap-2.5 px-4 py-2 text-left hover:bg-base-850 transition">
                      <Gavel className="w-3.5 h-3.5 text-accent-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[13px] text-base-100 truncate">{b.objeto}</p>
                        <p className="text-[11px] text-base-500 truncate">{b.orgao}{b.municipio ? ` — ${b.municipio}` : ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {resultadosClientes.length > 0 && (
                <div className="py-2 border-t border-base-800">
                  <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-base-500">Clientes</p>
                  {resultadosClientes.map((c) => (
                    <button key={c.id} onClick={irParaClientes} className="w-full flex items-start gap-2.5 px-4 py-2 text-left hover:bg-base-850 transition">
                      <Users className="w-3.5 h-3.5 text-accent-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[13px] text-base-100 truncate">{c.name}</p>
                        {c.cnpj && <p className="text-[11px] text-base-500 truncate">{c.cnpj}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-base-800 flex items-center justify-between text-[10px] text-base-600">
          <span>Clientes abrem na aba Cadastros</span>
          <span>Esc pra fechar</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
