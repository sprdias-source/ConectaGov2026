import { useEffect, useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Select, Textarea, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import type { Empenho, ModoParcelamento, Periodicidade } from '../../types/domain'
import type { Client, Bidding } from '../../types/domain'
import { formatBRL } from '../../hooks/useAccountBalances'

const emptyForm = (clients: Client[]): Partial<Empenho> => ({
  numeroEmpenho: '',
  numeroNotaFiscal: '',
  clientId: clients[0]?.id ?? '',
  biddingId: null,
  dataEmpenho: new Date().toISOString().slice(0, 10),
  valorEmpenhada: 0,
  percentualComissao: 2,
  modoParcelamento: 'integral',
  quantidadeParcelas: 3,
  periodicidade: 'mensal',
  recorrenciaAtiva: true,
  status: 'Pendente',
  observacao: '',
})

export default function EmpenhoFormModal({
  open, onClose, onSave, initial, clients, biddings, isSaving, error,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Empenho>) => void
  initial?: Empenho | null
  clients: Client[]
  biddings: Bidding[]
  isSaving: boolean
  error?: unknown
}) {
  const [form, setForm] = useState<Partial<Empenho>>(() => emptyForm(clients))

  // CORREÇÃO DE BUG (mesmo padrão usado em Cliente/Licitação): sempre
  // resincroniza ao abrir, em vez de depender do estado inicial do useState.
  useEffect(() => {
    if (open) setForm(initial ?? emptyForm(clients))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  useEffect(() => {
    const valor = form.valorEmpenhada ?? 0
    const pct = form.percentualComissao ?? 0
    const total = Math.round(valor * (pct / 100) * 100) / 100
    setForm((f) => ({ ...f, valorComissaoTotal: total }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.valorEmpenhada, form.percentualComissao])

  // Só licitações GANHAS podem receber empenhos — é o evento financeiro
  // oficial que confirma a comissão. Mostra também outras licitações do
  // cliente em andamento, desabilitadas, para deixar claro o motivo.
  const clientBiddings = biddings.filter((b) => b.clientId === form.clientId)
  const wonBiddings = clientBiddings.filter((b) => b.status === 'Ganhou')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  const parcelasPreview = (() => {
    if (form.modoParcelamento === 'integral') return '1 parcela (pagamento integral)'
    if (form.modoParcelamento === 'quantidade_fixa') return `${form.quantidadeParcelas ?? 0} parcelas fixas`
    const periodoLabel: Record<Periodicidade, string> = { mensal: 'mês', trimestral: 'trimestre', semestral: 'semestre', anual: 'ano' }
    return `1 parcela por ${periodoLabel[form.periodicidade ?? 'mensal']}, gerada automaticamente até você encerrar a recorrência`
  })()

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Empenho' : 'Novo Empenho'} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {initial && (
          <div className="bg-warning-500/10 border border-warning-500/25 rounded-lg p-3 text-[12px] text-warning-300">
            Ao salvar, as parcelas ainda <strong>pendentes</strong> deste empenho serão recalculadas com os novos valores. Parcelas já marcadas como <strong>Pagas</strong> não são alteradas.
          </div>
        )}

        <Field label="Cliente / Órgão Parceiro" required>
          <Select required value={form.clientId ?? ''} onChange={(e) => setForm({ ...form, clientId: e.target.value, biddingId: null })} disabled={!!initial}>
            <option value="" disabled>Selecione o cliente...</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        <Field label="Licitação Vinculada (apenas Ganhas)" required>
          <Select required value={form.biddingId ?? ''} onChange={(e) => setForm({ ...form, biddingId: e.target.value })} disabled={!!initial}>
            <option value="" disabled>Selecione a licitação...</option>
            {wonBiddings.map((b) => {
              const ref = b.numeroEdital || b.processo
              return (
                <option key={b.id} value={b.id}>
                  {ref ? `[${ref}] ` : ''}{b.objeto} — {b.orgao}
                </option>
              )
            })}
          </Select>
          {clientBiddings.length > 0 && wonBiddings.length === 0 && (
            <p className="text-[11px] text-warning-400 mt-1">
              Este cliente tem licitações cadastradas, mas nenhuma com status "Ganhou" ainda. Atualize o status na aba Cadastros primeiro.
            </p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nº do Empenho" required>
            <Input required value={form.numeroEmpenho ?? ''} onChange={(e) => setForm({ ...form, numeroEmpenho: e.target.value })} placeholder="1234/2026" />
          </Field>
          <Field label="Nº Nota Fiscal">
            <Input value={form.numeroNotaFiscal ?? ''} onChange={(e) => setForm({ ...form, numeroNotaFiscal: e.target.value })} placeholder="NF-e 1245" />
          </Field>
        </div>

        <Field label="Data do Empenho" required>
          <Input type="date" required value={form.dataEmpenho ?? ''} onChange={(e) => setForm({ ...form, dataEmpenho: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor Empenhado (R$)" required>
            <CurrencyInput value={form.valorEmpenhada ?? 0} onChange={(v) => setForm({ ...form, valorEmpenhada: v })} />
          </Field>
          <Field label="Comissão (%)" required>
            <Input type="number" step="0.01" required value={form.percentualComissao ?? ''} onChange={(e) => setForm({ ...form, percentualComissao: parseFloat(e.target.value) || 0 })} />
          </Field>
        </div>

        <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-base-300">Comissão Total Calculada</span>
          <span className="text-base font-extrabold font-mono text-accent-300">{formatBRL(form.valorComissaoTotal ?? 0)}</span>
        </div>

        <Field label="Forma de Recebimento da Comissão">
          <div className="flex bg-base-850 border border-base-700 rounded-lg p-1">
            {([
              { v: 'integral', label: 'Integral' },
              { v: 'quantidade_fixa', label: 'Parcelas Fixas' },
              { v: 'recorrente', label: 'Recorrente' },
            ] as { v: ModoParcelamento; label: string }[]).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setForm({ ...form, modoParcelamento: opt.v })}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition ${form.modoParcelamento === opt.v ? 'bg-accent-500 text-base-950' : 'text-base-400'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {form.modoParcelamento === 'quantidade_fixa' && (
          <Field label="Quantidade de Parcelas" required>
            <Input type="number" min={1} max={60} required value={form.quantidadeParcelas ?? 3} onChange={(e) => setForm({ ...form, quantidadeParcelas: parseInt(e.target.value) || 1 })} />
          </Field>
        )}

        {form.modoParcelamento === 'recorrente' && (
          <Field label="Periodicidade" required>
            <Select required value={form.periodicidade ?? 'mensal'} onChange={(e) => setForm({ ...form, periodicidade: e.target.value as Periodicidade })}>
              <option value="mensal">Mensal</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </Select>
          </Field>
        )}

        <p className="text-[11px] text-base-500 -mt-1">{parcelasPreview}</p>

        <Field label="Observação">
          <Textarea rows={2} value={form.observacao ?? ''} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
        </Field>

        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving || !form.clientId || !form.biddingId}>{isSaving ? 'Salvando...' : 'Salvar Empenho'}</Button>
        </div>
      </form>
    </Modal>
  )
}
