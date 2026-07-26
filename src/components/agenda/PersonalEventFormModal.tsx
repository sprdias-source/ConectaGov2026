import { useEffect, useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Textarea, Button } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'

export interface PersonalEventFormValues {
  titulo: string
  descricao: string
  data: string
}

export default function PersonalEventFormModal({
  open, onClose, onSave, onDelete, initial, defaultData, isSaving, isDeleting, error,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: PersonalEventFormValues) => void
  onDelete?: () => void
  initial?: PersonalEventFormValues | null
  defaultData?: string
  isSaving: boolean
  isDeleting?: boolean
  error?: unknown
}) {
  const empty: PersonalEventFormValues = { titulo: '', descricao: '', data: defaultData ?? '' }
  const [form, setForm] = useState<PersonalEventFormValues>(initial ?? empty)

  useEffect(() => {
    if (open) setForm(initial ?? empty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Compromisso' : 'Novo Compromisso'} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Título" required>
          <Input required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex: Reunião com fornecedor" />
        </Field>

        <Field label="Data" required>
          <Input type="date" required value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </Field>

        <Field label="Observações">
          <Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Detalhes do compromisso (opcional)" />
        </Field>

        <ErrorAlert error={error} />

        <div className="flex justify-between gap-2 pt-2">
          {initial && onDelete && (
            <Button type="button" variant="danger" onClick={onDelete} disabled={isDeleting}>
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
