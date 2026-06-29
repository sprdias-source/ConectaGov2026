import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import Modal from '../ui/Modal'
import { Input, Button } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import ConfirmDialog from '../ui/ConfirmDialog'
import { useCategories } from '../../hooks/useCategories'
import type { Category } from '../../types/domain'

export default function CategoryManagerModal({
  open, onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { allCategories, addCategory, deleteCategory, renameCategory } = useCategories()
  const [tab, setTab] = useState<'Pagar' | 'Receber'>('Receber')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleting, setDeleting] = useState<Category | null>(null)

  const list = allCategories.filter((c) => c.type === tab).sort((a, b) => a.name.localeCompare(b.name))

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    if (list.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return
    }
    addCategory.mutate({ type: tab, name }, { onSuccess: () => setNewName('') })
  }

  const startEdit = (cat: Category) => {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const confirmEdit = (cat: Category) => {
    const name = editingName.trim()
    if (!name || name === cat.name) {
      cancelEdit()
      return
    }
    renameCategory.mutate(
      { id: cat.id, name, oldName: cat.name, type: tab },
      { onSuccess: cancelEdit }
    )
  }

  const isDuplicate = newName.trim() !== '' && list.some((c) => c.name.toLowerCase() === newName.trim().toLowerCase())

  return (
    <Modal open={open} onClose={onClose} title="Gerenciar Categorias" maxWidth="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex bg-base-850 border border-base-700 rounded-lg p-1">
          {(['Receber', 'Pagar'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition ${
                tab === t
                  ? t === 'Receber' ? 'bg-positive-500/20 text-positive-400' : 'bg-negative-500/20 text-negative-300'
                  : 'text-base-400'
              }`}
            >
              {t === 'Receber' ? 'Categorias a Receber' : 'Categorias a Pagar'}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`Nova categoria de ${tab === 'Receber' ? 'receita' : 'despesa'}...`}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          />
          <Button onClick={handleAdd} disabled={!newName.trim() || isDuplicate || addCategory.isPending}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {isDuplicate && <p className="text-[11px] text-warning-400 -mt-2">Já existe uma categoria com esse nome.</p>}

        <ErrorAlert error={addCategory.error || deleteCategory.error || renameCategory.error} />

        <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-[12px] text-base-500 italic py-4 text-center">Nenhuma categoria cadastrada.</p>
          ) : (
            list.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2 bg-base-850/60 rounded-lg px-3 py-2">
                {editingId === cat.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); confirmEdit(cat) }
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="!py-1 text-[13px]"
                    />
                    <button onClick={() => confirmEdit(cat)} className="p-1.5 text-positive-400 hover:bg-base-800 rounded transition shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={cancelEdit} className="p-1.5 text-base-400 hover:bg-base-800 rounded transition shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-[13px] text-base-200 truncate">{cat.name}</span>
                    <button onClick={() => startEdit(cat)} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition shrink-0">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleting(cat)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition shrink-0">
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
        title="Excluir categoria?"
        description={`Lançamentos já criados com a categoria "${deleting?.name}" não serão alterados, mas ela deixa de aparecer nas opções para novos lançamentos.`}
        confirmLabel="Excluir categoria"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteCategory.mutate(deleting.id, { onSuccess: () => setDeleting(null) }) }}
        isLoading={deleteCategory.isPending}
      />
    </Modal>
  )
}
