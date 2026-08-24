import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { Button, Input } from './FormControls'

export default function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirmar', danger, onCancel, onConfirm, isLoading,
  confirmPhrase,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
  isLoading?: boolean
  /** Se preenchida, exige digitar exatamente este texto pra habilitar o botão —
   *  reforço extra pra exclusões um pouco mais sensíveis, sem chegar a exigir
   *  senha (isso já é o DeleteWithPasswordDialog). */
  confirmPhrase?: string
}) {
  const [digitado, setDigitado] = useState('')

  // Zera o campo digitado ao sair do dialog por qualquer caminho (Cancelar,
  // clique no fundo, Esc, ou confirmar) — sem isso, o texto certo digitado
  // numa exclusão ficaria válido pra outra exclusão diferente reaberta
  // depois, já que o componente não desmonta entre uma abertura e outra.
  const handleCancelar = () => { setDigitado(''); onCancel() }
  const handleConfirmar = () => { setDigitado(''); onConfirm() }

  const podeConfirmar = !confirmPhrase || digitado === confirmPhrase

  return (
    <Modal open={open} onClose={handleCancelar} title={title} maxWidth="max-w-md">
      <div className="flex items-start gap-3 mb-5">
        {danger && (
          <div className="w-9 h-9 rounded-lg bg-negative-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4.5 h-4.5 text-negative-400" />
          </div>
        )}
        <p className="text-[13px] text-base-300 leading-relaxed">{description}</p>
      </div>

      {confirmPhrase && (
        <div className="mb-5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-base-400 block mb-1.5">
            Digite <span className="font-mono text-accent-300 normal-case">"{confirmPhrase}"</span> para confirmar
          </label>
          <Input value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder={confirmPhrase} autoFocus />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={handleCancelar}>Cancelar</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={handleConfirmar} loading={isLoading} disabled={!podeConfirmar}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
