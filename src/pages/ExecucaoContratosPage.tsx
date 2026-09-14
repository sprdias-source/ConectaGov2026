import { useState, useEffect, useMemo } from 'react'
import { ClipboardCheck, Plus, CheckCircle2, Circle, Trash2, ChevronDown, ChevronUp, Ban } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { SkeletonList } from '../components/ui/Skeleton'
import { Button, Input } from '../components/ui/FormControls'
import { useContractMarcos, useContractMarcosPorContratos } from '../hooks/useContractMarcos'
import { useClients } from '../hooks/useClients'
import { useBiddings } from '../hooks/useBiddings'
import { useContracts, calcContratoStatus } from '../hooks/useContracts'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import { supabase } from '../lib/supabase'
import { fromContractRow } from '../lib/mappers'
import { todayLocalISO } from '../lib/dateUtils'
import type { Contract, ContractMarco, Bidding } from '../types/domain'

// Barra de vigência só faz sentido pra Mensalista (tem início/término em
// meses); Individual não tem prazo em meses — o "mês atual" aqui é só uma
// leitura visual de progresso, nunca usado pra decidir o status (isso é
// sempre calcContratoStatus).
function progressoVigencia(dataInicio: string, vigenciaMeses: number): { percent: number; mesAtual: number } {
  const inicio = new Date(dataInicio + 'T00:00:00')
  const hoje = new Date(todayLocalISO() + 'T00:00:00')
  const diasTotais = vigenciaMeses * 30.44
  const diasPassados = Math.max(0, (hoje.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24))
  const percent = Math.min(100, Math.max(0, (diasPassados / diasTotais) * 100))
  const mesAtual = Math.min(vigenciaMeses, Math.max(1, Math.ceil(diasPassados / 30.44) || 1))
  return { percent, mesAtual }
}

function StatusVigenciaContrato({ contrato, bidding, podeEditar, onRescindir }: {
  contrato: Contract; bidding: Bidding | null; podeEditar: boolean; onRescindir: () => void
}) {
  const status = calcContratoStatus(contrato, bidding)

  if (status.tipo === 'rescindido') {
    return <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-base-800 text-base-400">Rescindido</span>
  }

  if (status.tipo === 'sem_vigencia') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-base-500 italic">Sem vigência definida</span>
        {podeEditar && (
          <button onClick={onRescindir} title="Marcar como rescindido" className="p-1 text-base-500 hover:text-negative-400 transition">
            <Ban className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )
  }

  if (status.tipo === 'licitacao') {
    const info: Record<Bidding['status'], { label: string; cls: string }> = {
      'Em Andamento': { label: 'Aguardando resultado da licitação', cls: 'bg-accent-500/10 text-accent-300' },
      'Ganhou': { label: 'Concluído — Êxito', cls: 'bg-positive-500/10 text-positive-400' },
      'Perdeu': { label: 'Concluído — Sem êxito', cls: 'bg-base-800 text-base-400' },
      'Cancelada': { label: 'Licitação cancelada', cls: 'bg-warning-500/10 text-warning-400' },
      'Desistiu': { label: 'Licitação desistida', cls: 'bg-warning-500/10 text-warning-400' },
    }
    const { label, cls } = info[status.biddingStatus]
    return (
      <div className="flex items-center gap-2">
        <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
        {podeEditar && (
          <button onClick={onRescindir} title="Marcar como rescindido" className="p-1 text-base-500 hover:text-negative-400 transition">
            <Ban className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )
  }

  // ativo | vencendo | vencido
  const { percent, mesAtual } = progressoVigencia(contrato.dataInicio!, contrato.vigenciaMeses!)
  const corBarra = status.tipo === 'vencido' ? 'bg-negative-500' : status.tipo === 'vencendo' ? 'bg-warning-500' : 'bg-positive-500'
  const pillCls = status.tipo === 'vencido' ? 'bg-negative-500/10 text-negative-400' : status.tipo === 'vencendo' ? 'bg-warning-500/10 text-warning-400' : 'bg-positive-500/10 text-positive-400'
  const pillLabel = status.tipo === 'vencido' ? `Vencido há ${Math.abs(status.diasParaTermino)} dias` : status.tipo === 'vencendo' ? `Vencendo — ${status.diasParaTermino} dias` : `Ativo — ${status.diasParaTermino} dias`

  return (
    <div className="flex items-center gap-3 flex-1 min-w-[220px]">
      <div className="flex-1 flex flex-col gap-1">
        <div className="h-1.5 rounded-full bg-base-800 overflow-hidden">
          <div className={`h-full rounded-full ${corBarra}`} style={{ width: `${percent}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-base-500 font-mono">
          <span>{new Date(contrato.dataInicio! + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
          <span>Mês {mesAtual} de {contrato.vigenciaMeses}</span>
          <span>{new Date(status.termino + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${pillCls}`}>{pillLabel}</span>
        {podeEditar && (
          <button onClick={onRescindir} title="Marcar como rescindido" className="p-1 text-base-500 hover:text-negative-400 transition">
            <Ban className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function ContratoCard({ contrato, clientName, bidding, podeEditar, marcos, onRescindir }: {
  contrato: Contract; clientName: string; bidding: Bidding | null; podeEditar: boolean; marcos: ContractMarco[]; onRescindir: () => void
}) {
  // Só usa este hook pelas mutations — a leitura vem pronta via prop
  // (useContractMarcosPorContratos, uma query só pra todos os contratos da
  // página, em vez de cada card buscar os próprios marcos sozinho).
  const { addMarco, concluirMarco, deleteMarco } = useContractMarcos(contrato.id, { habilitarLeitura: false })
  const [aberto, setAberto] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ descricao: '', dataPrevista: '', valor: '' })

  const hoje = todayLocalISO()
  const statusReal = (m: ContractMarco): 'Pendente' | 'Concluído' | 'Atrasado' => {
    if (m.status === 'Concluído') return 'Concluído'
    if (m.dataPrevista && m.dataPrevista < hoje) return 'Atrasado'
    return 'Pendente'
  }

  const totalMarcos = marcos.length
  const concluidos = marcos.filter((m) => m.status === 'Concluído').length

  const handleSalvar = async () => {
    if (!form.descricao.trim()) return
    await addMarco.mutateAsync({
      descricao: form.descricao.trim(),
      dataPrevista: form.dataPrevista || null,
      valor: form.valor ? parseFloat(form.valor) : null,
    })
    setForm({ descricao: '', dataPrevista: '', valor: '' })
    setShowForm(false)
  }

  return (
    <Card className="overflow-hidden">
      <div className="w-full flex items-center gap-3 px-4 py-3 flex-wrap">
        <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-3 text-left shrink-0" style={{ minWidth: 200 }}>
          <ClipboardCheck className="w-4 h-4 text-accent-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-base-200">{clientName}</p>
            <p className="text-[11px] text-base-500">
              {totalMarcos > 0 ? `${concluidos}/${totalMarcos} marcos concluídos` : 'Nenhum marco cadastrado ainda'}
            </p>
          </div>
        </button>
        <StatusVigenciaContrato contrato={contrato} bidding={bidding} podeEditar={podeEditar} onRescindir={onRescindir} />
        <button onClick={() => setAberto((v) => !v)} className="shrink-0">
          {aberto ? <ChevronUp className="w-4 h-4 text-base-500" /> : <ChevronDown className="w-4 h-4 text-base-500" />}
        </button>
      </div>

      {aberto && (
        <div className="border-t border-base-800 px-4 py-3 flex flex-col gap-2">
          {marcos.map((m) => {
            const status = statusReal(m)
            return (
              <div key={m.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2">
                {status === 'Concluído' || !podeEditar ? (
                  status === 'Concluído'
                    ? <CheckCircle2 className="w-4 h-4 text-positive-400 shrink-0" />
                    : <Circle className={`w-4 h-4 shrink-0 ${status === 'Atrasado' ? 'text-negative-400' : 'text-base-700'}`} />
                ) : (
                  <button onClick={() => concluirMarco.mutate(m)} title="Marcar como concluído">
                    <Circle className={`w-4 h-4 shrink-0 transition ${status === 'Atrasado' ? 'text-negative-400' : 'text-base-600 hover:text-base-400'}`} />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-base-200 truncate">{m.descricao}</p>
                  <p className="text-[10px] text-base-500">
                    {m.dataPrevista && `Previsto: ${new Date(m.dataPrevista + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                    {m.dataRealizada && ` — Concluído: ${new Date(m.dataRealizada + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                    {m.valor !== null && ` — R$ ${m.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  </p>
                </div>
                {podeEditar && (
                  <button onClick={() => deleteMarco.mutate(m)} className="p-1 text-base-500 hover:text-negative-400 transition shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}

          {podeEditar && (showForm ? (
            <div className="bg-base-900/40 border border-accent-500/20 rounded-lg p-3 flex flex-col gap-2">
              <Input placeholder="Ex: Entrega da 1ª etapa, Medição de junho..." value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={form.dataPrevista} onChange={(e) => setForm({ ...form, dataPrevista: e.target.value })} />
                <Input type="number" step="0.01" placeholder="Valor (opcional)" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button onClick={handleSalvar} disabled={!form.descricao.trim() || addMarco.isPending}>
                  {addMarco.isPending ? 'Salvando...' : 'Adicionar Marco'}
                </Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-[11px] font-semibold text-accent-300 hover:text-accent-200 self-start">
              <Plus className="w-3 h-3" /> Adicionar marco (entrega/medição)
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function ExecucaoContratosPage() {
  const { clients } = useClients()
  const { biddings } = useBiddings()
  const { updateContractStatus } = useContracts()
  // 'contratos' — igual ContratosPage.tsx (mesmo domínio funcional). Antes
  // essa tela checava 'cadastros' por engano: um admin que só desse
  // "edição" em Contratos (sem mexer em Cadastros) não conseguia gerenciar
  // marcos de execução, e o inverso também acontecia.
  const { nivel: nivelCadastros, carregando: carregandoPermissao } = usePermissaoFerramenta('contratos')
  const podeEditar = nivelCadastros === 'edicao' && !carregandoPermissao
  const [contratos, setContratos] = useState<Contract[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    const carregar = async () => {
      const { data, error } = await supabase.from('contracts').select('*').order('created_at', { ascending: false })
      if (!cancelado && !error && data) {
        setContratos(data.map(fromContractRow))
      }
      if (!cancelado) setIsLoading(false)
    }
    carregar()
    return () => { cancelado = true }
  }, [])

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'
  const biddingDe = (id: string | null) => biddings.find((b) => b.id === id) ?? null

  const rescindirContrato = (contrato: Contract) => {
    if (!window.confirm('Marcar este contrato como rescindido?')) return
    updateContractStatus.mutate(
      { contract: contrato, newStatus: 'rescindido' },
      { onSuccess: (updated) => setContratos((cs) => cs.map((c) => (c.id === updated.id ? updated : c))) }
    )
  }

  const contratoIds = useMemo(() => contratos.map((c) => c.id), [contratos])
  const { marcosPorContrato } = useContractMarcosPorContratos(contratoIds)

  return (
    <div className="pb-10">
      <PageHeader
        title="Execução de Contratos"
        subtitle="Cronograma, entregas e medições de cada contrato — o que acontece depois de ganhar a licitação"
        icon={ClipboardCheck}
      />

      <div className="px-6 mt-4">
        {isLoading ? (
          <SkeletonList itens={3} />
        ) : contratos.length === 0 ? (
          <Card>
            <EmptyState icon={ClipboardCheck} title="Nenhum contrato cadastrado" description="Cadastre um contrato na aba de Contratos pra começar a acompanhar a execução dele aqui." />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {contratos.map((c) => (
              <ContratoCard
                key={c.id}
                contrato={c}
                clientName={clientName(c.clientId)}
                bidding={biddingDe(c.biddingId)}
                podeEditar={podeEditar}
                marcos={marcosPorContrato.get(c.id) ?? []}
                onRescindir={() => rescindirContrato(c)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
