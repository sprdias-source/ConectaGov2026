import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, AlertTriangle, User, ChevronRight, Ban, Check } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { Button, Textarea } from '../components/ui/FormControls'
import Modal from '../components/ui/Modal'
import { SkeletonList } from '../components/ui/Skeleton'
import { usePendenciasChecklist } from '../hooks/useBiddingChecklist'
import { supabase } from '../lib/supabase'
import { todayLocalISO } from '../lib/dateUtils'

// Marca vários itens de checklist (possivelmente de licitações diferentes)
// como "não aplicável" de uma vez, com UMA justificativa compartilhada —
// pro caso comum de uma mesma exigência não valer pra empresa em várias
// licitações ao mesmo tempo (ex: natureza jurídica). Não existe "marcar
// atendido em lote" de propósito: aqui é habilitação de licitação pública,
// então confirmar que algo foi de fato resolvido tem que continuar sendo
// um clique por item, dentro da própria licitação — só "não aplicável"
// (que já exige justificativa registrada) é seguro o bastante pra ir em
// lote.
function useMarcarNaoAplicavelEmLote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, justificativa }: { ids: string[]; justificativa: string }) => {
      const { error } = await supabase
        .from('bidding_checklist_items')
        .update({ nao_aplicavel: true, justificativa_nao_aplicavel: justificativa })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bidding_checklist_items'] })
      queryClient.invalidateQueries({ queryKey: ['bidding_checklist_pendencias'] })
    },
  })
}

export default function PendenciasPage() {
  const { pendencias, isLoading } = usePendenciasChecklist()
  const marcarNaoAplicavelEmLote = useMarcarNaoAplicavelEmLote()
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [mostrarModalNaoAplicavel, setMostrarModalNaoAplicavel] = useState(false)
  const [justificativaLote, setJustificativaLote] = useState('')

  const diasRestantes = (prazo: string | null): number | null => {
    if (!prazo) return null
    const hoje = new Date(todayLocalISO() + 'T00:00:00')
    const data = new Date(prazo + 'T00:00:00')
    return Math.floor((data.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  }

  const pendenciasOrdenadas = useMemo(() => {
    // Já vem ordenado por prazo do hook (prazo mais próximo primeiro,
    // sem prazo por último) — só separa obrigatórios de opcionais aqui.
    return pendencias
  }, [pendencias])

  const corFor = (dias: number | null) => {
    if (dias === null) return 'text-base-400 bg-base-850/60 border-base-700/50'
    if (dias < 0) return 'text-negative-400 bg-negative-500/10 border-negative-500/25'
    if (dias <= 3) return 'text-warning-400 bg-warning-500/10 border-warning-500/25'
    return 'text-base-300 bg-base-850/60 border-base-700/50'
  }

  const labelDias = (dias: number | null) => {
    if (dias === null) return 'Sem prazo'
    if (dias < 0) return `Vencido há ${Math.abs(dias)} dia(s)`
    if (dias === 0) return 'Vence hoje'
    if (dias === 1) return 'Vence amanhã'
    return `${dias} dias`
  }

  const alternarSelecao = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const limparSelecao = () => setSelecionados(new Set())

  const handleConfirmarNaoAplicavelLote = async () => {
    if (!justificativaLote.trim() || selecionados.size === 0) return
    await marcarNaoAplicavelEmLote.mutateAsync({ ids: Array.from(selecionados), justificativa: justificativaLote.trim() })
    setMostrarModalNaoAplicavel(false)
    setJustificativaLote('')
    limparSelecao()
  }

  return (
    <div className="pb-24">
      <PageHeader
        title="Painel de Pendências"
        subtitle="Tudo que falta resolver em todas as licitações, num lugar só"
        icon={ClipboardList}
      />

      <div className="px-6 mt-4">
        <p className="text-[11px] text-base-500 mb-3">
          Itens ligados a certidões automáticas são conferidos sozinhos (na hora que a certidão é renovada, e também de hora em hora) — se a certidão está válida, o item some daqui sozinho; se está vencendo, o prazo aparece automaticamente.
        </p>
        {isLoading ? (
          <SkeletonList itens={5} />
        ) : pendenciasOrdenadas.length === 0 ? (
          <Card>
            <EmptyState icon={ClipboardList} title="Nenhuma pendência" description="Todos os itens de checklist das licitações ativas estão atendidos ou já têm documento anexado." />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {pendenciasOrdenadas.map((p) => {
              const dias = diasRestantes(p.prazo)
              const marcado = selecionados.has(p.id)
              return (
                <Card key={p.id} className={`p-3.5 flex items-center gap-3 border transition ${corFor(dias)} ${marcado ? 'ring-1 ring-accent-400' : ''}`}>
                  <button
                    onClick={() => alternarSelecao(p.id)}
                    title={marcado ? 'Remover da seleção' : 'Selecionar'}
                    className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition ${
                      marcado ? 'bg-accent-500 border-accent-500 text-base-950' : 'border-base-600 text-transparent hover:border-base-400'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <Link to={`/licitacoes/${p.biddingId}?aba=checklist`} className="flex items-center gap-3 flex-1 min-w-0 hover:brightness-125">
                    <div className="p-2 rounded-lg bg-base-900/60 shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{p.categoria ?? 'Geral'}</span>
                        {p.obrigatorio && <span className="text-[9px] font-bold uppercase tracking-wider text-warning-400">obrigatório</span>}
                      </div>
                      <p className="text-[13px] font-semibold text-base-100 truncate">{p.descricao}</p>
                      <p className="text-[11px] text-base-500 truncate">
                        {p.clientName} — {p.biddingObjeto.slice(0, 60)} ({p.biddingOrgao})
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        <p className="text-[12px] font-bold">{labelDias(dias)}</p>
                        {p.responsavelNome && (
                          <p className="text-[10px] text-base-500 flex items-center justify-end gap-1 mt-0.5">
                            <User className="w-3 h-3" /> {p.responsavelNome}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 opacity-40" />
                    </div>
                  </Link>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Barra de ação em lote — só aparece com 2+ itens marcados, pra não
          competir com o clique normal de abrir uma pendência (com 1 só
          selecionado, ainda compensa mais entrar na licitação e resolver
          direto por lá). */}
      {selecionados.size >= 2 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
          <div className="flex items-center gap-3 bg-base-800 border border-base-700 rounded-xl pl-4 pr-2 py-2 shadow-2xl">
            <span className="text-[12.5px] font-bold text-base-200">{selecionados.size} selecionados</span>
            <Button variant="ghost" onClick={limparSelecao}>Limpar</Button>
            <Button variant="secondary" onClick={() => setMostrarModalNaoAplicavel(true)}>
              <Ban className="w-3.5 h-3.5" /> Marcar não aplicável
            </Button>
          </div>
        </div>
      )}

      <Modal open={mostrarModalNaoAplicavel} onClose={() => setMostrarModalNaoAplicavel(false)} title={`Marcar ${selecionados.size} itens como não aplicável`}>
        <div className="flex flex-col gap-3">
          <p className="text-[12px] text-base-400">
            Usa a mesma justificativa pros {selecionados.size} itens marcados — eles continuam no checklist de cada licitação, só saem da contagem de obrigatórios.
          </p>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Motivo (fica registrado em cada item)</label>
            <Textarea
              value={justificativaLote}
              onChange={(e) => setJustificativaLote(e.target.value)}
              rows={4}
              placeholder="Ex: Não aplicável — a empresa não se enquadra como empresário individual; é sociedade empresária limitada."
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setMostrarModalNaoAplicavel(false)}>Cancelar</Button>
            <Button onClick={handleConfirmarNaoAplicavelLote} disabled={!justificativaLote.trim() || marcarNaoAplicavelEmLote.isPending}>
              <Ban className="w-3.5 h-3.5" /> {marcarNaoAplicavelEmLote.isPending ? 'Salvando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
