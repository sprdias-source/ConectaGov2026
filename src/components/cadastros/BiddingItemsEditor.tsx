import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Upload, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Input } from '../ui/FormControls'
import { parseFlexibleNumber } from '../../lib/numberParsing'
import { useToast } from '../../hooks/useToast'
import type { BiddingItem } from '../../types/domain'
import { formatBRL } from '../../hooks/useAccountBalances'

type ItemDraft = Partial<BiddingItem> & { _key: string }

let keyCounter = 0
const newKey = () => `item-${Date.now()}-${keyCounter++}`

export default function BiddingItemsEditor({
  items, onChange, tipoDisputa,
}: {
  items: Partial<BiddingItem>[]
  onChange: (items: Partial<BiddingItem>[]) => void
  tipoDisputa: 'Item' | 'Lote'
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
    setDrafts(items.map((i) => ({ ...i, _key: newKey() })))
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
        <Input value={d.descricao ?? ''} onChange={(e) => updateRow(d._key, { descricao: e.target.value })} className="!py-1 !px-2 text-[12px]" placeholder="Descrição do item" />
      </td>
      <td className="px-2 py-1.5">
        <Input value={d.unidade ?? ''} onChange={(e) => updateRow(d._key, { unidade: e.target.value })} className="!py-1 !px-2 text-[12px]" />
      </td>
      <td className="px-2 py-1.5">
        <Input type="number" value={d.quantidade ?? ''} onChange={(e) => updateRow(d._key, { quantidade: parseFloat(e.target.value) || 0 })} className="!py-1 !px-2 text-[12px]" />
      </td>
      <td className="px-2 py-1.5">
        <Input value={d.marca ?? ''} onChange={(e) => updateRow(d._key, { marca: e.target.value })} className="!py-1 !px-2 text-[12px]" placeholder="—" />
      </td>
      <td className="px-2 py-1.5">
        <Input value={d.referencia ?? ''} onChange={(e) => updateRow(d._key, { referencia: e.target.value })} className="!py-1 !px-2 text-[12px]" placeholder="—" />
      </td>
      <td className="px-2 py-1.5">
        <Input type="number" step="0.01" value={d.valorUnitarioLicitado ?? ''} onChange={(e) => updateRow(d._key, { valorUnitarioLicitado: parseFloat(e.target.value) || 0 })} className="!py-1 !px-2 text-[12px]" />
      </td>
      <td className="px-2 py-1.5">
        <Input type="number" step="0.01" value={d.valorUnitarioOfertado ?? ''} onChange={(e) => updateRow(d._key, { valorUnitarioOfertado: parseFloat(e.target.value) || undefined })} className="!py-1 !px-2 text-[12px]" placeholder="—" />
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
      <td colSpan={2} />
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
          <Input value={d.descricao ?? ''} onChange={(e) => updateRow(d._key, { descricao: e.target.value })} className="!py-1.5 !px-2 text-[13px]" placeholder="Descrição do item" />
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
          <Input value={d.marca ?? ''} onChange={(e) => updateRow(d._key, { marca: e.target.value })} className="!py-1.5 !px-2 text-[13px]" placeholder="—" />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Modelo</p>
          <Input value={d.referencia ?? ''} onChange={(e) => updateRow(d._key, { referencia: e.target.value })} className="!py-1.5 !px-2 text-[13px]" placeholder="—" />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Vl. Unit. Licitado</p>
          <Input type="number" step="0.01" value={d.valorUnitarioLicitado ?? ''} onChange={(e) => updateRow(d._key, { valorUnitarioLicitado: parseFloat(e.target.value) || 0 })} className="!py-1.5 !px-2 text-[13px]" />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase text-base-500 mb-1">Vl. Unit. Ofertado</p>
          <Input type="number" step="0.01" value={d.valorUnitarioOfertado ?? ''} onChange={(e) => updateRow(d._key, { valorUnitarioOfertado: parseFloat(e.target.value) || undefined })} className="!py-1.5 !px-2 text-[13px]" placeholder="—" />
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
          <div className="hidden md:block overflow-x-auto border border-base-700/50 rounded-lg">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-base-850 text-left">
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-16">Nº</th>
                  {tipoDisputa === 'Lote' && <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-20">Lote</th>}
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500">Descrição</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-20">Unid.</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-20">Qtd.</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-24">Marca</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-24">Modelo</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28">Vl. Unit. Licitado</th>
                  <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28">Vl. Unit. Ofertado</th>
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
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
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

            <div className="border border-base-700/50 rounded-lg p-3 bg-base-850/60 flex items-center justify-between text-[12px]">
              <span className="font-bold text-base-400">Totais:</span>
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-mono font-bold text-base-200">{formatBRL(totalLicitado)}</span>
                <span className="font-mono font-bold text-accent-300">{formatBRL(totalOfertado)}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
