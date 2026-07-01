import { useMemo, useState } from 'react'
import { todayLocalISO } from '../lib/dateUtils'
import { Users, UserPlus, Wallet, CheckCircle2, AlertTriangle, Pencil, Trash2, Landmark } from 'lucide-react'
import { PageHeader, Card, EmptyState, StatusBadge } from '../components/ui/Primitives'
import { Field, Select, Input, Button } from '../components/ui/FormControls'
import { useEmployees } from '../hooks/useEmployees'
import { useTransactions } from '../hooks/useTransactions'
import { formatBRL } from '../hooks/useAccountBalances'
import EmployeeFormModal from '../components/funcionarios/EmployeeFormModal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ErrorAlert from '../components/ui/ErrorAlert'
import type { Employee, Transaction } from '../types/domain'

type Tab = 'folha' | 'quadro'

// Vencimento legal de GPS (INSS), DARF (IRRF) e FGTS Digital: dia 20 do
// mês SEGUINTE ao da competência (ex: competência 2026-06 vence em
// 2026-07-20). Se cair em dia inexistente, não há risco aqui pois dia 20
// existe em todos os meses.
function nextMonthDay20(competencia: string): string {
  const [year, month] = competencia.split('-').map(Number)
  const next = new Date(year, month, 1) // month (0-based) já aponta pro mês seguinte
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-20`
}

export default function FuncionariosPage() {
  const { employees, isLoading, addEmployee, updateEmployee, deleteEmployee } = useEmployees()
  const { transactions, addTransactions, updateTransaction } = useTransactions()
  const [tab, setTab] = useState<Tab>('folha')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [competencia, setCompetencia] = useState(todayLocalISO().slice(0, 7))
  const [bonus, setBonus] = useState(0)
  const [descricao, setDescricao] = useState('Salário Mensal Ref. Competência')

  const activeEmployees = employees.filter((e) => e.isActive)
  const folhaBase = activeEmployees.reduce((s, e) => s + e.salaryBase, 0)

  const competenciaPrefix = competencia
  const payrollTxs = useMemo(
    () => transactions.filter((t) => t.category === 'Folha de Pagamento' || t.category === 'Pró-Labore'),
    [transactions]
  )
  const totalPagoCompetencia = payrollTxs
    .filter((t) => t.status === 'Pago' && t.dueDate.startsWith(competenciaPrefix))
    .reduce((s, t) => s + t.value, 0)
  const totalPendente = payrollTxs.filter((t) => t.status !== 'Pago').reduce((s, t) => s + t.value, 0)

  const encargoCategorias = ['INSS a Recolher (GPS)', 'IRRF a Recolher (DARF)', 'FGTS a Recolher']
  const encargoTxs = useMemo(
    () => transactions.filter((t) => encargoCategorias.includes(t.category)),
    [transactions]
  )
  const totalEncargosPendentes = encargoTxs.filter((t) => t.status !== 'Pago').reduce((s, t) => s + t.value, 0)

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId)

  const handleSaveEmployee = (data: Partial<Employee>) => {
    if (editing) {
      updateEmployee.mutate({ ...editing, ...data } as Employee, { onSuccess: () => { setModalOpen(false); setEditing(null) } })
    } else {
      addEmployee.mutate(data, { onSuccess: () => setModalOpen(false) })
    }
  }

  const handleClosePayroll = () => {
    if (!selectedEmployee) return
    const isProLabore = selectedEmployee.paymentType === 'Sócio/Pró-labore'
    const isCLT = selectedEmployee.paymentType === 'CLT'

    // INSS e IRRF se aplicam a qualquer vínculo com retenção na fonte
    // (Sócio/Pró-labore e CLT) — antes, só calculava para Sócio/Pró-labore,
    // deixando o CLT sem nenhuma retenção, o que não reflete a realidade.
    const temRetencao = isProLabore || isCLT
    const inssValor = temRetencao ? selectedEmployee.salaryBase * (selectedEmployee.inssPercentual / 100) : 0
    const irrfValor = temRetencao ? selectedEmployee.salaryBase * (selectedEmployee.irrfPercentual / 100) : 0
    // FGTS é encargo PATRONAL (a empresa deposita, não desconta do
    // colaborador) — só existe para CLT, nunca para Sócio/Pró-labore,
    // Autônomo ou Estágio (que tem regras próprias, geralmente sem FGTS
    // obrigatório salvo contrato de aprendizagem).
    const fgtsValor = isCLT ? selectedEmployee.salaryBase * 0.08 : 0

    const liquido = selectedEmployee.salaryBase + bonus - inssValor - irrfValor - selectedEmployee.outrosEncargos
    const dueDate = `${competencia}-05`
    const guiasDueDate = nextMonthDay20(competencia)

    const novosLancamentos: Partial<Transaction>[] = [{
      type: 'Pagar',
      category: isProLabore ? 'Pró-Labore' : 'Folha de Pagamento',
      description: `${descricao} — ${selectedEmployee.name} (${competencia})`,
      value: liquido,
      dueDate,
      paymentMethod: 'PIX',
      status: 'Pendente',
    }]

    addTransactions.mutate(novosLancamentos, {
      onSuccess: async () => {
        setBonus(0)
        // Consolida INSS, IRRF e FGTS retidos/devidos numa guia única por
        // competência (soma de todos os colaboradores), em vez de um
        // lançamento por pessoa — assim fica fiel ao funcionamento real
        // da GPS/DARF/FGTS, que são guias mensais consolidadas.
        if (inssValor > 0) await upsertEncargoConsolidado('INSS a Recolher (GPS)', competencia, inssValor, guiasDueDate)
        if (irrfValor > 0) await upsertEncargoConsolidado('IRRF a Recolher (DARF)', competencia, irrfValor, guiasDueDate)
        if (fgtsValor > 0) await upsertEncargoConsolidado('FGTS a Recolher', competencia, fgtsValor, guiasDueDate)
      },
    })
  }

  // Soma o valor do encargo (INSS/IRRF/FGTS) ao lançamento consolidado já
  // existente daquela competência, ou cria um novo se for o primeiro
  // colaborador fechado no mês. Nunca duplica a guia.
  const upsertEncargoConsolidado = async (category: string, competenciaRef: string, valorAdicional: number, dueDate: string) => {
    const existente = transactions.find(
      (t) => t.category === category && t.dueDate === dueDate && t.status !== 'Pago'
    )
    if (existente) {
      updateTransaction.mutate({
        ...existente,
        value: existente.value + valorAdicional,
        description: `${category} — Competência ${competenciaRef} (consolidado)`,
      })
    } else {
      addTransactions.mutate([{
        type: 'Pagar',
        category,
        description: `${category} — Competência ${competenciaRef} (consolidado)`,
        value: valorAdicional,
        dueDate,
        paymentMethod: 'Boleto',
        status: 'Pendente',
      }])
    }
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Pagamento de Funcionários e Assessores"
        subtitle="Controle de folha de pagamento, comissão de assessores, pró-labore operacional de sócios e recolhimento de impostos sociais."
        icon={Users}
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
            <UserPlus className="w-4 h-4" /> Contratar / Novo Staff
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 px-6 mt-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Quadro Ativo</p>
          <p className="text-xl font-extrabold text-base-100">{activeEmployees.length} Colaboradores</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Folha Base Mensal</p>
          <p className="text-xl font-extrabold font-mono text-accent-300">{formatBRL(folhaBase)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Pago na Competência</p>
          <p className="text-xl font-extrabold font-mono text-positive-400">{formatBRL(totalPagoCompetencia)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Dispêndio Pendente</p>
          <p className="text-xl font-extrabold font-mono text-warning-400">{formatBRL(totalPendente)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Encargos a Recolher</p>
          <p className="text-xl font-extrabold font-mono text-negative-300">{formatBRL(totalEncargosPendentes)}</p>
          <p className="text-[10px] text-base-500 mt-1">INSS + IRRF + FGTS pendentes</p>
        </Card>
      </div>

      <div className="px-6 mt-5">
        <div className="flex gap-1.5 border-b border-base-800 mb-5">
          <button onClick={() => setTab('folha')} className={`px-4 py-2.5 text-[13px] font-semibold transition border-b-2 -mb-px ${tab === 'folha' ? 'text-accent-300 border-accent-400' : 'text-base-400 border-transparent'}`}>
            Lançamento de Folha & Comissões
          </button>
          <button onClick={() => setTab('quadro')} className={`px-4 py-2.5 text-[13px] font-semibold transition border-b-2 -mb-px ${tab === 'quadro' ? 'text-accent-300 border-accent-400' : 'text-base-400 border-transparent'}`}>
            Quadro de Colaboradores
          </button>
        </div>

        {tab === 'folha' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-sm font-bold text-base-100 mb-1">Fechar Pagamento Mensal Individual</h3>
              <p className="text-[12px] text-base-500 mb-4">Gere e ordene o pagamento de salários fixos do mês, adicionando eventuais prêmios de produtividade.</p>
              <div className="flex flex-col gap-4">
                <Field label="Selecionar Colaborador" required>
                  <Select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
                    <option value="">Selecione o funcionário do quadro...</option>
                    {activeEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Competência" required>
                    <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
                  </Field>
                  <Field label="Bônus / Comissão Extra (R$)">
                    <Input type="number" step="0.01" value={bonus || ''} onChange={(e) => setBonus(parseFloat(e.target.value) || 0)} placeholder="Ex: 500.00" />
                  </Field>
                </div>
                <Field label="Descrição no Extrato">
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                </Field>
                {selectedEmployee && (() => {
                  const isProLabore = selectedEmployee.paymentType === 'Sócio/Pró-labore'
                  const isCLT = selectedEmployee.paymentType === 'CLT'
                  const temRetencao = isProLabore || isCLT
                  const inssValor = temRetencao ? selectedEmployee.salaryBase * (selectedEmployee.inssPercentual / 100) : 0
                  const irrfValor = temRetencao ? selectedEmployee.salaryBase * (selectedEmployee.irrfPercentual / 100) : 0
                  const fgtsValor = isCLT ? selectedEmployee.salaryBase * 0.08 : 0
                  const liquido = selectedEmployee.salaryBase + bonus - inssValor - irrfValor - selectedEmployee.outrosEncargos
                  const guiasDueDate = nextMonthDay20(competencia)

                  return (
                    <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[12px] text-base-300">Líquido a pagar ao colaborador</span>
                        <span className="font-mono font-extrabold text-accent-300">{formatBRL(liquido)}</span>
                      </div>
                      {(inssValor > 0 || irrfValor > 0 || fgtsValor > 0) && (
                        <div className="border-t border-accent-500/20 pt-2 mt-1 flex flex-col gap-1.5">
                          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
                            Guias geradas automaticamente · vencimento {new Date(guiasDueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </p>
                          {inssValor > 0 && (
                            <div className="flex justify-between text-[12px]">
                              <span className="text-base-400">INSS a Recolher (GPS)</span>
                              <span className="font-mono text-base-200">{formatBRL(inssValor)}</span>
                            </div>
                          )}
                          {irrfValor > 0 && (
                            <div className="flex justify-between text-[12px]">
                              <span className="text-base-400">IRRF a Recolher (DARF)</span>
                              <span className="font-mono text-base-200">{formatBRL(irrfValor)}</span>
                            </div>
                          )}
                          {fgtsValor > 0 && (
                            <div className="flex justify-between text-[12px]">
                              <span className="text-base-400">FGTS a Recolher</span>
                              <span className="font-mono text-base-200">{formatBRL(fgtsValor)}</span>
                            </div>
                          )}
                          <p className="text-[10px] text-base-500 mt-0.5">
                            Se outro colaborador já fechou a folha nesta competência, os valores são somados na mesma guia — não duplica.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })()}
                <Button onClick={handleClosePayroll} disabled={!selectedEmployee || addTransactions.isPending}>
                  {addTransactions.isPending ? 'Lançando...' : 'Lançar no Financeiro'}
                </Button>
                <ErrorAlert error={addTransactions.error} />
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-bold text-base-100 mb-1">Histórico Geral de Pagamento de Equipe e Pró-Labores</h3>
              <p className="text-[12px] text-base-500 mb-4">Todas as faturas, salários e bônus lançados diretamente no fluxo financeiro.</p>
              {payrollTxs.length === 0 ? (
                <EmptyState icon={Wallet} title="Nenhum pagamento de folha registrado ainda" description="Utilize o painel ao lado para lançar o salário mensal de um assessor." />
              ) : (
                <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto">
                  {payrollTxs.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 bg-base-850/60 rounded-lg px-3 py-2.5">
                      <div className="min-w-0 flex items-center gap-2">
                        {t.status === 'Pago' ? <CheckCircle2 className="w-3.5 h-3.5 text-positive-400 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-warning-400 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-base-200 truncate">{t.description}</p>
                          <p className="text-[10px] text-base-500">{new Date(t.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[12px] text-base-200 shrink-0">{formatBRL(t.value)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-base-800 mt-4 pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <Landmark className="w-3.5 h-3.5 text-negative-300" />
                  <h4 className="text-[13px] font-bold text-base-100">Guias de Encargos (INSS · IRRF · FGTS)</h4>
                </div>
                <p className="text-[11px] text-base-500 mb-3">Consolidadas por competência — recolhimento separado do pagamento ao colaborador, vencendo dia 20 do mês seguinte.</p>
                {encargoTxs.length === 0 ? (
                  <p className="text-[12px] text-base-500 italic py-2">Nenhuma guia gerada ainda.</p>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto">
                    {encargoTxs.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 bg-negative-500/5 border border-negative-500/15 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-base-200 truncate">{t.description}</p>
                          <p className="text-[10px] text-base-500">Vence {new Date(t.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-[12px] text-negative-300">{formatBRL(t.value)}</span>
                          <StatusBadge status={t.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        ) : (
          <>
            <ErrorAlert error={deleteEmployee.error} />
            <Card className="overflow-hidden">
            {isLoading ? (
              <div className="p-10 text-center text-base-500 text-sm">Carregando colaboradores...</div>
            ) : employees.length === 0 ? (
              <EmptyState icon={Users} title="Nenhum colaborador cadastrado" description="Contrate seu primeiro colaborador para começar a gerenciar a equipe." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-800 text-left">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Nome</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Cargo</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Vínculo</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Salário Base</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => (
                      <tr key={e.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                        <td className="px-4 py-3 font-semibold text-base-100">{e.name}</td>
                        <td className="px-4 py-3 text-base-300 text-[13px]">{e.role || '—'}</td>
                        <td className="px-4 py-3 text-base-400 text-[12px]">{e.paymentType}</td>
                        <td className="px-4 py-3 text-right font-mono text-base-200 text-[13px]">{formatBRL(e.salaryBase)}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => { setEditing(e); setModalOpen(true) }} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition mr-1">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleting(e)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          </>
        )}
      </div>

      <EmployeeFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSaveEmployee}
        initial={editing}
        isSaving={addEmployee.isPending || updateEmployee.isPending}
        error={addEmployee.error || updateEmployee.error}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Remover colaborador?"
        description={`Tem certeza que deseja remover "${deleting?.name}" do quadro?`}
        confirmLabel="Remover"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteEmployee.mutate(deleting, { onSuccess: () => setDeleting(null) }) }}
        isLoading={deleteEmployee.isPending}
      />
    </div>
  )
}
