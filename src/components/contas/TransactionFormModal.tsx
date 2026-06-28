import { useEffect, useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Select, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import type { Transaction, TransactionType } from '../../types/domain'
import type { Client } from '../../types/domain'
import type { FinancialAccount } from '../../types/domain'

const PAYMENT_METHODS = ['PIX', 'Boleto', 'Transferência', 'Dinheiro', 'Cartão']

const emptyForm = (categoriesReceber: string[]): Partial<Transaction> => ({
  type: 'Receber',
  category: categoriesReceber[0] ?? '',
  description: '',
  value: 0,
  dueDate: new Date().toISOString().slice(0, 10),
  paymentMethod: 'PIX',
  status: 'Pendente',
  isRecurring: false,
})

export default function TransactionFormModal({
  open, onClose, onSave, initial, clients, accounts, categoriesPagar, categoriesReceber, isSaving,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Transaction>) => void
  initial?: Transaction | null
  clients: Client[]
  accounts: FinancialAccount[]
  categoriesPagar: string[]
  categoriesReceber: string[]
  isSaving: boolean
}) {
  const [form, setForm] = useState<Partial<Transaction>>(() => emptyForm(categoriesReceber))

  // CORREÇÃO DE BUG (mesmo padrão dos outros modais): garante que o
  // formulário sempre reflita o registro atual ao reabrir o modal.
  useEffect(() => {
    if (open) setForm(initial ?? emptyForm(categoriesReceber))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  const categories = form.type === 'Pagar' ? categoriesPagar : categoriesReceber

  const handleTypeChange = (type: TransactionType) => {
    const newCats = type === 'Pagar' ? categoriesPagar : categoriesReceber
    setForm({ ...form, type, category: newCats[0] ?? '' })
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const dueDate = form.dueDate ?? new Date().toISOString().slice(0, 10)
    onSave({ ...form, recurringDay: form.isRecurring ? Number(dueDate.slice(8, 10)) : null })
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Lançamento' : 'Novo Lançamento'} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex bg-base-850 border border-base-700 rounded-lg p-1">
          {(['Receber', 'Pagar'] as TransactionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTypeChange(t)}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition ${
                form.type === t
                  ? t === 'Receber' ? 'bg-positive-500/20 text-positive-400' : 'bg-negative-500/20 text-negative-400'
                  : 'text-base-400'
              }`}
            >
              {t === 'Receber' ? 'A Receber' : 'A Pagar'}
            </button>
          ))}
        </div>

        <Field label="Categoria" required>
          <Select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>

        <Field label="Descrição" required>
          <Input required value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição do lançamento" />
        </Field>

        {form.type === 'Receber' && (
          <Field label="Cliente">
            <Select value={form.clientId ?? ''} onChange={(e) => setForm({ ...form, clientId: e.target.value || null })}>
              <option value="">Sem cliente vinculado</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor (R$)" required>
            <CurrencyInput value={form.value ?? 0} onChange={(v) => setForm({ ...form, value: v })} required />
          </Field>
          <Field label="Vencimento" required>
            <Input type="date" required value={form.dueDate ?? ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Forma de Pagamento">
            <Select value={form.paymentMethod ?? 'PIX'} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Conta Vinculada">
            <Select value={form.accountId ?? ''} onChange={(e) => setForm({ ...form, accountId: e.target.value || null })}>
              <option value="">Não definida</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer bg-base-850/60 border border-base-700/50 rounded-lg p-3">
          <input
            type="checkbox"
            checked={form.isRecurring ?? false}
            onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
            className="w-4 h-4 rounded accent-accent-500"
          />
          <div>
            <span className="text-sm font-semibold text-base-200 block">Repetir todo mês</span>
            <span className="text-[11px] text-base-500">Ao vencer esta parcela, o sistema cria automaticamente a do mês seguinte como pendente.</span>
          </div>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Lançamento'}</Button>
        </div>
      </form>
    </Modal>
  )
}
