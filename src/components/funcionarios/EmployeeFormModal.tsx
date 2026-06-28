import { useEffect, useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Select, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import type { Employee, PaymentType } from '../../types/domain'
import { formatBRL } from '../../hooks/useAccountBalances'

const PAYMENT_TYPES: PaymentType[] = ['CLT', 'PJ', 'Autônomo', 'Estágio', 'Sócio/Pró-labore']

const emptyForm: Partial<Employee> = {
  name: '', role: '', paymentType: 'PJ', salaryBase: 0, pixKey: '', email: '', phone: '',
  admissionDate: new Date().toISOString().slice(0, 10), isActive: true,
  inssPercentual: 11, irrfPercentual: 0, outrosEncargos: 0,
}

export default function EmployeeFormModal({
  open, onClose, onSave, initial, isSaving, error,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Employee>) => void
  initial?: Employee | null
  isSaving: boolean
  error?: unknown
}) {
  const [form, setForm] = useState<Partial<Employee>>(initial ?? emptyForm)

  useEffect(() => {
    if (open) setForm(initial ?? emptyForm)
  }, [open, initial])

  const isProLabore = form.paymentType === 'Sócio/Pró-labore'
  const inssValor = isProLabore ? (form.salaryBase ?? 0) * ((form.inssPercentual ?? 0) / 100) : 0
  const irrfValor = isProLabore ? (form.salaryBase ?? 0) * ((form.irrfPercentual ?? 0) / 100) : 0
  const liquido = (form.salaryBase ?? 0) - inssValor - irrfValor - (form.outrosEncargos ?? 0)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Colaborador' : 'Novo Colaborador'} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nome Completo" required>
          <Input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Cargo / Função">
          <Input value={form.role ?? ''} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Ex: Assessor de Licitações" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de Vínculo" required>
            <Select required value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value as PaymentType })}>
              {PAYMENT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label={isProLabore ? 'Pró-Labore Bruto (R$)' : 'Salário Base (R$)'} required>
            <CurrencyInput value={form.salaryBase ?? 0} onChange={(v) => setForm({ ...form, salaryBase: v })} />
          </Field>
        </div>

        {isProLabore && (
          <div className="bg-base-850/60 border border-base-700/50 rounded-lg p-4 flex flex-col gap-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-base-400">Encargos sobre Pró-Labore</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="INSS (%)">
                <Input type="number" step="0.01" value={form.inssPercentual ?? 11} onChange={(e) => setForm({ ...form, inssPercentual: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="IRRF (%)">
                <Input type="number" step="0.01" value={form.irrfPercentual ?? 0} onChange={(e) => setForm({ ...form, irrfPercentual: parseFloat(e.target.value) || 0 })} />
              </Field>
            </div>
            <Field label="Outros Encargos / Descontos (R$)">
              <CurrencyInput value={form.outrosEncargos ?? 0} onChange={(v) => setForm({ ...form, outrosEncargos: v })} />
            </Field>
            <div className="border-t border-base-700 pt-3 flex flex-col gap-1 text-[12px]">
              <div className="flex justify-between text-base-400">
                <span>INSS retido</span>
                <span className="font-mono">{formatBRL(inssValor)}</span>
              </div>
              <div className="flex justify-between text-base-400">
                <span>IRRF retido</span>
                <span className="font-mono">{formatBRL(irrfValor)}</span>
              </div>
              <div className="flex justify-between font-bold text-positive-400 pt-1 border-t border-base-800">
                <span>Valor Líquido a Pagar</span>
                <span className="font-mono">{formatBRL(liquido)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="E-mail">
            <Input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Chave PIX">
          <Input value={form.pixKey ?? ''} onChange={(e) => setForm({ ...form, pixKey: e.target.value })} />
        </Field>
        <Field label="Data de Admissão">
          <Input type="date" value={form.admissionDate ?? ''} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} />
        </Field>
        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Colaborador'}</Button>
        </div>
      </form>
    </Modal>
  )
}
