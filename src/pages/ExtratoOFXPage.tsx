import { useState, useMemo } from 'react'
import { Upload, FileText, X, TrendingUp, TrendingDown, AlertCircle, Save, History, Trash2 } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import TopScrollTable from '../components/ui/TopScrollTable'
import { formatBRL } from '../hooks/useAccountBalances'
import { useTransactions } from '../hooks/useTransactions'
import { useFinancialAccounts } from '../hooks/useFinancialAccounts'
import { useBankReconciliations } from '../hooks/useBankReconciliations'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import { useToast } from '../hooks/useToast'
import { todayLocalISO } from '../lib/dateUtils'
import { mensagemDeErro } from '../lib/errors'

interface OFXEntry {
  id: string
  date: string
  description: string
  value: number
  type: 'CREDIT' | 'DEBIT'
}

interface SaldoFinalOFX {
  valor: number
  data: string
}

type Transaction = ReturnType<typeof useTransactions>['transactions'][number]

function parseOFX(content: string): { entries: OFXEntry[]; descartados: number } {
  const entries: OFXEntry[] = []
  const txBlocks = content.match(/<STMTTRN[\s\S]*?<\/STMTTRN>/gi) ?? []
  let descartados = 0

  for (const block of txBlocks) {
    const get = (tag: string) => {
      const m = block.match(new RegExp('<' + tag + '>([^<\\n]+)', 'i'))
      return m ? m[1].trim() : ''
    }

    const raw = get('TRNAMT').replace(',', '.')
    const value = parseFloat(raw)
    // Um lançamento com <TRNAMT> ausente ou não numérico virava NaN e era
    // pulado sem contar — o extrato "conferido" (0 avisos) podia estar
    // incompleto, mascarando divergência real de saldo. Agora conta pra
    // avisar o usuário quantos ficaram de fora.
    if (isNaN(value)) { descartados++; continue }

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

  return { entries: entries.sort((a, b) => a.date.localeCompare(b.date)), descartados }
}

// Lê o saldo final que o próprio banco informa no arquivo (tag padrão OFX
// LEDGERBAL/BALAMT/DTASOF) — não depende do usuário digitar nada. Alguns
// bancos não incluem essa tag no export; nesse caso devolve null e a tela
// avisa que só dá pra conferir lançamento por lançamento, não o saldo.
function parseSaldoFinal(content: string): SaldoFinalOFX | null {
  const block = content.match(/<LEDGERBAL>[\s\S]*?(?:<\/LEDGERBAL>|<AVAILBAL>|$)/i)?.[0]
  if (!block) return null

  const get = (tag: string) => {
    const m = block.match(new RegExp('<' + tag + '>([^<\\n]+)', 'i'))
    return m ? m[1].trim() : ''
  }

  const raw = get('BALAMT').replace(',', '.')
  const valor = parseFloat(raw)
  if (isNaN(valor)) return null

  const rawDate = get('DTASOF')
  const data = rawDate.length >= 8
    ? rawDate.slice(0, 4) + '-' + rawDate.slice(4, 6) + '-' + rawDate.slice(6, 8)
    : todayLocalISO()

  return { valor, data }
}

// `usados` marca as transações do sistema já casadas com uma linha anterior
// do extrato nesta mesma varredura — sem isso, duas entradas do banco com
// mesmo tipo/valor (±R$0,01) numa janela de 3 dias podiam casar as DUAS com
// a mesma transação única do sistema, e o resumo mostrava "conferido" com
// uma receita real do extrato nunca lançada.
function suggestMatch(entry: OFXEntry, transactions: Transaction[], usados?: Set<string>) {
  const targetType = entry.type === 'CREDIT' ? 'Receber' : 'Pagar'
  const entryDate = new Date(entry.date + 'T12:00:00').getTime()
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000

  return transactions.find((t) => {
    if (usados?.has(t.id)) return false
    if (t.type !== targetType) return false
    if (Math.abs(t.value - entry.value) > 0.01) return false
    const txDate = t.paymentDate
      ? new Date(t.paymentDate + 'T12:00:00').getTime()
      : new Date(t.dueDate + 'T12:00:00').getTime()
    return Math.abs(txDate - entryDate) <= THREE_DAYS
  })
}

function formatMesAno(dataISO: string) {
  const d = new Date(dataISO + 'T12:00:00')
  const texto = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export default function ExtratoOFXPage() {
  const { transactions } = useTransactions()
  const { accounts } = useFinancialAccounts()
  const { reconciliations, salvar, remover } = useBankReconciliations()
  const { showToast } = useToast()
  // Antes não checava permissão nenhuma — qualquer membro conseguia salvar
  // e apagar conciliações bancárias mesmo com acesso só de visualização
  // (ou nenhum) em financeiro.
  const { nivel, carregando: carregandoPermissao } = usePermissaoFerramenta('financeiro')
  const podeEditar = nivel === 'edicao' && !carregandoPermissao
  const [entries, setEntries] = useState<OFXEntry[]>([])
  const [saldoFinal, setSaldoFinal] = useState<SaldoFinalOFX | null>(null)
  const [accountId, setAccountId] = useState<string>('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [descartados, setDescartados] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [salvo, setSalvo] = useState(false)

  // Caixa Interno é fictício (controle pessoal, sem banco de verdade por
  // trás) — não faz sentido oferecer pra conciliar com um extrato real.
  const contasBancarias = accounts.filter((a) => a.type !== 'INTERNO')

  const limparExtrato = () => {
    setEntries([])
    setFileName(null)
    setSaldoFinal(null)
    setAccountId('')
    setSalvo(false)
    setDescartados(0)
  }

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
        const { entries: parsed, descartados: qtdDescartados } = parseOFX(content)
        if (parsed.length === 0) {
          setParseError('Nenhuma transacao encontrada. O arquivo pode estar em formato nao suportado.')
          return
        }
        setEntries(parsed)
        setSaldoFinal(parseSaldoFinal(content))
        setFileName(file.name)
        setParseError(null)
        setDescartados(qtdDescartados)
        setSalvo(false)
      } catch {
        setParseError('Erro ao ler o arquivo. Verifique se o arquivo OFX esta integro.')
      }
    }
    reader.readAsText(file, 'latin1')
  }

  // Quando uma conta é escolhida, a conferência (linha a linha e o saldo)
  // passa a olhar só os lançamentos daquela conta — evita "achar"
  // correspondência num lançamento de outra conta por coincidência de
  // valor e data.
  const transacoesDaConta = useMemo(
    () => (accountId ? transactions.filter((t) => t.accountId === accountId) : transactions),
    [transactions, accountId]
  )

  // Mapa único entry -> transação casada, computado uma vez e reaproveitado
  // em todo lugar que precisa saber a correspondência (resumo, lista de
  // "sem correspondência" e a linha na tabela) — cada transação do sistema
  // só pode ser reivindicada por UMA linha do extrato (ver `usados` em
  // suggestMatch), então calcular em lugares diferentes daria resultados
  // inconsistentes entre si.
  const matchesPorEntry = useMemo(() => {
    const usados = new Set<string>()
    const mapa = new Map<string, Transaction>()
    for (const e of entries) {
      const m = suggestMatch(e, transacoesDaConta, usados)
      if (m) {
        mapa.set(e.id, m)
        usados.add(m.id)
      }
    }
    return mapa
  }, [entries, transacoesDaConta])

  const summary = useMemo(() => ({
    totalEntradas: entries.filter((e) => e.type === 'CREDIT').reduce((s, e) => s + e.value, 0),
    totalSaidas: entries.filter((e) => e.type === 'DEBIT').reduce((s, e) => s + e.value, 0),
    total: entries.length,
    comCorrespondencia: entries.filter((e) => matchesPorEntry.has(e.id)).length,
  }), [entries, matchesPorEntry])

  // Saldo do sistema pra aquela conta, calculado até a data do saldo do
  // banco (saldo inicial + lançamentos pagos até aquele dia) — mesmo
  // princípio já usado no saldo do Caixa Interno na sidebar, só que aqui
  // limitado por data em vez de somar tudo até hoje.
  const conciliacao = useMemo(() => {
    if (!accountId || !saldoFinal) return null
    const conta = accounts.find((a) => a.id === accountId)
    if (!conta) return null

    const dataLimite = new Date(saldoFinal.data + 'T23:59:59').getTime()
    const saldoSistema = transacoesDaConta
      .filter((t) => t.status === 'Pago')
      .filter((t) => {
        const dataLanc = new Date((t.paymentDate ?? t.dueDate) + 'T12:00:00').getTime()
        return dataLanc <= dataLimite
      })
      .reduce((s, t) => s + (t.type === 'Receber' ? t.value : -t.value), conta.startingBalance)

    return { conta, saldoSistema, diferenca: saldoFinal.valor - saldoSistema }
  }, [accountId, saldoFinal, accounts, transacoesDaConta])

  // Período coberto pelo extrato importado — usado só pra achar, do lado
  // do sistema, lançamentos pagos que caíram nessa janela e que o extrato
  // não trouxe (ida contrária da conferência: sistema → banco).
  const periodoExtrato = useMemo(() => {
    if (!entries.length) return null
    const datas = entries.map((e) => e.date)
    return { min: datas.reduce((a, b) => (a < b ? a : b)), max: datas.reduce((a, b) => (a > b ? a : b)) }
  }, [entries])

  const lancamentosSemCorrespondencia = useMemo(() => {
    if (!accountId || !periodoExtrato) return []
    const idsEncontrados = new Set([...matchesPorEntry.values()].map((t) => t.id))
    return transacoesDaConta.filter((t) => {
      if (t.status !== 'Pago') return false
      if (idsEncontrados.has(t.id)) return false
      const dataLanc = t.paymentDate ?? t.dueDate
      return dataLanc >= periodoExtrato.min && dataLanc <= periodoExtrato.max
    })
  }, [accountId, periodoExtrato, transacoesDaConta, matchesPorEntry])

  const handleSalvar = async () => {
    if (!accountId || !saldoFinal || !conciliacao) return
    try {
      await salvar.mutateAsync({
        accountId,
        dataSaldo: saldoFinal.data,
        saldoBanco: saldoFinal.valor,
        saldoSistema: conciliacao.saldoSistema,
        diferenca: conciliacao.diferenca,
        nomeArquivo: fileName,
        totalLancamentos: summary.total,
        lancamentosEncontrados: summary.comCorrespondencia,
      })
      setSalvo(true)
    } catch (err) {
      // Sem isso, uma falha aqui (ex: erro de banco) ficava completamente
      // silenciosa — o botão só voltava ao normal e o usuário acreditava
      // ter salvo a conciliação sem ela nunca ter sido persistida.
      showToast(`Não foi possível salvar a conciliação — ${mensagemDeErro(err)}`, 'error')
    }
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Extrato Bancario (OFX)"
        subtitle="Importe o extrato do banco para conferencia — nenhum lancamento e criado ou alterado no sistema"
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
              <button onClick={limparExtrato} className="text-[11px] text-base-500 hover:text-negative-400 mt-1 flex items-center gap-1 transition">
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

          {descartados > 0 && (
            <div className="px-6 mt-4">
              <div className="flex items-start gap-2 bg-warning-500/10 border border-warning-500/30 rounded-lg px-3 py-2.5 text-[12.5px] text-warning-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  Atenção: {descartados} lançamento(s) do arquivo não puderam ser lidos (valor ausente ou inválido) e ficaram de fora desta conferência —
                  o extrato importado pode estar incompleto.
                </p>
              </div>
            </div>
          )}

          <div className="px-6 mt-4">
            <Card className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="sm:w-64 shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Conciliar com a conta</p>
                  <select
                    value={accountId}
                    onChange={(e) => { setAccountId(e.target.value); setSalvo(false) }}
                    className="w-full bg-base-900 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 focus:outline-none focus:border-accent-400"
                  >
                    <option value="">Selecione a conta...</option>
                    {contasBancarias.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {accountId && saldoFinal && conciliacao && (
                  <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-0.5">
                        Saldo do banco em {new Date(saldoFinal.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                      <p className="text-lg font-extrabold font-mono text-base-100">{formatBRL(saldoFinal.valor)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-0.5">Saldo no ConectaGov</p>
                      <p className="text-lg font-extrabold font-mono text-base-100">{formatBRL(conciliacao.saldoSistema)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-0.5">Diferenca</p>
                      <p className={'text-lg font-extrabold font-mono ' + (Math.abs(conciliacao.diferenca) < 0.01 ? 'text-positive-400' : 'text-negative-300')}>
                        {Math.abs(conciliacao.diferenca) < 0.01 ? 'Bateu' : formatBRL(conciliacao.diferenca)}
                      </p>
                    </div>
                    {podeEditar && (
                      <button
                        onClick={handleSalvar}
                        disabled={salvar.isPending}
                        className="ml-auto inline-flex items-center gap-1.5 bg-accent-500 hover:bg-accent-400 text-base-950 font-bold text-[12px] px-3.5 py-2 rounded-lg transition disabled:opacity-50 shrink-0"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {salvar.isPending ? 'Salvando...' : salvo ? 'Salvo' : 'Salvar conciliacao deste mes'}
                      </button>
                    )}
                  </div>
                )}

                {accountId && !saldoFinal && (
                  <div className="flex items-start gap-2 text-[12px] text-warning-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <p>Este arquivo OFX nao trouxe o saldo final (tag LEDGERBAL) — so da pra conferir lancamento por lancamento, nao o saldo (e por isso nao da pra salvar a conciliacao).</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="px-6 mt-4">
            <Card className="overflow-hidden">
              <div className="px-4 py-2.5 border-b border-base-800 flex items-center gap-6 text-[10px] font-bold uppercase tracking-wider text-base-500">
                <span>Extrato do Banco</span>
                <span className="border-l border-base-800 pl-6">Lancamento no ConectaGov</span>
              </div>
              <TopScrollTable>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-800 text-left">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Data</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Descricao</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Valor</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 border-l border-base-800">Data</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Descricao</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => {
                      const match = matchesPorEntry.get(entry.id) ?? null
                      const dataMatch = match ? (match.paymentDate ?? match.dueDate) : null
                      return (
                        <tr key={entry.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                          <td className="px-4 py-3 text-base-300 text-[12px] whitespace-nowrap">
                            {new Date(entry.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-base-200 text-[12px] max-w-[240px] truncate">
                            <span className="flex items-center gap-2">
                              {entry.type === 'CREDIT' ? <TrendingUp className="w-3.5 h-3.5 text-positive-400 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 text-negative-300 shrink-0" />}
                              {entry.description}
                            </span>
                          </td>
                          <td className={'px-4 py-3 text-right font-mono font-bold text-[13px] bg-base-850/25 ' + (entry.type === 'CREDIT' ? 'text-positive-400' : 'text-negative-300')}>
                            {entry.type === 'CREDIT' ? '+' : '-'}{formatBRL(entry.value)}
                          </td>
                          {match ? (
                            <>
                              <td className="px-4 py-3 text-base-300 text-[12px] whitespace-nowrap border-l border-base-800">
                                {dataMatch ? new Date(dataMatch + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                              </td>
                              <td className="px-4 py-3 text-base-200 text-[12px] max-w-[240px] truncate">{match.description}</td>
                              <td className={'px-4 py-3 text-right font-mono font-bold text-[13px] bg-base-850/25 ' + (match.type === 'Receber' ? 'text-positive-400' : 'text-negative-300')}>
                                {match.type === 'Receber' ? '+' : '-'}{formatBRL(match.value)}
                              </td>
                            </>
                          ) : (
                            <td colSpan={3} className="px-4 py-3 text-[12px] border-l border-base-800">
                              <span className="text-base-600 italic">Nao encontrado no sistema</span>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TopScrollTable>
            </Card>
          </div>

          {lancamentosSemCorrespondencia.length > 0 && (
            <div className="px-6 mt-4">
              <Card className="overflow-hidden">
                <div className="px-4 py-3 border-b border-base-800">
                  <p className="text-[12px] font-bold text-base-200">Lancamentos do sistema sem correspondencia no extrato</p>
                  <p className="text-[11px] text-base-500 mt-0.5">Pagos no ConectaGov dentro do periodo desse extrato, mas que nao apareceram no arquivo do banco — vale conferir se a conta ou a data estao certas.</p>
                </div>
                <TopScrollTable>
                  <table className="w-full text-sm">
                    <tbody>
                      {lancamentosSemCorrespondencia.map((t) => (
                        <tr key={t.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                          <td className="px-4 py-2.5 text-base-300 text-[12px] whitespace-nowrap">
                            {new Date((t.paymentDate ?? t.dueDate) + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-2.5 text-base-200 text-[12px] max-w-[300px] truncate">{t.description}</td>
                          <td className={'px-4 py-2.5 text-right font-mono font-bold text-[13px] ' + (t.type === 'Receber' ? 'text-positive-400' : 'text-negative-300')}>
                            {t.type === 'Receber' ? '+' : '-'}{formatBRL(t.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TopScrollTable>
              </Card>
            </div>
          )}
        </>
      )}

      <div className="px-6 mt-6">
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-base-800 flex items-center gap-2">
            <History className="w-4 h-4 text-base-500" />
            <p className="text-[12px] font-bold text-base-200">Historico de conciliacoes salvas</p>
          </div>
          {reconciliations.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-base-500 italic text-center">Nenhuma conciliacao salva ainda.</p>
          ) : (
            <TopScrollTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-800 text-left">
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-base-500">Mes</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-base-500">Conta</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Saldo Banco</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Saldo Sistema</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Diferenca</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-base-500">Lancamentos</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliations.map((rec) => {
                    const conta = accounts.find((a) => a.id === rec.accountId)
                    const bateu = Math.abs(rec.diferenca) < 0.01
                    return (
                      <tr key={rec.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                        <td className="px-4 py-2.5 text-base-200 text-[12px] font-semibold whitespace-nowrap">{formatMesAno(rec.dataSaldo)}</td>
                        <td className="px-4 py-2.5 text-base-300 text-[12px]">{conta?.name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-base-200">{formatBRL(rec.saldoBanco)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] text-base-200">{formatBRL(rec.saldoSistema)}</td>
                        <td className={'px-4 py-2.5 text-right font-mono font-bold text-[12px] ' + (bateu ? 'text-positive-400' : 'text-negative-300')}>
                          {bateu ? 'Bateu' : formatBRL(rec.diferenca)}
                        </td>
                        <td className="px-4 py-2.5 text-base-500 text-[11px]">{rec.lancamentosEncontrados} / {rec.totalLancamentos}</td>
                        <td className="px-4 py-2.5 text-right">
                          {podeEditar && (
                            <button
                              onClick={() => remover.mutate(rec.id)}
                              title="Excluir registro"
                              className="text-base-600 hover:text-negative-400 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </TopScrollTable>
          )}
        </Card>
      </div>
    </div>
  )
}
