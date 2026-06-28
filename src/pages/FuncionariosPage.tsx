import { useMemo, useState } from 'react'
import { Users, UserPlus, Wallet, CheckCircle2, AlertTriangle, Pencil, Trash2 } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { Field, Select, Input, Button } from '../components/ui/FormControls'
import { useEmployees } from '../hooks/useEmployees'
import { useTransactions } from '../hooks/useTransactions'
import { formatBRL } from '../hooks/useAccountBalances'
import EmployeeFormModal from '../components/funcionarios/EmployeeFormModal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import type { Employee } from '../types/domain'

type Tab = 'folha' | 'quadro'

export default function FuncionariosPage() {
  const { employees, isLoading, addEmployee, updateEmployee, deleteEmployee } = useEmployees()
  const { transactions, addTransactions } = useTransactions()
  const [tab, setTab] = useState<Tab>('folha')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7))
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
    const inssValor = isProLabore ? selectedEmployee.salaryBase * (selectedEmployee.inssPercentual / 100) : 0
    const irrfValor = isProLabore ? selectedEmployee.salaryBase * (selectedEmployee.irrfPercentual / 100) : 0
    const liquido = selectedEmployee.salaryBase + bonus - inssValor - irrfValor - selectedEmployee.outrosEncargos
    const dueDate = `${competencia}-05`
    addTransactions.mutate([{
      type: 'Pagar',
      category: isProLabore ? 'Pró-Labore' : 'Folha de Pagamento',
      description: `${descricao} — ${selectedEmployee.name} (${competencia})`,
      value: liquido,
      dueDate,
      paymentMethod: 'PIX',
      status: 'Pendente',
    }], {
      onSuccess: () => {
        setBonus(0)
      },
    })
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 mt-4">
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
                {selectedEmployee && (
                  <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 flex justify-between items-center">
                    <span className="text-[12px] text-base-300">Total a lançar</span>
                    <span className="font-mono font-extrabold text-accent-300">{formatBRL(selectedEmployee.salaryBase + bonus)}</span>
                  </div>
                )}
                <Button onClick={handleClosePayroll} disabled={!selectedEmployee || addTransactions.isPending}>
                  {addTransactions.isPending ? 'Lançando...' : 'Lançar no Financeiro'}
                </Button>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-bold text-base-100 mb-1">Histórico Geral de Pagamento de Equipe e Pró-Labores</h3>
              <p className="text-[12px] text-base-500 mb-4">Todas as faturas, salários e bônus lançados diretamente no fluxo financeiro.</p>
              {payrollTxs.length === 0 ? (
                <EmptyState icon={Wallet} title="Nenhum pagamento de folha registrado ainda" description="Utilize o painel ao lado para lançar o salário mensal de um assessor." />
              ) : (
                <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto">
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
            </Card>
          </div>
        ) : (
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
        )}
      </div>

      <EmployeeFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSaveEmployee}
        initial={editing}
        isSaving={addEmployee.isPending || updateEmployee.isPending}
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
