import { useEffect, useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Select, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import type { FinancialAccount, FinancialAccountType } from '../../types/domain'

const TYPES: { value: FinancialAccountType; label: string }[] = [
  { value: 'CORRENTE', label: 'Conta Corrente' },
  { value: 'POUPANCA', label: 'Conta Poupança' },
  { value: 'CARTEIRA', label: 'Carteira (Dinheiro)' },
  { value: 'CARTAO_CREDITO', label: 'Cartão de Crédito' },
]

const emptyForm: Partial<FinancialAccount> = {
  name: '', type: 'CORRENTE', bankName: '', startingBalance: 0, creditLimit: undefined,
}

export default function AccountFormModal({
  open, onClose, onSave, initial, isSaving, error,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<FinancialAccount>) => void
  initial?: FinancialAccount | null
  isSaving: boolean
  error?: unknown
}) {
  const [form, setForm] = useState<Partial<FinancialAccount>>(initial ?? emptyForm)

  // CORREÇÃO DE BUG (mesmo padrão dos demais formulários): sem isso, ao
  // editar a conta B depois de ter editado a conta A, o formulário
  // continuaria mostrando os dados de A.
  useEffect(() => {
    if (open) setForm(initial ?? emptyForm)
  }, [open, initial])

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

        <Field label={form.type === 'CARTAO_CREDITO' ? 'Fatura Inicial (R$)' : 'Saldo Inicial (R$)'}>
          <CurrencyInput value={form.startingBalance ?? 0} onChange={(v) => setForm({ ...form, startingBalance: v })} />
          <p className="text-[11px] text-base-500 mt-1">Pode deixar zerado e iniciar o controle a partir de agora.</p>
        </Field>

        {form.type === 'CARTAO_CREDITO' && (
          <Field label="Limite do Cartão (R$)">
            <CurrencyInput value={form.creditLimit ?? 0} onChange={(v) => setForm({ ...form, creditLimit: v || undefined })} />
          </Field>
        )}

        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Conta'}</Button>
        </div>
      </form>
    </Modal>
  )
}
