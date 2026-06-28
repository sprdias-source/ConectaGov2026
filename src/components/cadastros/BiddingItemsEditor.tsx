import { useEffect, useState } from 'react'
import { Plus, Trash2, Upload, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Input } from '../ui/FormControls'
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
  const [drafts, setDrafts] = useState<ItemDraft[]>([])

  useEffect(() => {
    setDrafts(items.map((i) => ({ ...i, _key: newKey() })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emitChange = (next: ItemDraft[]) => {
    setDrafts(next)
    onChange(next.map(({ _key, ...rest }) => rest))
  }

  const addRow = () => {
    emitChange([
      ...drafts,
      { _key: newKey(), numeroItem: String(drafts.length + 1), descricao: '', unidade: 'UN', quantidade: 1, valorUnitarioLicitado: 0, valorUnitarioOfertado: null },
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

        const imported: ItemDraft[] = rows.map((row, idx) => {
          // Aceita variações comuns de cabeçalho (PT-BR), case-insensitive
          const get = (...keys: string[]) => {
            for (const k of Object.keys(row)) {
              if (keys.some((target) => k.toLowerCase().trim() === target)) return row[k]
            }
            return undefined
          }
          const qtd = Number(get('quantidade', 'qtd', 'qtde') ?? 1) || 1
          const valorUnit = Number(get('valor unitário', 'valor unitario', 'vl unitário', 'preço unitário') ?? 0) || 0
          return {
            _key: newKey(),
            numeroItem: String(get('item', 'nº', 'numero', 'número') ?? idx + 1),
            descricao: String(get('descrição', 'descricao', 'objeto', 'especificação') ?? ''),
            unidade: String(get('unidade', 'un', 'und') ?? 'UN'),
            quantidade: qtd,
            valorUnitarioLicitado: valorUnit,
            valorUnitarioOfertado: null,
          }
        }).filter((d) => d.descricao)

        if (imported.length > 0) {
          emitChange([...drafts, ...imported])
        }
      } catch {
        alert('Não foi possível ler este arquivo. Verifique se é uma planilha Excel (.xlsx) válida com colunas de Item, Descrição, Quantidade e Valor Unitário.')
      }
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  const totalLicitado = drafts.reduce((s, d) => s + (d.quantidade ?? 0) * (d.valorUnitarioLicitado ?? 0), 0)
  const totalOfertado = drafts.reduce((s, d) => s + (d.quantidade ?? 0) * (d.valorUnitarioOfertado ?? d.valorUnitarioLicitado ?? 0), 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-base-400">
          {tipoDisputa === 'Lote' ? 'Lotes' : 'Itens'} cadastrados: <strong className="text-base-200">{drafts.length}</strong>
        </p>
        <div className="flex gap-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-accent-300 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 cursor-pointer transition">
            <Upload className="w-3.5 h-3.5" /> Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <button type="button" onClick={addRow} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
            <Plus className="w-3.5 h-3.5" /> Adicionar {tipoDisputa === 'Lote' ? 'Lote' : 'Item'}
          </button>
        </div>
      </div>

      {drafts.length === 0 ? (
        <div className="border border-dashed border-base-700 rounded-lg py-8 flex flex-col items-center text-base-500 text-[12px]">
          <FileSpreadsheet className="w-6 h-6 mb-2 opacity-50" />
          Nenhum {tipoDisputa === 'Lote' ? 'lote' : 'item'} cadastrado. Adicione manualmente ou importe uma planilha.
        </div>
      ) : (
        <div className="overflow-x-auto border border-base-700/50 rounded-lg">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-base-850 text-left">
                <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-16">Nº</th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500">Descrição</th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-20">Unid.</th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-20">Qtd.</th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28">Vl. Unit. Licitado</th>
                <th className="px-2 py-2 text-[10px] font-bold uppercase text-base-500 w-28">Vl. Unit. Ofertado</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => (
                <tr key={d._key} className="border-t border-base-800">
                  <td className="px-2 py-1.5">
                    <Input value={d.numeroItem ?? ''} onChange={(e) => updateRow(d._key, { numeroItem: e.target.value })} className="!py-1 !px-2 text-[12px]" />
                  </td>
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
                    <Input type="number" step="0.01" value={d.valorUnitarioLicitado ?? ''} onChange={(e) => updateRow(d._key, { valorUnitarioLicitado: parseFloat(e.target.value) || 0 })} className="!py-1 !px-2 text-[12px]" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" step="0.01" value={d.valorUnitarioOfertado ?? ''} onChange={(e) => updateRow(d._key, { valorUnitarioOfertado: parseFloat(e.target.value) || undefined })} className="!py-1 !px-2 text-[12px]" placeholder="—" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => removeRow(d._key)} className="text-base-500 hover:text-negative-400 transition">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-base-700 bg-base-850/60">
                <td colSpan={4} className="px-2 py-2 text-right text-[11px] font-bold text-base-400">Totais:</td>
                <td className="px-2 py-2 font-mono font-bold text-base-200">{formatBRL(totalLicitado)}</td>
                <td className="px-2 py-2 font-mono font-bold text-accent-300">{formatBRL(totalOfertado)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
