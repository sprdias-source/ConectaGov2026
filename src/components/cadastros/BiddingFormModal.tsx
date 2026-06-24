import { useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Select, Textarea, Button } from '../ui/FormControls'
import type { Bidding, BiddingModalidade, BiddingTipo, BiddingStatus, BiddingEtapa } from '../../types/domain'
import type { Client } from '../../types/domain'

const MODALIDADES: BiddingModalidade[] = [
  'Pregão Eletrônico', 'Pregão Presencial', 'Concorrência Pública', 'Tomada de Preços',
  'Convite', 'Leilão', 'Diálogo Competitivo', 'Dispensa de Licitação', 'Inexigibilidade',
]
const TIPOS: BiddingTipo[] = ['Menor Preço', 'Maior Desconto', 'Melhor Técnica', 'Técnica e Preço', 'Maior Retorno Econômico']
const STATUSES: BiddingStatus[] = ['Em Andamento', 'Ganhou', 'Perdeu', 'Cancelada']
const ETAPAS: BiddingEtapa[] = ['Análise de Edital', 'Montagem de Documentação', 'Proposta Enviada', 'Disputa de Lances', 'Fase Recursal', 'Adjudicada e Homologada']

export default function BiddingFormModal({
  open, onClose, onSave, initial, clients, isSaving,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Bidding>) => void
  initial?: Bidding | null
  clients: Client[]
  isSaving: boolean
}) {
  const [form, setForm] = useState<Partial<Bidding>>(() => initial ?? {
    clientId: clients[0]?.id ?? '',
    modalidade: 'Pregão Eletrônico',
    tipo: 'Menor Preço',
    objeto: '',
    orgao: '',
    valorLicitado: 0,
    status: 'Em Andamento',
    dataAbertura: new Date().toISOString().slice(0, 10),
    etapa: 'Análise de Edital',
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Licitação' : 'Nova Licitação'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Cliente / Contratante" required>
          <Select required value={form.clientId ?? ''} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="" disabled>Selecione o cliente...</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>

        <Field label="Objeto da Licitação" required>
          <Textarea required rows={2} value={form.objeto ?? ''} onChange={(e) => setForm({ ...form, objeto: e.target.value })} placeholder="Descrição detalhada do objeto licitado" />
        </Field>

        <Field label="Órgão Licitante" required>
          <Input required value={form.orgao ?? ''} onChange={(e) => setForm({ ...form, orgao: e.target.value })} placeholder="Ex: Prefeitura Municipal de Sorocaba" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Modalidade" required>
            <Select required value={form.modalidade} onChange={(e) => setForm({ ...form, modalidade: e.target.value as BiddingModalidade })}>
              {MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Tipo de Julgamento" required>
            <Select required value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as BiddingTipo })}>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor Licitado (R$)" required>
            <Input type="number" step="0.01" required value={form.valorLicitado ?? ''} onChange={(e) => setForm({ ...form, valorLicitado: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Data de Abertura" required>
            <Input type="date" required value={form.dataAbertura ?? ''} onChange={(e) => setForm({ ...form, dataAbertura: e.target.value })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Status" required>
            <Select required value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BiddingStatus })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Etapa Atual">
            <Select value={form.etapa ?? ''} onChange={(e) => setForm({ ...form, etapa: e.target.value as BiddingEtapa })}>
              {ETAPAS.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="Nº Edital">
            <Input value={form.numeroEdital ?? ''} onChange={(e) => setForm({ ...form, numeroEdital: e.target.value })} placeholder="05/2026" />
          </Field>
          <Field label="Processo">
            <Input value={form.processo ?? ''} onChange={(e) => setForm({ ...form, processo: e.target.value })} placeholder="Proc. 423/2026" />
          </Field>
          <Field label="Portal">
            <Input value={form.portal ?? ''} onChange={(e) => setForm({ ...form, portal: e.target.value })} placeholder="ComprasNet" />
          </Field>
        </div>

        <Field label="Observações da Etapa">
          <Textarea rows={2} value={form.observacaoEtapa ?? ''} onChange={(e) => setForm({ ...form, observacaoEtapa: e.target.value })} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving || !form.clientId}>{isSaving ? 'Salvando...' : 'Salvar Licitação'}</Button>
        </div>
      </form>
    </Modal>
  )
}
