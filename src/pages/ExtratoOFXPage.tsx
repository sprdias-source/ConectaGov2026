import { useState, useMemo } from 'react'
import { Upload, FileText, X, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { formatBRL } from '../hooks/useAccountBalances'
import { useTransactions } from '../hooks/useTransactions'
import { todayLocalISO } from '../lib/dateUtils'

interface OFXEntry {
  id: string
  date: string
  description: string
  value: number
  type: 'CREDIT' | 'DEBIT'
}

function parseOFX(content: string): OFXEntry[] {
  const entries: OFXEntry[] = []
  const txBlocks = content.match(/<STMTTRN[\s\S]*?<\/STMTTRN>/gi) ?? []

  for (const block of txBlocks) {
    const get = (tag: string) => {
      const m = block.match(new RegExp('<' + tag + '>([^<\\n]+)', 'i'))
      return m ? m[1].trim() : ''
    }

    const raw = get('TRNAMT').replace(',', '.')
    const value = parseFloat(raw)
    if (isNaN(value)) continue

    const rawDate = get('DTPOSTED')
    const dateStr = rawDate.length >= 8
      ? rawDate.slice(0, 4) + '-' + rawDate.slice(4, 6) + '-' + rawDate.slice(6, 8)
      : todayLocalISO()

    const description = get('MEMO') || get('NAME') || 'Sem descricao'
    const trnType = get('TRNTYPE').toUpperCase()
    const type: 'CREDIT' | 'DEBIT' = (trnType === 'CREDIT' || value > 0) ? 'CREDIT' : 'DEBIT'
    const id = get('FITID') || dateStr + '-' + value + '-' + Math.random().toString(36).slice(2, 6)

    entries.push({ id, date: dateStr, description, value: Math.abs(value), type })
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date))
}

function suggestMatch(
  entry: OFXEntry,
  transactions: Array<{ type: string; value: number; paymentDate?: string | null; dueDate: string; description: string }>
) {
  const targetType = entry.type === 'CREDIT' ? 'Receber' : 'Pagar'
  const entryDate = new Date(entry.date + 'T12:00:00').getTime()
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

  return transactions.find((t) => {
    if (t.type !== targetType) return false
    if (Math.abs(t.value - entry.value) > 0.01) return false
    const txDate = t.paymentDate
      ? new Date(t.paymentDate + 'T12:00:00').getTime()
      : new Date(t.dueDate + 'T12:00:00').getTime()
    return Math.abs(txDate - entryDate) <= THREE_DAYS
  })
}

export default function ExtratoOFXPage() {
  const { transactions } = useTransactions()
  const [entries, setEntries] = useState<OFXEntry[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = (file: File) => {
    const name = file.name.toLowerCase()
    if (!name.endsWith('.ofx') && !name.endsWith('.ofc')) {
      setParseError('Arquivo invalido. Selecione um arquivo .ofx exportado pelo seu banco.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      try {
        const parsed = parseOFX(content)
        if (parsed.length === 0) {
          setParseError('Nenhuma transacao encontrada. O arquivo pode estar em formato nao suportado.')
          return
        }
        setEntries(parsed)
        setFileName(file.name)
        setParseError(null)
      } catch {
        setParseError('Erro ao ler o arquivo. Verifique se o arquivo OFX esta integro.')
      }
    }
    reader.readAsText(file, 'latin1')
  }

  const summary = useMemo(() => ({
    totalEntradas: entries.filter((e) => e.type === 'CREDIT').reduce((s, e) => s + e.value, 0),
    totalSaidas: entries.filter((e) => e.type === 'DEBIT').reduce((s, e) => s + e.value, 0),
    total: entries.length,
    comCorrespondencia: entries.filter((e) => !!suggestMatch(e, transactions)).length,
  }), [entries, transactions])

  return (
    <div className="pb-10">
      <PageHeader
        title="Extrato Bancario (OFX)"
        subtitle="Importe o extrato do banco para conferencia — nenhum dado e gravado ou alterado no sistema"
        icon={FileText}
      />

      {!entries.length ? (
        <div className="px-6 mt-6">
          <Card className="p-8">
            <div
              className={'border-2 border-dashed rounded-xl p-12 text-center transition ' + (isDragging ? 'border-accent-400 bg-accent-500/5' : 'border-base-700 hover:border-base-600')}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                const file = e.dataTransfer.files[0]
                if (file) handleFile(file)
              }}
            >
              <Upload className="w-10 h-10 text-base-600 mx-auto mb-3" />
              <p className="text-base-300 font-semibold mb-1">Arraste o arquivo OFX aqui</p>
              <p className="text-[13px] text-base-500 mb-5">ou clique para selecionar</p>
              <label className="cursor-pointer inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-400 text-base-950 font-bold text-sm px-5 py-2.5 rounded-lg transition">
                <Upload className="w-4 h-4" /> Selecionar arquivo .ofx
                <input type="file" accept=".ofx,.ofc" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </label>
              {parseError && (
                <div className="mt-4 flex items-start gap-2 bg-negative-500/10 border border-negative-500/30 rounded-lg px-3 py-2.5 text-left max-w-md mx-auto">
                  <AlertCircle className="w-4 h-4 text-negative-400 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-negative-400">{parseError}</p>
                </div>
              )}
            </div>
            <div className="mt-5 bg-base-850/60 rounded-lg p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-base-500 mb-2">Como exportar o arquivo OFX</p>
              <ul className="text-[12px] text-base-400 space-y-1 list-disc list-inside">
                <li>Sicredi: Internet Banking - Conta Corrente - Exportar Extrato - Formato OFX</li>
                <li>Bradesco / Itau / BB: Internet Banking - Extrato - Exportar - OFX ou Money</li>
                <li>Nubank / Inter: App - Extrato - Exportar (formato OFX)</li>
              </ul>
            </div>
          </Card>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-6 mt-4">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Arquivo</p>
              <p className="text-[13px] font-semibold text-base-200 truncate">{fileName}</p>
              <button onClick={() => { setEntries([]); setFileName(null) }} className="text-[11px] text-base-500 hover:text-negative-400 mt-1 flex items-center gap-1 transition">
                <X className="w-3 h-3" /> Remover extrato
              </button>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Entradas</p>
              <p className="text-lg font-extrabold font-mono text-positive-400">{formatBRL(summary.totalEntradas)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Saidas</p>
              <p className="text-lg font-extrabold font-mono text-negative-300">{formatBRL(summary.totalSaidas)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Correspondencias</p>
              <p className="text-lg font-extrabold font-mono text-accent-300">{summary.comCorrespondencia} / {summary.total}</p>
              <p className="text-[10px] text-base-500 mt-1">lancamentos encontrados no sistema</p>
            </Card>
          </div>

          <div className="px-6 mt-4">
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-800 text-left">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Data</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Descricao do Banco</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Valor</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Correspondencia no Sistema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const match = suggestMatch(entry, transactions)
                      return (
                        <tr key={entry.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                          <td className="px-4 py-3 text-base-300 text-[12px] whitespace-nowrap">
                            {new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-base-200 text-[12px] max-w-[300px] truncate">
                            <span className="flex items-center gap-2">
                              {entry.type === 'CREDIT' ? <TrendingUp className="w-3.5 h-3.5 text-positive-400 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 text-negative-300 shrink-0" />}
                              {entry.description}
                            </span>
                          </td>
                          <td className={'px-4 py-3 text-right font-mono font-bold text-[13px] bg-base-850/25 ' + (entry.type === 'CREDIT' ? 'text-positive-400' : 'text-negative-300')}>
                            {entry.type === 'CREDIT' ? '+' : '-'}{formatBRL(entry.value)}
                          </td>
                          <td className="px-4 py-3 text-[12px]">
                            {match ? (
                              <div>
                                <span className="text-positive-400 font-semibold">Encontrado</span>
                                <p className="text-base-500 text-[11px] truncate max-w-[220px]">{match.description}</p>
                              </div>
                            ) : (
                              <span className="text-base-600 italic">Nao encontrado</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
