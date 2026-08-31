import { useEffect, useState, type FormEvent } from 'react'
import { todayLocalISO } from '../../lib/dateUtils'
import { addMonths, type EmpenhoRecorrenteItem } from '../../hooks/useEmpenhos'
import Modal from '../ui/Modal'
import { Field, Input, Select, Textarea, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import type { Empenho, ModoParcelamento, Periodicidade } from '../../types/domain'
import type { Client, Bidding } from '../../types/domain'
import { formatBRL } from '../../hooks/useAccountBalances'

const PERIODO_MESES: Record<Periodicidade, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }

// "Tipo de Lançamento" só existe na hora de CRIAR um empenho novo — decide
// se esta ação gera 1 empenho (Único/Parcelado) ou N empenhos de uma vez
// (Recorrente). Não é um campo do Empenho em si (por isso não mora em
// types/domain.ts): pra "Único" e "Parcelado", vira modoParcelamento
// ('integral'/'quantidade_fixa') só no momento de salvar; pra "Recorrente",
// nem chega a setar modoParcelamento aqui — cada empenho gerado nasce como
// 'integral' (ver addSerieEmpenhos em useEmpenhos.ts), porque cada mês é um
// empenho PRÓPRIO, não uma parcela de comissão do mesmo empenho.
type TipoLancamento = 'unico' | 'parcelado' | 'recorrente'

type ItemSerieForm = { dataEmpenho: string; numeroEmpenho: string; numeroNotaFiscal: string; valorEmpenhada: number }

const emptyForm = (clients: Client[]): Partial<Empenho> => ({
  numeroEmpenho: '',
  numeroNotaFiscal: '',
  clientId: clients[0]?.id ?? '',
  biddingId: null,
  dataEmpenho: todayLocalISO(),
  valorEmpenhada: 0,
  percentualComissao: 2,
  modoParcelamento: 'integral',
  quantidadeParcelas: 12,
  periodicidade: 'mensal',
  status: 'Pendente',
  observacao: '',
})

export default function EmpenhoFormModal({
  open, onClose, onSave, onSaveSerie, initial, clients, biddings, isSaving, error,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Partial<Empenho>) => void
  // Só chamado quando "Tipo de Lançamento: Recorrente" é salvo num empenho
  // NOVO (nunca na edição) — gera N empenhos de uma vez em vez de editar um só.
  onSaveSerie: (base: Partial<Empenho>, itens: EmpenhoRecorrenteItem[]) => void
  initial?: Empenho | null
  clients: Client[]
  biddings: Bidding[]
  isSaving: boolean
  error?: unknown
}) {
  const [form, setForm] = useState<Partial<Empenho>>(() => emptyForm(clients))
  const [tipoLancamento, setTipoLancamento] = useState<TipoLancamento>('unico')
  // Meses 2..N da série Recorrente — o mês 1 é sempre os campos principais
  // do formulário acima (Data/Número/NF/Valor), pra não duplicar o mesmo
  // dado em dois lugares com risco de ficarem dessincronizados.
  const [itensSerie, setItensSerie] = useState<ItemSerieForm[]>([])

  // CORREÇÃO DE BUG (mesmo padrão usado em Cliente/Licitação): sempre
  // resincroniza ao abrir, em vez de depender do estado inicial do useState.
  useEffect(() => {
    if (open) {
      setForm(initial ?? emptyForm(clients))
      setTipoLancamento('unico')
      setItensSerie([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  useEffect(() => {
    const valor = form.valorEmpenhada ?? 0
    const pct = form.percentualComissao ?? 0
    const total = Math.round(valor * (pct / 100) * 100) / 100
    setForm((f) => ({ ...f, valorComissaoTotal: total }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.valorEmpenhada, form.percentualComissao])

  // Gera/ajusta as linhas dos meses 2..N sempre que a quantidade, a
  // periodicidade ou a data do mês 1 mudam — preserva número/NF/valor já
  // digitados nas linhas que continuam existindo (só recalcula a DATA delas,
  // a partir da nova data do mês 1); linhas novas nascem com número/NF em
  // branco ("a definir") e valor igual ao do mês 1.
  useEffect(() => {
    if (initial || tipoLancamento !== 'recorrente') return
    const totalMeses = Math.max(1, form.quantidadeParcelas ?? 1)
    const passo = PERIODO_MESES[form.periodicidade ?? 'mensal']
    const dataBase = form.dataEmpenho || todayLocalISO()
    const valorBase = form.valorEmpenhada ?? 0
    setItensSerie((atual) => {
      const qtd = Math.max(0, totalMeses - 1)
      const novo: ItemSerieForm[] = []
      for (let i = 0; i < qtd; i++) {
        const existente = atual[i]
        novo.push({
          dataEmpenho: addMonths(dataBase, passo * (i + 1)),
          numeroEmpenho: existente?.numeroEmpenho ?? '',
          numeroNotaFiscal: existente?.numeroNotaFiscal ?? '',
          valorEmpenhada: existente ? existente.valorEmpenhada : valorBase,
        })
      }
      return novo
    })
  }, [initial, tipoLancamento, form.quantidadeParcelas, form.periodicidade, form.dataEmpenho, form.valorEmpenhada])

  const updateItemSerie = (idx: number, patch: Partial<ItemSerieForm>) => {
    setItensSerie((atual) => atual.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  // Só licitações GANHAS podem receber empenhos — é o evento financeiro
  // oficial que confirma a comissão. Mostra também outras licitações do
  // cliente em andamento, desabilitadas, para deixar claro o motivo.
  const clientBiddings = biddings.filter((b) => b.clientId === form.clientId)
  const wonBiddings = clientBiddings.filter((b) => b.status === 'Ganhou')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    if (!initial && tipoLancamento === 'recorrente') {
      const itens: EmpenhoRecorrenteItem[] = [
        {
          dataEmpenho: form.dataEmpenho ?? todayLocalISO(),
          numeroEmpenho: form.numeroEmpenho?.trim() || null,
          numeroNotaFiscal: form.numeroNotaFiscal?.trim() || null,
          valorEmpenhada: form.valorEmpenhada ?? 0,
        },
        ...itensSerie.map((it) => ({
          dataEmpenho: it.dataEmpenho,
          numeroEmpenho: it.numeroEmpenho.trim() || null,
          numeroNotaFiscal: it.numeroNotaFiscal.trim() || null,
          valorEmpenhada: it.valorEmpenhada,
        })),
      ]
      onSaveSerie(form, itens)
      return
    }

    // "Único"/"Parcelado" num empenho novo definem modoParcelamento só
    // agora, a partir do Tipo de Lançamento escolhido — na edição,
    // modoParcelamento já vem sendo controlado pelo toggle de baixo
    // ("Forma de Recebimento da Comissão", inalterado) e form já está certo.
    const finalForm = !initial
      ? { ...form, modoParcelamento: (tipoLancamento === 'parcelado' ? 'quantidade_fixa' : 'integral') as ModoParcelamento }
      : form
    onSave(finalForm)
  }

  const parcelasPreview = (() => {
    if (form.modoParcelamento === 'integral') return '1 parcela (pagamento integral)'
    if (form.modoParcelamento === 'quantidade_fixa') return `${form.quantidadeParcelas ?? 0} parcelas, dividindo o valor total entre elas`
    const periodoLabel: Record<Periodicidade, string> = { mensal: 'mês', trimestral: 'trimestre', semestral: 'semestre', anual: 'ano' }
    return `${form.quantidadeParcelas ?? 0} parcelas de ${formatBRL(form.valorComissaoTotal ?? 0)} cada, uma por ${periodoLabel[form.periodicidade ?? 'mensal']}`
  })()

  // Rótulos dos 4 campos principais mudam pra deixar claro que, em modo
  // Recorrente, eles descrevem só o 1º mês da série — o resto é revisado na
  // tabela abaixo.
  const rotulos = tipoLancamento === 'recorrente' && !initial
    ? { data: 'Data do 1º Empenho', valor: 'Valor Empenhado (1º mês)', numero: 'Número do 1º Empenho', nf: 'Nota Fiscal do 1º mês' }
    : { data: 'Data do Empenho', valor: 'Valor Empenhado (R$)', numero: 'Nº do Empenho', nf: 'Nº Nota Fiscal' }

  const totalMesesSerie = 1 + itensSerie.length
  const numerosSerie = [form.numeroEmpenho, ...itensSerie.map((i) => i.numeroEmpenho)]
  const pendentesSerie = numerosSerie.filter((n) => !n?.trim()).length
  const pct = form.percentualComissao ?? 0
  const comissaoDoMes = (valor: number) => Math.round(valor * (pct / 100) * 100) / 100
  const totalValorSerie = (form.valorEmpenhada ?? 0) + itensSerie.reduce((s, i) => s + i.valorEmpenhada, 0)
  const totalComissaoSerie = comissaoDoMes(form.valorEmpenhada ?? 0) + itensSerie.reduce((s, i) => s + comissaoDoMes(i.valorEmpenhada), 0)

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar Empenho' : 'Novo Empenho'} maxWidth={tipoLancamento === 'recorrente' && !initial ? 'max-w-3xl' : 'max-w-lg'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {initial && (
          <div className="bg-warning-500/10 border border-warning-500/25 rounded-lg p-3 text-[12px] text-warning-300">
            Ao salvar, as parcelas ainda <strong>pendentes</strong> deste empenho serão recalculadas com os novos valores. Parcelas já marcadas como <strong>Pagas</strong> não são alteradas.
          </div>
        )}

        {initial?.status === 'Faturado' && (
          <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 text-[12px] text-accent-300">
            Este empenho já está <strong>Faturado</strong> (a prefeitura já reconheceu este valor oficialmente). Você ainda pode corrigir valor, comissão ou parcelamento aqui — recomendado apenas para ajustes de erro de digitação, já que pode haver nota fiscal emitida com base no valor anterior.
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
          <Field label={rotulos.numero} required={tipoLancamento !== 'recorrente' || !!initial}>
            <Input required={tipoLancamento !== 'recorrente' || !!initial} value={form.numeroEmpenho ?? ''} onChange={(e) => setForm({ ...form, numeroEmpenho: e.target.value })} placeholder={tipoLancamento === 'recorrente' && !initial ? 'a definir' : '1234/2026'} />
          </Field>
          <Field label={rotulos.nf}>
            <Input value={form.numeroNotaFiscal ?? ''} onChange={(e) => setForm({ ...form, numeroNotaFiscal: e.target.value })} placeholder="NF-e 1245" />
          </Field>
        </div>

        <Field label={rotulos.data} required>
          <Input type="date" required value={form.dataEmpenho ?? ''} onChange={(e) => setForm({ ...form, dataEmpenho: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={rotulos.valor} required>
            <CurrencyInput value={form.valorEmpenhada ?? 0} onChange={(v) => setForm({ ...form, valorEmpenhada: v })} />
          </Field>
          <Field label="Comissão (%)" required>
            <Input type="number" step="0.01" min={0.01} required value={form.percentualComissao ?? ''} onChange={(e) => setForm({ ...form, percentualComissao: parseFloat(e.target.value) || 0 })} />
          </Field>
        </div>

        <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-base-300">Comissão {tipoLancamento === 'recorrente' && !initial ? 'do 1º Mês' : 'Total'} Calculada</span>
          <span className="text-base font-extrabold font-mono text-accent-300">{formatBRL(form.valorComissaoTotal ?? 0)}</span>
        </div>

        {initial ? (
          <>
            {/* Edição de um empenho já existente — "Forma de Recebimento da
                Comissão" continua controlando modoParcelamento diretamente,
                sem nenhuma mudança de comportamento. Inclui o caso legado
                'recorrente' (um único empenho com a comissão repetida em N
                parcelas) — continua editável aqui mesmo depois da Série
                Recorrente existir, já que edita um empenho por vez, nunca
                gera vários. */}
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
              <>
                <Field label="Quantidade de Parcelas" required>
                  <Input type="number" min={1} max={60} required value={form.quantidadeParcelas ?? 3} onChange={(e) => setForm({ ...form, quantidadeParcelas: parseInt(e.target.value) || 1 })} />
                </Field>
                <p className="text-[11px] text-base-500 -mt-1">{parcelasPreview}</p>
              </>
            )}

            {form.modoParcelamento === 'recorrente' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Quantidade de Parcelas" required>
                    <Input type="number" min={1} max={120} required value={form.quantidadeParcelas ?? 12} onChange={(e) => setForm({ ...form, quantidadeParcelas: parseInt(e.target.value) || 1 })} />
                  </Field>
                  <Field label="Periodicidade" required>
                    <Select required value={form.periodicidade ?? 'mensal'} onChange={(e) => setForm({ ...form, periodicidade: e.target.value as Periodicidade })}>
                      <option value="mensal">Mensal</option>
                      <option value="trimestral">Trimestral</option>
                      <option value="semestral">Semestral</option>
                      <option value="anual">Anual</option>
                    </Select>
                  </Field>
                </div>
                <p className="text-[11px] text-base-500 -mt-1">
                  {parcelasPreview}. Se o contrato for aditado/prorrogado depois, volte aqui e aumente a quantidade — o sistema gera só as parcelas novas, sem duplicar as existentes.
                </p>
              </>
            )}
          </>
        ) : (
          <>
            {/* Empenho novo — Tipo de Lançamento decide se esta ação cria 1
                empenho (Único/Parcelado) ou N empenhos de uma vez (Recorrente). */}
            <Field label="Tipo de Lançamento">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: 'unico', label: 'Único', desc: 'Um empenho, comissão recebida de uma vez' },
                  { v: 'parcelado', label: 'Parcelado', desc: 'Um empenho, comissão recebida em N parcelas' },
                  { v: 'recorrente', label: 'Recorrente', desc: 'Contrato mensal — gera vários empenhos, um por mês' },
                ] as { v: TipoLancamento; label: string; desc: string }[]).map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setTipoLancamento(opt.v)}
                    className={`text-left p-2.5 rounded-lg border transition ${tipoLancamento === opt.v ? 'bg-accent-500/10 border-accent-500/40' : 'bg-base-850 border-base-700 hover:border-base-600'}`}
                  >
                    <span className={`block text-[12px] font-bold mb-0.5 ${tipoLancamento === opt.v ? 'text-accent-300' : 'text-base-300'}`}>{opt.label}</span>
                    <span className="block text-[10.5px] text-base-500 leading-snug">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </Field>

            {tipoLancamento === 'unico' && (
              <p className="text-[11px] text-base-500 -mt-1">Nada mais a configurar — o empenho é salvo com os dados acima e a comissão inteira fica a receber numa parcela só.</p>
            )}

            {tipoLancamento === 'parcelado' && (
              <>
                <Field label="Quantidade de Parcelas" required>
                  <Input type="number" min={1} max={60} required value={form.quantidadeParcelas ?? 3} onChange={(e) => setForm({ ...form, quantidadeParcelas: parseInt(e.target.value) || 1 })} />
                </Field>
                <p className="text-[11px] text-base-500 -mt-1">
                  {`${form.quantidadeParcelas ?? 0} parcelas de ${formatBRL((form.valorComissaoTotal ?? 0) / Math.max(1, form.quantidadeParcelas ?? 1))} cada, uma por mês — continua sendo um único empenho (mesmo número, mesma nota fiscal); só o recebimento da comissão é dividido.`}
                </p>
              </>
            )}

            {tipoLancamento === 'recorrente' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Quantidade de Meses" required>
                    <Input type="number" min={1} max={120} required value={form.quantidadeParcelas ?? 12} onChange={(e) => setForm({ ...form, quantidadeParcelas: parseInt(e.target.value) || 1 })} />
                  </Field>
                  <Field label="Periodicidade" required>
                    <Select required value={form.periodicidade ?? 'mensal'} onChange={(e) => setForm({ ...form, periodicidade: e.target.value as Periodicidade })}>
                      <option value="mensal">Mensal</option>
                      <option value="trimestral">Trimestral</option>
                      <option value="semestral">Semestral</option>
                      <option value="anual">Anual</option>
                    </Select>
                  </Field>
                </div>

                <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 text-[12px] text-accent-200">
                  Os campos <strong>Número, Nota Fiscal, Data e Valor</strong> acima viram só o <strong>1º mês</strong> da série. Revise e ajuste cada mês na tabela abaixo — a prefeitura normalmente só emite o número dos meses futuros mais perto da data, então pode deixar em branco ("a definir") e completar depois.
                </div>

                <div className="border border-base-700/50 rounded-lg overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-base-850 border-b border-base-700/50">
                    <span className="text-[11px] font-bold text-base-300">Revisão da série — {totalMesesSerie} empenhos</span>
                    <span className={`text-[11px] font-bold ${pendentesSerie === 0 ? 'text-positive-400' : 'text-warning-400'}`}>
                      {pendentesSerie === 0 ? 'Todos os números preenchidos' : `${pendentesSerie} de ${totalMesesSerie} números ainda não preenchidos`}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-base-900/40 text-left">
                          <th className="px-2 py-2 text-[9.5px] font-bold uppercase text-base-500">Mês</th>
                          <th className="px-2 py-2 text-[9.5px] font-bold uppercase text-base-500">Data</th>
                          <th className="px-2 py-2 text-[9.5px] font-bold uppercase text-base-500">Número</th>
                          <th className="px-2 py-2 text-[9.5px] font-bold uppercase text-base-500">Nota Fiscal</th>
                          <th className="px-2 py-2 text-[9.5px] font-bold uppercase text-base-500">Valor</th>
                          <th className="px-2 py-2 text-[9.5px] font-bold uppercase text-base-500">Comissão</th>
                          <th className="px-2 py-2 text-[9.5px] font-bold uppercase text-base-500">Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-base-800">
                          <td className="px-2 py-1.5 font-bold text-base-300 whitespace-nowrap">1/{totalMesesSerie}</td>
                          <td className="px-2 py-1.5"><Input type="date" value={form.dataEmpenho ?? ''} onChange={(e) => setForm({ ...form, dataEmpenho: e.target.value })} className="!py-1 !px-2 text-[12px]" /></td>
                          <td className="px-2 py-1.5"><Input value={form.numeroEmpenho ?? ''} onChange={(e) => setForm({ ...form, numeroEmpenho: e.target.value })} placeholder="a definir" className="!py-1 !px-2 text-[12px]" /></td>
                          <td className="px-2 py-1.5"><Input value={form.numeroNotaFiscal ?? ''} onChange={(e) => setForm({ ...form, numeroNotaFiscal: e.target.value })} placeholder="—" className="!py-1 !px-2 text-[12px]" /></td>
                          <td className="px-2 py-1.5"><Input type="number" step="0.01" value={form.valorEmpenhada ?? ''} onChange={(e) => setForm({ ...form, valorEmpenhada: parseFloat(e.target.value) || 0 })} className="!py-1 !px-2 text-[12px]" /></td>
                          <td className="px-2 py-1.5 font-mono text-base-400 whitespace-nowrap">{formatBRL(comissaoDoMes(form.valorEmpenhada ?? 0))}</td>
                          <td className="px-2 py-1.5">
                            {form.numeroEmpenho?.trim() ? (
                              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-positive-500/15 text-positive-400 whitespace-nowrap">Pronto</span>
                            ) : (
                              <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-warning-500/15 text-warning-400 whitespace-nowrap">Número pendente</span>
                            )}
                          </td>
                        </tr>
                        {itensSerie.map((item, idx) => (
                          <tr key={idx} className="border-t border-base-800">
                            <td className="px-2 py-1.5 font-bold text-base-300 whitespace-nowrap">{idx + 2}/{totalMesesSerie}</td>
                            <td className="px-2 py-1.5"><Input type="date" value={item.dataEmpenho} onChange={(e) => updateItemSerie(idx, { dataEmpenho: e.target.value })} className="!py-1 !px-2 text-[12px]" /></td>
                            <td className="px-2 py-1.5"><Input value={item.numeroEmpenho} onChange={(e) => updateItemSerie(idx, { numeroEmpenho: e.target.value })} placeholder="a definir" className="!py-1 !px-2 text-[12px]" /></td>
                            <td className="px-2 py-1.5"><Input value={item.numeroNotaFiscal} onChange={(e) => updateItemSerie(idx, { numeroNotaFiscal: e.target.value })} placeholder="—" className="!py-1 !px-2 text-[12px]" /></td>
                            <td className="px-2 py-1.5"><Input type="number" step="0.01" value={item.valorEmpenhada} onChange={(e) => updateItemSerie(idx, { valorEmpenhada: parseFloat(e.target.value) || 0 })} className="!py-1 !px-2 text-[12px]" /></td>
                            <td className="px-2 py-1.5 font-mono text-base-400 whitespace-nowrap">{formatBRL(comissaoDoMes(item.valorEmpenhada))}</td>
                            <td className="px-2 py-1.5">
                              {item.numeroEmpenho.trim() ? (
                                <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-positive-500/15 text-positive-400 whitespace-nowrap">Pronto</span>
                              ) : (
                                <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-warning-500/15 text-warning-400 whitespace-nowrap">Número pendente</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-base-700 bg-base-850/60">
                          <td colSpan={4} className="px-2 py-2 text-right text-[11px] font-bold text-base-400">Total:</td>
                          <td className="px-2 py-2 font-mono font-bold text-base-200 whitespace-nowrap">{formatBRL(totalValorSerie)}</td>
                          <td className="px-2 py-2 font-mono font-bold text-accent-300 whitespace-nowrap">{formatBRL(totalComissaoSerie)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                <p className="text-[11px] text-base-500 -mt-1 flex items-start gap-1.5">
                  <span>ℹ️</span>
                  <span>Comissão de cada mês já é lançada normalmente, mesmo com o número pendente — complete depois editando aquele empenho específico na lista. Se o contrato for aditado/prorrogado, gere uma nova série a partir do próximo mês.</span>
                </p>
              </>
            )}
          </>
        )}

        <Field label="Observação">
          <Textarea rows={2} value={form.observacao ?? ''} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
        </Field>

        <ErrorAlert error={error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isSaving || !form.clientId || !form.biddingId}>
            {isSaving ? 'Salvando...' : tipoLancamento === 'recorrente' && !initial ? `Gerar ${totalMesesSerie} Empenhos` : 'Salvar Empenho'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
