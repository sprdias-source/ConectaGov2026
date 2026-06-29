import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { Button } from './FormControls'

export default function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirmar', danger, onCancel, onConfirm, isLoading,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
  isLoading?: boolean
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-md">
      <div className="flex items-start gap-3 mb-5">
        {danger && (
          <div className="w-9 h-9 rounded-lg bg-negative-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4.5 h-4.5 text-negative-400" />
          </div>
        )}
        <p className="text-[13px] text-base-300 leading-relaxed">{description}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={isLoading}>
          {isLoading ? 'Processando...' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
