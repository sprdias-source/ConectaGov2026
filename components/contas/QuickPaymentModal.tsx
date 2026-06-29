import { useEffect, useState, type FormEvent } from 'react'
import { todayLocalISO } from '../../lib/dateUtils'
import Modal from '../ui/Modal'
import { Field, Input, Button } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import type { Transaction } from '../../types/domain'
import { formatBRL } from '../../hooks/useAccountBalances'

export default function QuickPaymentModal({
  open, onClose, transaction, onConfirm, isSaving, error,
}: {
  open: boolean
  onClose: () => void
  transaction: Transaction | null
  onConfirm: (paymentDate: string) => void
  isSaving: boolean
  error?: unknown
}) {
  const [paymentDate, setPaymentDate] = useState(() => todayLocalISO())

  // CORREÇÃO DE BUG (mesmo padrão dos demais modais): sem isso, depois de
  // confirmar uma baixa em uma data específica, a próxima transação aberta
  // neste mesmo modal continuaria mostrando aquela data antiga, em vez de
  // voltar para "hoje" como ponto de partida.
  useEffect(() => {
    if (open) setPaymentDate(todayLocalISO())
  }, [open])

  if (!transaction) return null

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onConfirm(paymentDate)
  }

  return (
    <Modal open={open} onClose={onClose} title={`Confirmar ${transaction.type === 'Receber' ? 'Recebimento' : 'Pagamento'}`} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="bg-base-850/60 rounded-lg p-3">
          <p className="text-[12px] text-base-400">{transaction.description}</p>
          <p className={`text-lg font-extrabold font-mono mt-1 ${transaction.type === 'Receber' ? 'text-positive-400' : 'text-negative-400'}`}>
            {formatBRL(transaction.value)}
          </p>
        </div>

        <Field label={`Data efetiva do ${transaction.type === 'Receber' ? 'recebimento' : 'pagamento'}`} required>
          <Input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} autoFocus />
        </Field>

        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Confirmando...' : 'Confirmar Baixa'}</Button>
        </div>
      </form>
    </Modal>
  )
}
