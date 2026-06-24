import { useEffect, useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Select, Textarea, Button } from '../ui/FormControls'
import type { Empenho } from '../../types/domain'
import type { Client, Bidding } from '../../types/domain'
import { formatBRL } from '../../hooks/useAccountBalances'

export default function EmpenhoFormModal({
  open, onClose, onSave, initial, clients, biddings, isSaving,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Empenho>) => void
  initial?: Empenho | null
  clients: Client[]
  biddings: Bidding[]
  isSaving: boolean
}) {
  const [form, setForm] = useState<Partial<Empenho>>(() => initial ?? {
    numeroEmpenho: '',
    numeroNotaFiscal: '',
    clientId: clients[0]?.id ?? '',
    biddingId: null,
    dataEmpenho: new Date().toISOString().slice(0, 10),
    valorEmpenhada: 0,
    percentualComissao: 2,
    projetarDozeMeses: false,
    status: 'Pendente',
    observacao: '',
  })

  useEffect(() => {
    const valor = form.valorEmpenhada ?? 0
    const pct = form.percentualComissao ?? 0
    const total = Math.round(valor * (pct / 100) * 100) / 100
    setForm((f) => ({ ...f, valorComissaoTotal: total }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.valorEmpenhada, form.percentualComissao])

  const clientBiddings = biddings.filter((b) => b.clientId === form.clientId)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Empenho' : 'Novo Empenho'} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Cliente / Órgão Parceiro" required>
          <Select required value={form.clientId ?? ''} onChange={(e) => setForm({ ...form, clientId: e.target.value, biddingId: null })}>
            <option value="" disabled>Selecione o cliente...</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        <Field label="Licitação de Origem (opcional)">
          <Select value={form.biddingId ?? ''} onChange={(e) => setForm({ ...form, biddingId: e.target.value || null })}>
            <option value="">Nenhuma / Contrato Global</option>
            {clientBiddings.map((b) => <option key={b.id} value={b.id}>{b.objeto}</option>)}
          </Select>
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
            <Input type="number" step="0.01" required value={form.valorEmpenhada ?? ''} onChange={(e) => setForm({ ...form, valorEmpenhada: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Comissão (%)" required>
            <Input type="number" step="0.01" required value={form.percentualComissao ?? ''} onChange={(e) => setForm({ ...form, percentualComissao: parseFloat(e.target.value) || 0 })} />
          </Field>
        </div>

        <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-base-300">Comissão Total Calculada</span>
          <span className="text-base font-extrabold font-mono text-accent-300">{formatBRL(form.valorComissaoTotal ?? 0)}</span>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.projetarDozeMeses ?? false}
            onChange={(e) => setForm({ ...form, projetarDozeMeses: e.target.checked })}
            className="w-4 h-4 rounded accent-accent-500"
          />
          <span className="text-sm text-base-200">Projetar comissão em 12 parcelas mensais</span>
        </label>

        <Field label="Observação">
          <Textarea rows={2} value={form.observacao ?? ''} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving || !form.clientId}>{isSaving ? 'Salvando...' : 'Salvar Empenho'}</Button>
        </div>
      </form>
    </Modal>
  )
}
