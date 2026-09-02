import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Minus } from 'lucide-react'
import { todayLocalISO } from '../../lib/dateUtils'
import Modal from '../ui/Modal'
import { Field, Input, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import type { Transaction } from '../../types/domain'
import { formatBRL } from '../../hooks/useAccountBalances'

export default function QuickPaymentModal({
  open, onClose, transaction, onConfirm, isSaving, error,
}: {
  open: boolean
  onClose: () => void
  transaction: Transaction | null
  onConfirm: (paymentDate: string, ajuste?: { desconto: number; juros: number; multa: number }) => void
  isSaving: boolean
  error?: unknown
}) {
  const [paymentDate, setPaymentDate] = useState(() => todayLocalISO())
  const [ajusteAberto, setAjusteAberto] = useState(false)
  const [desconto, setDesconto] = useState(0)
  const [juros, setJuros] = useState(0)
  const [multa, setMulta] = useState(0)

  // CORREÇÃO DE BUG (mesmo padrão dos demais modais): sem isso, depois de
  // confirmar uma baixa em uma data específica, a próxima transação aberta
  // neste mesmo modal continuaria mostrando aquela data antiga, em vez de
  // voltar para "hoje" como ponto de partida.
  useEffect(() => {
    if (open) {
      setPaymentDate(todayLocalISO())
      setAjusteAberto(false)
      setDesconto(0)
      setJuros(0)
      setMulta(0)
    }
  }, [open])

  if (!transaction) return null

  const valorFinal = transaction.value - desconto + juros + multa

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onConfirm(paymentDate, ajusteAberto ? { desconto, juros, multa } : undefined)
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

        <button
          type="button"
          onClick={() => setAjusteAberto((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-400 hover:text-accent-300 -mt-2 self-start"
        >
          {ajusteAberto ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          Houve desconto, juros ou multa?
        </button>

        {ajusteAberto && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Desconto (R$)"><CurrencyInput value={desconto} onChange={setDesconto} /></Field>
              <Field label="Juros (R$)"><CurrencyInput value={juros} onChange={setJuros} /></Field>
              <Field label="Multa (R$)"><CurrencyInput value={multa} onChange={setMulta} /></Field>
            </div>
            <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 flex justify-between items-center">
              <span className="text-[12px] font-semibold text-base-300">
                Valor {transaction.type === 'Receber' ? 'Recebido' : 'Pago'}
              </span>
              <span className="font-mono font-extrabold text-accent-300">{formatBRL(valorFinal)}</span>
            </div>
          </>
        )}

        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Confirmando...' : 'Confirmar Baixa'}</Button>
        </div>
      </form>
    </Modal>
  )
}
