import { useEffect, useState, type FormEvent } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Select, Textarea, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import BiddingItemsEditor from './BiddingItemsEditor'
import { useBiddingItems } from '../../hooks/useBiddingItems'
import type { Bidding, BiddingModalidade, BiddingTipo, BiddingStatus, BiddingEtapa, BiddingItem } from '../../types/domain'
import type { Client } from '../../types/domain'

const MODALIDADES: BiddingModalidade[] = [
  'Pregão Eletrônico', 'Pregão Presencial', 'Concorrência Pública', 'Tomada de Preços',
  'Convite', 'Leilão', 'Diálogo Competitivo', 'Dispensa de Licitação', 'Inexigibilidade',
]
const TIPOS: BiddingTipo[] = ['Menor Preço', 'Maior Desconto', 'Melhor Técnica', 'Técnica e Preço', 'Maior Retorno Econômico']
const STATUSES: BiddingStatus[] = ['Em Andamento', 'Ganhou', 'Perdeu', 'Cancelada']
const ETAPAS: BiddingEtapa[] = ['Análise de Edital', 'Montagem de Documentação', 'Proposta Enviada', 'Disputa de Lances', 'Fase Recursal', 'Adjudicada e Homologada']

const emptyForm = (clients: Client[]): Partial<Bidding> => ({
  clientId: clients[0]?.id ?? '',
  modalidade: 'Pregão Eletrônico',
  tipo: 'Menor Preço',
  objeto: '',
  orgao: '',
  valorLicitado: 0,
  valorOfertadoReal: null,
  status: 'Em Andamento',
  dataAbertura: new Date().toISOString().slice(0, 10),
  dataCadastro: new Date().toISOString().slice(0, 10),
  tipoDisputa: 'Item',
  taxaParticipacao: null,
  etapa: 'Análise de Edital',
})

export default function BiddingFormModal({
  open, onClose, onSave, initial, clients, isSaving, clientIsMensalista, error,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Bidding>, items: Partial<BiddingItem>[]) => void
  initial?: Bidding | null
  clients: Client[]
  isSaving: boolean
  clientIsMensalista?: (clientId: string) => boolean
  error?: unknown
}) {
  const [form, setForm] = useState<Partial<Bidding>>(() => emptyForm(clients))
  const [tab, setTab] = useState<'dados' | 'itens'>('dados')
  const [draftItems, setDraftItems] = useState<Partial<BiddingItem>[]>([])

  const { items: savedItems } = useBiddingItems(initial?.id ?? null)

  // CORREÇÃO DE BUG: sincroniza o formulário sempre que o modal abre,
  // em vez de calcular o estado inicial apenas na primeira montagem.
  // Isso evita que, ao editar a licitação B depois de ter editado a A,
  // o formulário continue mostrando os dados antigos de A.
  useEffect(() => {
    if (open) {
      setForm(initial ?? emptyForm(clients))
      setTab('dados')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  useEffect(() => {
    setDraftItems(savedItems)
  }, [savedItems])

  const isNaoMensalista = form.clientId && clientIsMensalista ? !clientIsMensalista(form.clientId) : false

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSave(form, draftItems)
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Licitação' : 'Nova Licitação'} maxWidth="max-w-3xl">
      <div className="flex gap-1.5 border-b border-base-800 mb-4 -mt-1">
        <button type="button" onClick={() => setTab('dados')} className={`px-3 py-2 text-[12px] font-semibold transition border-b-2 -mb-px ${tab === 'dados' ? 'text-accent-300 border-accent-400' : 'text-base-400 border-transparent'}`}>
          Dados Gerais
        </button>
        <button type="button" onClick={() => setTab('itens')} className={`px-3 py-2 text-[12px] font-semibold transition border-b-2 -mb-px ${tab === 'itens' ? 'text-accent-300 border-accent-400' : 'text-base-400 border-transparent'}`}>
          Itens / Lotes {draftItems.length > 0 && <span className="ml-1 bg-accent-500/20 text-accent-300 rounded-full px-1.5">{draftItems.length}</span>}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {tab === 'dados' ? (
          <>
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

            <Field label="Disputa por">
              <div className="flex bg-base-850 border border-base-700 rounded-lg p-1">
                {(['Item', 'Lote'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, tipoDisputa: t })}
                    className={`flex-1 py-1.5 text-[12px] font-bold rounded-md transition ${form.tipoDisputa === t ? 'bg-accent-500 text-base-950' : 'text-base-400'}`}
                  >
                    Por {t}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Valor Licitado / Estimado (R$)" required>
                <CurrencyInput value={form.valorLicitado ?? 0} onChange={(v) => setForm({ ...form, valorLicitado: v })} required />
              </Field>
              <Field label="Valor Ofertado (vencedor, R$)">
                <CurrencyInput value={form.valorOfertadoReal ?? 0} onChange={(v) => setForm({ ...form, valorOfertadoReal: v || null })} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Data de Cadastro">
                <Input type="date" value={form.dataCadastro ?? ''} onChange={(e) => setForm({ ...form, dataCadastro: e.target.value })} />
              </Field>
              <Field label="Data do Pregão" required>
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

            <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3">
              <Field label="Taxa de Participação Individual (R$)">
                <CurrencyInput value={form.taxaParticipacao ?? 0} onChange={(v) => setForm({ ...form, taxaParticipacao: v || null })} placeholder="R$ 0,00 (opcional)" />
              </Field>
              {isNaoMensalista ? (
                <p className="text-[11px] text-accent-300 mt-1.5">
                  Este cliente não é mensalista. Se você informar um valor aqui, ao salvar a licitação o sistema lança automaticamente um "a receber" nesse valor, vinculado a este cliente.
                </p>
              ) : (
                <p className="text-[11px] text-base-500 mt-1.5">
                  Este cliente é mensalista — normalmente não se cobra taxa de participação à parte. Preencha apenas se for um caso excepcional.
                </p>
              )}
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
          </>
        ) : (
          <BiddingItemsEditor items={draftItems} onChange={setDraftItems} tipoDisputa={form.tipoDisputa ?? 'Item'} />
        )}

        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-2 border-t border-base-800">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving || !form.clientId}>{isSaving ? 'Salvando...' : 'Salvar Licitação'}</Button>
        </div>
      </form>
    </Modal>
  )
}
