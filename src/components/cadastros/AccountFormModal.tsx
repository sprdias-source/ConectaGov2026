import { useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Select, Button } from '../ui/FormControls'
import type { FinancialAccount, FinancialAccountType } from '../../types/domain'

const TYPES: { value: FinancialAccountType; label: string }[] = [
  { value: 'CORRENTE', label: 'Conta Corrente' },
  { value: 'POUPANCA', label: 'Conta Poupança' },
  { value: 'CARTEIRA', label: 'Carteira (Dinheiro)' },
  { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
]

export default function AccountFormModal({
  open, onClose, onSave, initial, isSaving,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<FinancialAccount>) => void
  initial?: FinancialAccount | null
  isSaving: boolean
}) {
  const [form, setForm] = useState<Partial<FinancialAccount>>(() => initial ?? {
    name: '', type: 'CORRENTE', bankName: '', startingBalance: 0, creditLimit: undefined,
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Conta' : 'Nova Conta ou Cartão'} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nome da Conta" required>
          <Input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Banco do Brasil" />
        </Field>

        <Field label="Tipo" required>
          <Select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FinancialAccountType })}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>

        <Field label="Banco / Instituição">
          <Input value={form.bankName ?? ''} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Ex: Sicredi" />
        </Field>

        <Field label={form.type === 'CARTAO_CREDITO' ? 'Fatura Inicial (R$)' : 'Saldo Inicial (R$)'} required>
          <Input type="number" step="0.01" required value={form.startingBalance ?? 0} onChange={(e) => setForm({ ...form, startingBalance: parseFloat(e.target.value) || 0 })} />
        </Field>

        {form.type === 'CARTAO_CREDITO' && (
          <Field label="Limite do Cartão (R$)">
            <Input type="number" step="0.01" value={form.creditLimit ?? ''} onChange={(e) => setForm({ ...form, creditLimit: parseFloat(e.target.value) || undefined })} />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Conta'}</Button>
        </div>
      </form>
    </Modal>
  )
}
