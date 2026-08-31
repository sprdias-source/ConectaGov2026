import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Upload, FileSpreadsheet, Lock, Wand2, Check } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Input } from '../ui/FormControls'
import { parseFlexibleNumber, compararNumeroItem } from '../../lib/numberParsing'
import { useToast } from '../../hooks/useToast'
import type { BiddingItem } from '../../types/domain'
import { formatBRL } from '../../hooks/useAccountBalances'
import TopScrollTable from '../ui/TopScrollTable'

type ItemDraft = Partial<BiddingItem> & { _key: string }

let keyCounter = 0
const newKey = () => `item-${Date.now()}-${keyCounter++}`

// Percentual e valor em R$ da queda entre o que foi licitado e o que foi
// ofertado — null enquanto o valor ofertado ainda não foi preenchido (não
// dá pra calcular decremento de nada). É só um número calculado na hora
// pra visualização/relatórios, nunca persistido.
function calcularDecremento(d: ItemDraft): { pct: number; abs: number } | null {
  const licitado = d.valorUnitarioLicitado ?? 0
  const ofertado = d.valorUnitarioOfertado
  if (ofertado == null || licitado <= 0) return null
  return { abs: licitado - ofertado, pct: ((licitado - ofertado) / licitado) * 100 }
}

function DecrementoView({ item }: { item: ItemDraft }) {
  const dec = calcularDecremento(item)
  if (!dec) return <span className="text-base-600">—</span>
  const sinal = dec.pct >= 0 ? '−' : '+'
  return (
    <span className={`font-mono font-bold ${dec.pct >= 0 ? 'text-warning-400' : 'text-negative-400'}`}>
      {sinal}{Math.abs(dec.pct).toFixed(2).replace('.', ',')}%
      <span className="block text-[9.5px] font-medium text-base-500">{formatBRL(Math.abs(dec.abs))}</span>
    </span>
  )
}

// Redimensiona a altura da textarea pro conteúdo atual — chamado tanto no
// ref (altura certa já no primeiro render, útil pra itens importados via
// Excel com descrição longa) quanto a cada tecla digitada. Função de módulo
// (não fechada sobre nenhum estado do componente) pra não recriar a
// referência a cada render e disparar o ref de novo à toa.
function ajustarAlturaTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// Descrição, Marca e Modelo são texto livre de tamanho imprevisível — em
// vez de esticar a coluna pra caber tudo numa linha só (o que forçava a
// tabela inteira a ficar enorme), o campo tem uma largura fixa modesta e
// QUEBRA LINHA quando o texto não cabe, crescendo em altura em vez de em
// largura.
function CampoTextoQuebraLinha({
  value, onChange, placeholder, className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <textarea
      ref={ajustarAlturaTextarea}
      rows={1}
      value={value}
      onChange={(e) => { ajustarAlturaTextarea(e.currentTarget); onChange(e.target.value) }}
      placeholder={placeholder}
      className={`w-full resize-none overflow-hidden bg-base-850 border border-base-700 rounded-lg px-2 py-1 text-[12px] leading-snug text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition ${className}`}
    />
  )
}

// Campo de valor monetário em miniatura, no mesmo estilo "calculadora" do
// CurrencyInput (dígitos entram pela direita) — só que aceita `null` pra
// representar "ainda não preenchido" (essencial pro Vl. Unit. Ofertado, que
// começa vazio até o usuário digitar algo, ver CORREÇÃO DE BUG mais abaixo
// sobre não confundir "vazio" com "zero"). Sem estado interno: o valor
// exibido é derivado direto da prop a cada render, então não precisa de
// useEffect pra ressincronizar quando o item muda por fora (import de
// Excel, autosave recarregando os itens).
function CampoValorMonetario({
  value, onChange, placeholder = 'R$ 0,00',
}: {
  value: number | null | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
}) {
  const display = value == null ? '' : (value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const digitsOnly = e.currentTarget.value.replace(/\D/g, '')
    if (digitsOnly === '') { onChange(undefined); return }
    onChange(parseInt(digitsOnly, 10) / 100)
  }

  return (
    <div className="relative">
      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9.5px] text-base-500 pointer-events-none">R$</span>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={() => {}}
        onInput={handleInput}
        placeholder={placeholder}
        className="w-full bg-base-850 border border-base-700 rounded-lg pl-6 pr-2 py-1 text-[12px] text-base-100 placeholder:text-base-500 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition text-right font-mono tabular-nums"
      />
    </div>
  )
}

// Quantidade é número, não faz sentido quebrar em duas linhas — em vez
// disso, tem um tamanho fixo confortável pra 4 dígitos (o caso comum) e só
// cresce pro lado quando o valor digitado precisar de mais espaço.
function CampoQuantidade({
  value, onChange, className = '',
}: {
  value: number | undefined
  onChange: (value: number) => void
  className?: string
}) {
  const largura = Math.max(String(value ?? '').length, 4) + 1
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      style={{ width: `${largura}ch` }}
      className={`bg-base-850 border border-base-700 rounded-lg px-2 py-1 text-[12px] font-mono text-base-100 focus:border-accent-400 focus:ring-1 focus:ring-accent-400/30 outline-none transition ${className}`}
    />
  )
}

export default function BiddingItemsEditor({
  items, onChange, tipoDisputa, travarValorLicitado, onGerarPrevia, previaGerada,
}: {
  items: Partial<BiddingItem>[]
  onChange: (items: Partial<BiddingItem>[]) => void
  tipoDisputa: 'Item' | 'Lote'
  // "Vl. Unit. Licitado" só é travado no contexto da Proposta Readequada —
  // lá o valor tem que vir da análise do edital, sem risco de alguém mudar
  // sem querer. No cadastro inicial da licitação (BiddingFormModal) esse
  // valor ainda está sendo digitado pela primeira vez, então continua editável.
  travarValorLicitado?: boolean
  // Botão "Gerar Proposta Prévia" só aparece quando o pai (AbaProposta)
  // passa esse callback — ele é quem controla o estado de trava/destrava.
  onGerarPrevia?: () => void
  previaGerada?: boolean
}) {
  const { showToast } = useToast()
  const [drafts, setDrafts] = useState<ItemDraft[]>([])
  // Guarda a última lista que NÓS mesmos emitimos via onChange, pra
  // diferenciar "items mudou porque o pai ecoou nossa própria edição" (não
  // deve resincronizar — resetaria o cursor/foco a cada tecla digitada) de
  // "items mudou porque chegou dado novo de fora" (ex: os itens da
  // licitação ainda estavam carregando quando este componente montou pela
  // primeira vez, ou o "Preencher Licitação com estes Dados" atualizou os
  // itens enquanto esta aba estava aberta) — nesse segundo caso, SIM precisa
  // resincronizar, senão o formulário fica preso pra sempre no que veio no
  // primeiro render, mesmo depois do dado real chegar.
  const ultimoEmitido = useRef<Partial<BiddingItem>[] | null>(null)

  useEffect(() => {
    if (items === ultimoEmitido.current) return
    // Reaproveita a _key de itens já salvos (casando por id) em vez de gerar
    // uma nova pra cada linha sempre que a prop muda — sem isso, toda vez
    // que o autosave (aba Cadastrar Proposta, useBiddingItemsDaLicitacao)
    // termina e invalida a query, a lista inteira remontava com keys novas
    // e quem estivesse digitando num campo naquele instante perdia o foco
    // no meio da frase. Itens sem id (recém-adicionados, ainda não salvos)
    // sempre ganham uma key nova mesmo — não têm com o que casar.
    setDrafts((atual) => {
      const keyPorId = new Map(atual.filter((d) => d.id).map((d) => [d.id as string, d._key]))
      return items.map((i) => ({ ...i, _key: (i.id && keyPorId.get(i.id)) || newKey() }))
    })
  }, [items])

  const emitChange = (next: ItemDraft[]) => {
    setDrafts(next)
    const stripped = next.map(({ _key, ...rest }) => rest)
    ultimoEmitido.current = stripped
    onChange(stripped)
  }

  const addRow = () => {
    emitChange([
      ...drafts,
      { _key: newKey(), numeroItem: String(drafts.length + 1), lote: '', descricao: '', unidade: 'UN', quantidade: 1, marca: '', referencia: '', valorUnitarioLicitado: 0, valorUnitarioOfertado: null, ganhou: false },
    ])
  }

  const updateRow = (key: string, patch: Partial<ItemDraft>) => {
    emitChange(drafts.map((d) => (d._key === key ? { ...d, ...patch } : d)))
  }

  const removeRow = (key: string) => {
    emitChange(drafts.filter((d) => d._key !== key))
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet)

        const imported: ItemDraft[] = []
        let linhasComProblema = 0

        for (const [idx, row] of rows.entries()) {
          const get = (...keys: string[]) => {
            for (const k of Object.keys(row)) {
              if (keys.some((target) => k.toLowerCase().trim() === target)) return row[k]
            }
            return undefined
          }

          const descricao = String(get('descrição', 'descricao', 'objeto', 'especificação') ?? '').trim()
          if (!descricao) continue

          const qtdRaw = get('quantidade', 'qtd', 'qtde')
          const valorRaw = get('valor unitário', 'valor unitario', 'vl unitário', 'preço unitário')
          const qtd = parseFlexibleNumber(qtdRaw)
          const valorUnit = parseFlexibleNumber(valorRaw)

          // Se a coluna existia mas não pôde ser interpretada como número,
          // sinaliza para o usuário em vez de silenciosamente usar 0 ou 1 —
          // um valor errado aqui distorce o total da licitação sem aviso.
          if ((qtdRaw !== undefined && qtd === null) || (valorRaw !== undefined && valorUnit === null)) {
            linhasComProblema++
          }
          // Valores negativos quase sempre indicam erro de digitação na
          // planilha (ex: "-50,00" em vez de "50,00") — improvável ser
          // intencional em um item de licitação, então também sinalizamos.
          if ((qtd !== null && qtd < 0) || (valorUnit !== null && valorUnit < 0)) {
            linhasComProblema++
          }

          imported.push({
            _key: newKey(),
            numeroItem: String(get('item', 'nº', 'numero', 'número') ?? idx + 1),
            lote: String(get('lote') ?? '') || undefined,
            descricao,
            unidade: String(get('unidade', 'un', 'und') ?? 'UN'),
            quantidade: qtd ?? 1,
            marca: String(get('marca', 'fabricante', 'marca/fabricante') ?? '') || undefined,
            referencia: String(get('referência', 'referencia', 'ref', 'ref.', 'modelo') ?? '') || undefined,
            valorUnitarioLicitado: valorUnit ?? 0,
            valorUnitarioOfertado: null,
            ganhou: false,
          })
        }

        if (imported.length > 0) {
          // A planilha às vezes já vem com a coluna Item fora de ordem
          // (exportações de portal costumam vir ordenadas como texto: "1",
          // "10", "11" antes de "2") — reordena numericamente na importação
          // em vez de manter a ordem (quebrada) das linhas do arquivo.
          imported.sort((a, b) => compararNumeroItem(a.numeroItem ?? '', b.numeroItem ?? ''))
          emitChange([...drafts, ...imported])
          showToast(`${imported.length} item(ns) importado(s) da planilha.`)
        }
        if (linhasComProblema > 0) {
          showToast(`${linhasComProblema} linha(s) tinham valores de quantidade/preço suspeitos (não reconhecidos ou negativos) — revise manualmente antes de salvar.`, 'error')
        }
        if (imported.length === 0) {
          showToast('Nenhum item foi encontrado. Verifique se a planilha tem uma coluna de Descrição preenchida.', 'error')
        }
      } catch {
        showToast('Não foi possível ler este arquivo. Verifique se é uma planilha Excel (.xlsx) válida com colunas de Item, Descrição, Quantidade e Valor Unitário.', 'error')
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const totalLicitado = drafts.reduce((s, d) => s + (d.quantidade ?? 0) * (d.valorUnitarioLicitado ?? 0), 0)
  const totalOfertado = drafts.reduce((s, d) => s + (d.quantidade ?? 0) * (d.valorUnitarioOfertado ?? d.valorUnitarioLicitado ?? 0), 0)

  // Mesmo fallback usado na prévia da Proposta Readequada: se algum item já
  // foi marcado como "Ganhou", o total geral considera só esses; senão,
  // ainda não dá pra saber o que foi ganho, então soma todos.
  const itensGanhosOuTodos = drafts.some((d) => d.ganhou) ? drafts.filter((d) => d.ganhou) : drafts
  const totalGeralGanhos = itensGanhosOuTodos.reduce((s, d) => s + (d.quantidade ?? 0) * (d.valorUnitarioOfertado ?? d.valorUnitarioLicitado ?? 0), 0)

  // Quando a disputa é por lote, agrupa os itens pelo campo "lote" (na ordem
  // em que cada lote apareceu pela primeira vez) pra mostrar um subtotal
  // logo abaixo de cada grupo — assim fica fácil conferir o valor de cada
  // lote sem precisar somar manualmente.
  const gruposPorLote = tipoDisputa === 'Lote'
    ? (() => {
        const mapa = new Map<string, ItemDraft[]>()
        for (const d of drafts) {
          const chave = (d.lote ?? '').trim() || 'Sem lote'
          if (!mapa.has(chave)) mapa.set(chave, [])
          mapa.get(chave)!.push(d)
        }
        return Array.from(mapa.entries()).map(([lote, itens]) => ({
          lote,
          itens,
          subtotalLicitado: itens.reduce((s, d) => s + (d.quantidade ?? 0) * (d.valorUnitarioLicitado ?? 0), 0),
          subtotalOfertado: itens.reduce((s, d) => s + (d.quantidade ?? 0) * (d.valorUnitarioOfertado ?? d.valorUnitarioLicitado ?? 0), 0),
        }))
      })()
    : null

  const renderLinhaDesktop = (d: ItemDraft) => (
    <tr key={d._key} className="border-t border-base-800">
      <td className="px-2 py-1.5">
        <Input value={d.numeroItem ?? ''} onChange={(e) => updateRow(d._key, { numeroItem: e.target.value })} className="!py-1 !px-2 text-[12px]" />
      </td>
      {tipoDisputa === 'Lote' && (
        <td className="px-2 py-1.5">
          <Input value={d.lote ?? ''} onChange={(e) => updateRow(d._key, { lote: e.target.value })} className="!py-1 !px-2 text-[12px]" placeholder="1" />
        </td>
      )}
      <td className="px-2 py-1.5">
        <CampoTextoQuebraLinha value={d.descricao ?? ''} onChange={(v) => updateRow(d._key, { descricao: v })} placeholder="Descrição do item" />
      </td>
      <td className="px-2 py-1.5">
        <Input value={d.unidade ?? ''} onChange={(e) => updateRow(d._key, { unidade: e.target.value })} className="!py-1 !px-2 text-[12px]" />
      </td>
      <td className="px-2 py-1.5">
        <CampoQuantidade value={d.quantidade} onChange={(v) => updateRow(d._key, { quantidade: v })} />
      </td>
      <td className="px-2 py-1.5">
        <CampoTextoQuebraLinha value={d.marca ?? ''} onChange={(v) => updateRow(d._key, { marca: v })} placeholder="—" />
      </td>
      <td className="px-2 py-1.5">
        <CampoTextoQuebraLinha value={d.referencia ?? ''} onChange={(v) => updateRow(d._key, { referencia: v })} placeholder="—" />
      </td>
      <td className="px-2 py-1.5">
        {/* A trava só vale pra item que já existia (veio da análise do
            edital, tem id salvo) — um item adicionado manualmente ou
            importado depois nunca tem id ainda neste ponto, então nasceria
            com valor licitado 0 e travado pra sempre, sem nenhum jeito de
            corrigir na tela. */}
        {travarValorLicitado && d.id ? (
          <span className="flex items-center justify-end gap-1 font-mono text-[12px] text-base-500 py-1 px-2" title="Vem da análise do edital — não editável aqui">
            {formatBRL(d.valorUnitarioLicitado ?? 0)} <Lock className="w-3 h-3 shrink-0" />
          </span>
        ) : (
          <CampoValorMonetario value={d.valorUnitarioLicitado ?? 0} onChange={(v) => updateRow(d._key, { valorUnitarioLicitado: v ?? 0 })} />
        )}
      </td>
      <td className="px-2 py-1.5">
        {/* CORREÇÃO DE BUG preservada: `v ?? undefined` só cai em undefined
            quando o campo está de fato vazio — 0 explícito (R$0,00) nunca é
            tratado como "não preenchido" (ver CampoValorMonetario). */}
        <CampoValorMonetario value={d.valorUnitarioOfertado} onChange={(v) => updateRow(d._key, { valorUnitarioOfertado: v })} />
      </td>
      <td className="px-2 py-1.5 text-right font-mono text-[12px] text-base-300">
        {formatBRL((d.quantidade ?? 0) * (d.valorUnitarioOfertado ?? d.valorUnitarioLicitado ?? 0))}
      </td>
      <td className="px-2 py-1.5 text-right text-[11px]">
        <DecrementoView item={d} />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={d.ganhou ?? false}
          onChange={(e) => updateRow(d._key, { ganhou: e.target.checked })}
          title="Marcar se este item foi ganho nesta disputa"
          className="w-4 h-4 accent-accent-500 cursor-pointer"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <button type="button" onClick={() => removeRow(d._key)} className="text-base-500 hover:text-negative-400 transition">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )

  const renderSubtotalDesktop = (lote: string, subtotalLicitado: number, subtotalOfertado: number) => (
    <tr key={`subtotal-${lote}`} className="bg-accent-500/10 border-t border-accent-400/30">
      <td colSpan={7} className="px-2 py-1.5 text-right text-[11px] font-bold text-accent-300">Subtotal do Lote {lote}:</td>
      <td className="px-2 py-1.5 font-mono font-bold text-base-200">{formatBRL(subtotalLicitado)}</td>
      <td className="px-2 py-1.5 font-mono font-bold text-accent-300">{formatBRL(subtotalOfertado)}</td>
      <td className="px-2 py-1.5 font-mono font-bold text-accent-300">{formatBRL(subtotalOfertado)}</td>
      <td colSpan={3} />
    </tr>
  )

  const renderCardMobile = (d: ItemDraft) => (
    <div key={d._key} className="border border-base-700/50 rounded-lg p-3 bg-base-900/40 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <div className="w-14 shrink-0">
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Nº</p>
          <Input value={d.numeroItem ?? ''} onChange={(e) => updateRow(d._key, { numeroItem: e.target.value })} className="!py-1.5 !px-2 text-[13px]" />
        </div>
        {tipoDisputa === 'Lote' && (
          <div className="w-16 shrink-0">
            <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Lote</p>
            <Input value={d.lote ?? ''} onChange={(e) => updateRow(d._key, { lote: e.target.value })} className="!py-1.5 !px-2 text-[13px]" placeholder="1" />
          </div>
        )}
        <div className="flex-1">
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Descrição</p>
          <CampoTextoQuebraLinha value={d.descricao ?? ''} onChange={(v) => updateRow(d._key, { descricao: v })} placeholder="Descrição do item" className="!text-[13px]" />
        </div>
        <button type="button" onClick={() => removeRow(d._key)} className="self-end mb-2 p-1.5 text-base-500 hover:text-negative-400 transition shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Unidade</p>
          <Input value={d.unidade ?? ''} onChange={(e) => updateRow(d._key, { unidade: e.target.value })} className="!py-1.5 !px-2 text-[13px]" />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Quantidade</p>
          <Input type="number" value={d.quantidade ?? ''} onChange={(e) => updateRow(d._key, { quantidade: parseFloat(e.target.value) || 0 })} className="!py-1.5 !px-2 text-[13px]" />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Marca</p>
          <CampoTextoQuebraLinha value={d.marca ?? ''} onChange={(v) => updateRow(d._key, { marca: v })} placeholder="—" className="!text-[13px]" />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Modelo</p>
          <CampoTextoQuebraLinha value={d.referencia ?? ''} onChange={(v) => updateRow(d._key, { referencia: v })} placeholder="—" className="!text-[13px]" />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1 flex items-center gap-1">Vl. Unit. Licitado {travarValorLicitado && d.id && <Lock className="w-2.5 h-2.5" />}</p>
          {travarValorLicitado && d.id ? (
            <p className="font-mono text-[13px] text-base-500 py-1.5">{formatBRL(d.valorUnitarioLicitado ?? 0)}</p>
          ) : (
            <CampoValorMonetario value={d.valorUnitarioLicitado ?? 0} onChange={(v) => updateRow(d._key, { valorUnitarioLicitado: v ?? 0 })} />
          )}
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Vl. Unit. Ofertado</p>
          <CampoValorMonetario value={d.valorUnitarioOfertado} onChange={(v) => updateRow(d._key, { valorUnitarioOfertado: v })} />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Vl. Total</p>
          <p className="font-mono text-[13px] text-base-200 py-1.5">{formatBRL((d.quantidade ?? 0) * (d.valorUnitarioOfertado ?? d.valorUnitarioLicitado ?? 0))}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Decremento</p>
          <p className="py-1.5"><DecrementoView item={d} /></p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-[12px] text-base-300 pt-1 border-t border-base-800">
        <input
          type="checkbox"
          checked={d.ganhou ?? false}
          onChange={(e) => updateRow(d._key, { ganhou: e.target.checked })}
          className="w-4 h-4 accent-accent-500 cursor-pointer"
        />
        Ganhamos este item
      </label>
    </div>
  )

  const renderSubtotalMobile = (lote: string, subtotalLicitado: number, subtotalOfertado: number) => (
    <div key={`subtotal-${lote}`} className="border border-accent-500/25 rounded-lg p-2.5 bg-accent-500/10 flex items-center justify-between text-[11px]">
      <span className="font-bold text-accent-300">Subtotal do Lote {lote}:</span>
      <div className="flex flex-col items-end gap-0.5">
        <span className="font-mono font-bold text-base-200">{formatBRL(subtotalLicitado)}</span>
        <span className="font-mono font-bold text-accent-300">{formatBRL(subtotalOfertado)}</span>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-base-400">
          Itens cadastrados: <strong className="text-base-200">{drafts.length}</strong>
          {tipoDisputa === 'Lote' && gruposPorLote && (
            <span className="ml-1.5 text-base-500">em {gruposPorLote.length} lote(s)</span>
          )}
        </p>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-accent-300 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 cursor-pointer transition">
            <Upload className="w-3.5 h-3.5" /> Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <button type="button" onClick={addRow} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
            <Plus className="w-3.5 h-3.5" /> Adicionar Item
          </button>
          {onGerarPrevia && (
            <button
              type="button" onClick={onGerarPrevia} disabled={previaGerada}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-base-100 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {previaGerada ? <Check className="w-3.5 h-3.5 text-positive-400" /> : <Wand2 className="w-3.5 h-3.5" />}
              {previaGerada ? 'Prévia Gerada' : 'Gerar Proposta Prévia'}
            </button>
          )}
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="border border-dashed border-base-700 rounded-lg py-8 flex flex-col items-center text-base-500 text-[12px]">
          <FileSpreadsheet className="w-6 h-6 mb-2 opacity-50" />
          Nenhum item cadastrado. Adicione manualmente ou importe uma planilha.
        </div>
      ) : (
        <>
          {/* Telas médias/grandes: tabela tradicional — cabe bem todas as colunas
              lado a lado. Em telas estreitas viraria colunas espremidas demais
              (foi exatamente essa compressão que causou a confusão de "dado
              cortado" nesta tela), por isso o layout troca pra cards abaixo. */}
          <div className="hidden md:block">
            <TopScrollTable className="border border-base-700/50 rounded-lg">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-base-850 text-left">
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-10">Nº</th>
                  {tipoDisputa === 'Lote' && <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-11">Lote</th>}
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-56">Descrição</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-14">Unid.</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500">Qtd.</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28">Marca</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28">Modelo</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-32">
                    <span className="flex items-center gap-1">Vl. Unit. Licitado {travarValorLicitado && <Lock className="w-3 h-3 text-base-600" />}</span>
                  </th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-32">Vl. Unit. Ofertado</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28">Vl. Total</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-24">Decremento</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-16 text-center">Ganhou?</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {gruposPorLote
                  ? gruposPorLote.flatMap((g) => [
                      ...g.itens.map(renderLinhaDesktop),
                      renderSubtotalDesktop(g.lote, g.subtotalLicitado, g.subtotalOfertado),
                    ])
                  : drafts.map(renderLinhaDesktop)}
              </tbody>
              <tfoot>
                <tr className="border-t border-base-700 bg-base-850/60">
                  <td colSpan={tipoDisputa === 'Lote' ? 7 : 6} className="px-2 py-2 text-right text-[11px] font-bold text-base-400">Totais:</td>
                  <td className="px-2 py-2 font-mono font-bold text-base-200">{formatBRL(totalLicitado)}</td>
                  <td className="px-2 py-2 font-mono font-bold text-accent-300">{formatBRL(totalOfertado)}</td>
                  <td colSpan={4} />
                </tr>
                <tr className="border-t border-positive-500 bg-positive-500/10">
                  <td colSpan={tipoDisputa === 'Lote' ? 10 : 9} className="px-2 py-2 text-right text-[11px] font-extrabold text-positive-400">
                    Total Geral (itens ganhos):
                  </td>
                  <td colSpan={3} className="px-2 py-2 font-mono font-extrabold text-positive-400">{formatBRL(totalGeralGanhos)}</td>
                </tr>
              </tfoot>
            </table>
            </TopScrollTable>
          </div>

          {/* Resumo fixo no rodapé da viewport, só nas telas largas — fica
              fora do contêiner com overflow-x-auto de propósito: um elemento
              com overflow (mesmo só no eixo X) vira a referência de
              `position: sticky` dos filhos, e como aquele contêiner nunca
              tem altura própria limitada, o sticky não gruda em lugar
              nenhum de verdade lá dentro. Fora dele, gruda direito na base
              da janela (a página inteira rola pela window, sem contêiner
              próprio de overflow-y). Numa licitação com muitos itens, assim
              não precisa rolar até o fim da lista só pra conferir o total. */}
          <div className="hidden md:flex sticky bottom-0 z-10 items-center justify-end gap-6 bg-base-900 border-t border-positive-500/40 rounded-b-lg px-4 py-2 -mt-px">
            <span className="text-[11px] text-base-400">Totais: <span className="font-mono font-bold text-base-200">{formatBRL(totalLicitado)}</span> → <span className="font-mono font-bold text-accent-300">{formatBRL(totalOfertado)}</span></span>
            <span className="text-[11px] font-extrabold text-positive-400">Total Geral (itens ganhos): <span className="font-mono">{formatBRL(totalGeralGanhos)}</span></span>
          </div>

          {/* Celular: cada item vira um card com campos empilhados em largura
              total — nenhum valor fica espremido numa caixinha estreita. */}
          <div className="flex flex-col gap-3 md:hidden">
            {gruposPorLote
              ? gruposPorLote.flatMap((g) => [
                  ...g.itens.map(renderCardMobile),
                  renderSubtotalMobile(g.lote, g.subtotalLicitado, g.subtotalOfertado),
                ])
              : drafts.map(renderCardMobile)}

            {/* Mesma ideia do rodapé sticky da tabela desktop: gruda no fim
                da tela em vez de exigir rolar até o fim da lista de cards. */}
            <div className="sticky bottom-0 flex flex-col gap-2 pt-2 bg-base-900">
              <div className="border border-base-700/50 rounded-lg p-3 bg-base-850 flex items-center justify-between text-[12px]">
                <span className="font-bold text-base-400">Totais:</span>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="font-mono font-bold text-base-200">{formatBRL(totalLicitado)}</span>
                  <span className="font-mono font-bold text-accent-300">{formatBRL(totalOfertado)}</span>
                </div>
              </div>
              <div className="border border-positive-500/40 rounded-lg p-3 bg-positive-500/15 flex items-center justify-between text-[12px]">
                <span className="font-extrabold text-positive-400">Total Geral (itens ganhos):</span>
                <span className="font-mono font-extrabold text-positive-400">{formatBRL(totalGeralGanhos)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
