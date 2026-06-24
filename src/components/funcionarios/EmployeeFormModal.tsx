import { useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Select, Button } from '../ui/FormControls'
import type { Employee, PaymentType } from '../../types/domain'

const PAYMENT_TYPES: PaymentType[] = ['CLT', 'PJ', 'Autônomo', 'Estágio']

export default function EmployeeFormModal({
  open, onClose, onSave, initial, isSaving,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Employee>) => void
  initial?: Employee | null
  isSaving: boolean
}) {
  const [form, setForm] = useState<Partial<Employee>>(() => initial ?? {
    name: '', role: '', paymentType: 'PJ', salaryBase: 0, pixKey: '', email: '', phone: '',
    admissionDate: new Date().toISOString().slice(0, 10), isActive: true,
  })

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
          <Field label="Salário Base (R$)" required>
            <Input type="number" step="0.01" required value={form.salaryBase ?? ''} onChange={(e) => setForm({ ...form, salaryBase: parseFloat(e.target.value) || 0 })} />
          </Field>
        </div>
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
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Colaborador'}</Button>
        </div>
      </form>
    </Modal>
  )
}
