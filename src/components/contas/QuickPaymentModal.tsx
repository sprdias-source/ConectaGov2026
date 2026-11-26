import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Minus } from 'lucide-react'
import { todayLocalISO } from '../../lib/dateUtils'
import Modal from '../ui/Modal'
import { Field, Input, Select, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import type { Transaction, FinancialAccount } from '../../types/domain'
import { formatBRL } from '../../hooks/useAccountBalances'

export default function QuickPaymentModal({
  open, onClose, transaction, accounts, onConfirm, isSaving, error,
}: {
  open: boolean
  onClose: () => void
  transaction: Transaction | null
  // CORREÇÃO DE BUG (achado da simulação): a baixa rápida nunca pedia
  // conta nenhuma — uma comissão de empenho (que nasce sem accountId, ver
  // buildCommissionTransactions em useEmpenhos.ts) virava "Pago" sem
  // movimentar nenhum saldo, e isso só se descobria indiretamente (contador
  // "N lançamento(s) pago(s) sem conta vinculada" na sidebar). Pergunta a
  // conta aqui só quando o lançamento ainda não tem uma — se já tem
  // (definida na criação, ou editando o lançamento depois), não repete.
  accounts: FinancialAccount[]
  onConfirm: (paymentDate: string, ajuste?: { desconto: number; juros: number; multa: number }, accountId?: string | null) => void
  isSaving: boolean
  error?: unknown
}) {
  const [paymentDate, setPaymentDate] = useState(() => todayLocalISO())
  const [accountId, setAccountId] = useState<string>('')
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
      setAccountId('')
      setAjusteAberto(false)
      setDesconto(0)
      setJuros(0)
      setMulta(0)
    }
  }, [open])

  if (!transaction) return null

  const valorFinal = transaction.value - desconto + juros + multa
  const precisaEscolherConta = !transaction.accountId
  const contasSelecionaveis = accounts.filter((a) => a.type !== 'INTERNO')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onConfirm(paymentDate, ajusteAberto ? { desconto, juros, multa } : undefined, precisaEscolherConta ? (accountId || null) : undefined)
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

        {precisaEscolherConta && (
          <Field
            label="Em qual conta?"
            badge={<span className="text-[9px] font-bold uppercase tracking-wider text-warning-400 bg-warning-500/10 border border-warning-500/30 rounded px-1.5 py-0.5">Sem conta ainda</span>}
          >
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Nenhuma (não afeta saldo de nenhuma conta)</option>
              {contasSelecionaveis.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <p className="text-[11px] text-base-500 mt-1">
              Este lançamento ainda não tem conta vinculada — sem escolher uma, o valor não entra no saldo de nenhuma conta nem no Patrimônio Total.
            </p>
          </Field>
        )}

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
