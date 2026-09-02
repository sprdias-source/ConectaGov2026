import { useEffect, useState, type FormEvent } from 'react'
import { todayLocalISO } from '../../lib/dateUtils'
import Modal from '../ui/Modal'
import { Field, Input, Select, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import { formatBRL } from '../../hooks/useAccountBalances'
import type { Transaction, TransactionType } from '../../types/domain'
import type { Client } from '../../types/domain'
import type { FinancialAccount } from '../../types/domain'

const emptyForm = (categoriesReceber: string[], paymentMethods: string[]): Partial<Transaction> => ({
  type: 'Receber',
  category: categoriesReceber[0] ?? '',
  description: '',
  value: 0,
  dueDate: todayLocalISO(),
  paymentMethod: paymentMethods[0] ?? '',
  status: 'Pendente',
  isRecurring: false,
})

export default function TransactionFormModal({
  open, onClose, onSave, initial, clients, accounts, categoriesPagar, categoriesReceber, paymentMethods, isSaving, error,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Transaction>) => void
  initial?: Transaction | null
  clients: Client[]
  accounts: FinancialAccount[]
  categoriesPagar: string[]
  categoriesReceber: string[]
  paymentMethods: string[]
  isSaving: boolean
  error?: unknown
}) {
  const [form, setForm] = useState<Partial<Transaction>>(() => emptyForm(categoriesReceber, paymentMethods))
  // Enquanto o modal está aberto, form.value representa sempre o "Valor
  // (R$)" original digitado/cobrado — nunca o valor já ajustado por
  // desconto/juros/multa. Esses três só existem quando o lançamento está
  // marcado como pago/recebido, e o valor final é recalculado só na hora
  // de salvar (handleSubmit), sem afetar o que aparece no campo principal.
  const [desconto, setDesconto] = useState(0)
  const [juros, setJuros] = useState(0)
  const [multa, setMulta] = useState(0)

  // CORREÇÃO DE BUG (mesmo padrão dos outros modais): garante que o
  // formulário sempre reflita o registro atual ao reabrir o modal.
  useEffect(() => {
    if (!open) return
    if (initial) {
      // initial.value já pode estar ajustado (se o lançamento foi pago com
      // desconto/juros/multa) — o campo "Valor (R$)" sempre mostra o valor
      // original, não o já ajustado.
      setForm({ ...initial, value: initial.valorOriginal ?? initial.value })
      setDesconto(initial.desconto ?? 0)
      setJuros(initial.juros ?? 0)
      setMulta(initial.multa ?? 0)
    } else {
      setForm(emptyForm(categoriesReceber, paymentMethods))
      setDesconto(0)
      setJuros(0)
      setMulta(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  const categories = form.type === 'Pagar' ? categoriesPagar : categoriesReceber

  const handleTypeChange = (type: TransactionType) => {
    const newCats = type === 'Pagar' ? categoriesPagar : categoriesReceber
    setForm({ ...form, type, category: newCats[0] ?? '' })
  }

  const valorOriginalDigitado = form.value ?? 0
  const temAjuste = desconto !== 0 || juros !== 0 || multa !== 0
  const valorFinal = form.status === 'Pago' ? valorOriginalDigitado - desconto + juros + multa : valorOriginalDigitado

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const dueDate = form.dueDate ?? todayLocalISO()
    onSave({
      ...form,
      recurringDay: form.isRecurring ? Number(dueDate.slice(8, 10)) : null,
      value: valorFinal,
      valorOriginal: valorOriginalDigitado,
      desconto: form.status === 'Pago' ? desconto : null,
      juros: form.status === 'Pago' ? juros : null,
      multa: form.status === 'Pago' ? multa : null,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Lançamento' : 'Novo Lançamento'} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex bg-base-850 border border-base-700 rounded-lg p-1">
          {(['Receber', 'Pagar'] as TransactionType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTypeChange(t)}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition ${
                form.type === t
                  ? t === 'Receber' ? 'bg-positive-500/20 text-positive-400' : 'bg-negative-500/20 text-negative-400'
                  : 'text-base-400'
              }`}
            >
              {t === 'Receber' ? 'A Receber' : 'A Pagar'}
            </button>
          ))}
        </div>

        <Field label="Categoria" required>
          <Select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>

        <Field label="Descrição" required>
          <Input required value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição do lançamento" />
        </Field>

        {form.type === 'Receber' && (
          <Field label="Cliente">
            <Select value={form.clientId ?? ''} onChange={(e) => setForm({ ...form, clientId: e.target.value || null })}>
              <option value="">Sem cliente vinculado</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor (R$)" required>
            <CurrencyInput value={form.value ?? 0} onChange={(v) => setForm({ ...form, value: v })} />
          </Field>
          <Field label="Vencimento" required>
            <Input type="date" required value={form.dueDate ?? ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Forma de Pagamento">
            <Select value={form.paymentMethod ?? ''} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {paymentMethods.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Conta Vinculada">
            <Select value={form.accountId ?? ''} onChange={(e) => setForm({ ...form, accountId: e.target.value || null })}>
              <option value="">Não definida</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>

        <div className="bg-base-850/60 border border-base-700/50 rounded-lg p-3 flex flex-col gap-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.status === 'Pago'}
              onChange={(e) => {
                setForm({
                  ...form,
                  status: e.target.checked ? 'Pago' : 'Pendente',
                  paymentDate: e.target.checked ? (form.paymentDate ?? todayLocalISO()) : null,
                })
                if (!e.target.checked) { setDesconto(0); setJuros(0); setMulta(0) }
              }}
              className="w-4 h-4 rounded accent-positive-500"
            />
            <span className="text-sm font-semibold text-base-200">
              Já {form.type === 'Receber' ? 'recebido' : 'pago'}
            </span>
          </label>
          {form.status === 'Pago' && (
            <>
              <Field label={`Data efetiva do ${form.type === 'Receber' ? 'recebimento' : 'pagamento'}`} required>
                <Input
                  type="date"
                  required
                  value={form.paymentDate ?? ''}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Desconto (R$)"><CurrencyInput value={desconto} onChange={setDesconto} /></Field>
                <Field label="Juros (R$)"><CurrencyInput value={juros} onChange={setJuros} /></Field>
                <Field label="Multa (R$)"><CurrencyInput value={multa} onChange={setMulta} /></Field>
              </div>

              {temAjuste && (
                <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 flex flex-col gap-1">
                  <div className="flex justify-between text-[12px] text-base-400">
                    <span>Valor Original</span><span className="font-mono">{formatBRL(valorOriginalDigitado)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-accent-500/20 pt-1.5 mt-0.5">
                    <span className="text-[12px] font-semibold text-base-300">
                      Valor {form.type === 'Receber' ? 'Recebido' : 'Pago'}
                    </span>
                    <span className="font-mono font-extrabold text-accent-300">{formatBRL(valorFinal)}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer bg-base-850/60 border border-base-700/50 rounded-lg p-3">
          <input
            type="checkbox"
            checked={form.isRecurring ?? false}
            onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
            className="w-4 h-4 rounded accent-accent-500"
            disabled={!!initial}
          />
          <div>
            <span className="text-sm font-semibold text-base-200 block">Repetir todo mês</span>
            <span className="text-[11px] text-base-500">
              {initial ? 'Não é possível alterar a recorrência de um lançamento já existente.' : 'Gera automaticamente as próximas parcelas mensais, prontas para receber baixa quando você quiser.'}
            </span>
          </div>
        </label>

        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar Lançamento'}</Button>
        </div>
      </form>
    </Modal>
  )
}
