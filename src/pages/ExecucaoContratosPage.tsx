import { useState, useEffect } from 'react'
import { ClipboardCheck, Plus, CheckCircle2, Circle, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { Button, Input } from '../components/ui/FormControls'
import { useContractMarcos } from '../hooks/useContractMarcos'
import { useClients } from '../hooks/useClients'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import { supabase } from '../lib/supabase'
import { fromContractRow } from '../lib/mappers'
import { todayLocalISO } from '../lib/dateUtils'
import type { Contract, ContractMarco } from '../types/domain'

function ContratoCard({ contrato, clientName, podeEditar }: { contrato: Contract; clientName: string; podeEditar: boolean }) {
  const { marcos, addMarco, concluirMarco, deleteMarco } = useContractMarcos(contrato.id)
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
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <ClipboardCheck className="w-4 h-4 text-accent-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-base-200">{clientName}</p>
          <p className="text-[11px] text-base-500">
            {totalMarcos > 0 ? `${concluidos}/${totalMarcos} marcos concluídos` : 'Nenhum marco cadastrado ainda'}
          </p>
        </div>
        {aberto ? <ChevronUp className="w-4 h-4 text-base-500" /> : <ChevronDown className="w-4 h-4 text-base-500" />}
      </button>

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
  const { nivel: nivelCadastros } = usePermissaoFerramenta('cadastros')
  const podeEditar = nivelCadastros === 'edicao'
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

  return (
    <div className="pb-10">
      <PageHeader
        title="Execução de Contratos"
        subtitle="Cronograma, entregas e medições de cada contrato — o que acontece depois de ganhar a licitação"
        icon={ClipboardCheck}
      />

      <div className="px-6 mt-4">
        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando contratos...</div>
        ) : contratos.length === 0 ? (
          <Card>
            <EmptyState icon={ClipboardCheck} title="Nenhum contrato cadastrado" description="Cadastre um contrato na aba de Contratos pra começar a acompanhar a execução dele aqui." />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {contratos.map((c) => (
              <ContratoCard key={c.id} contrato={c} clientName={clientName(c.clientId)} podeEditar={podeEditar} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
