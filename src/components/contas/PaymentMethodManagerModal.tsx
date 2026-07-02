import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import Modal from '../ui/Modal'
import { Input, Button } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import ConfirmDialog from '../ui/ConfirmDialog'
import { usePaymentMethods } from '../../hooks/usePaymentMethods'
import type { PaymentMethod } from '../../types/domain'

export default function PaymentMethodManagerModal({
  open, onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { allPaymentMethods, addPaymentMethod, deletePaymentMethod, renamePaymentMethod } = usePaymentMethods()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleting, setDeleting] = useState<PaymentMethod | null>(null)

  const list = [...allPaymentMethods].sort((a, b) => a.name.localeCompare(b.name))

  const isDuplicate = newName.trim() !== '' && list.some((m) => m.name.toLowerCase() === newName.trim().toLowerCase())

  const handleAdd = () => {
    const name = newName.trim()
    if (!name || isDuplicate) return
    addPaymentMethod.mutate(name, { onSuccess: () => setNewName('') })
  }

  const startEdit = (m: PaymentMethod) => {
    setEditingId(m.id)
    setEditingName(m.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const confirmEdit = (m: PaymentMethod) => {
    const name = editingName.trim()
    if (!name || name === m.name) {
      cancelEdit()
      return
    }
    renamePaymentMethod.mutate({ id: m.id, name, oldName: m.name }, { onSuccess: cancelEdit })
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerenciar Formas de Pagamento" maxWidth="max-w-md">
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-base-400">
          Personalize as opções disponíveis ao registrar um lançamento — adicione as que fazem sentido para sua operação e remova as que não usa.
        </p>

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nova forma de pagamento..."
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          />
          <Button onClick={handleAdd} disabled={!newName.trim() || isDuplicate || addPaymentMethod.isPending}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {isDuplicate && <p className="text-[11px] text-warning-400 -mt-2">Já existe uma forma de pagamento com esse nome.</p>}

        <ErrorAlert error={addPaymentMethod.error || deletePaymentMethod.error || renamePaymentMethod.error} />

        <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-[12px] text-base-500 italic py-4 text-center">Nenhuma forma de pagamento cadastrada.</p>
          ) : (
            list.map((m) => (
              <div key={m.id} className="flex items-center gap-2 bg-base-850/60 rounded-lg px-3 py-2">
                {editingId === m.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); confirmEdit(m) }
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="!py-1 text-[13px]"
                    />
                    <button onClick={() => confirmEdit(m)} className="p-1.5 text-positive-400 hover:bg-base-800 rounded transition shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={cancelEdit} className="p-1.5 text-base-400 hover:bg-base-800 rounded transition shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-[13px] text-base-200 truncate">{m.name}</span>
                    <button onClick={() => startEdit(m)} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition shrink-0">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleting(m)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title="Excluir forma de pagamento?"
        description={`Lançamentos já criados com "${deleting?.name}" não serão alterados, mas ela deixa de aparecer nas opções para novos lançamentos.`}
        confirmLabel="Excluir"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deletePaymentMethod.mutate(deleting.id, { onSuccess: () => setDeleting(null) }) }}
        isLoading={deletePaymentMethod.isPending}
      />
    </Modal>
  )
}
