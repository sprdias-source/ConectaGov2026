import { useMemo, useState } from 'react'
import { Plus, FileWarning, Link2, Trash2 } from 'lucide-react'
import { Card, EmptyState } from '../ui/Primitives'
import { Field, Input, Select, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ConfirmDialog from '../ui/ConfirmDialog'
import { formatBRL } from '../../hooks/useAccountBalances'
import { useNotasFiscais } from '../../hooks/useNotasFiscais'
import { useTransactions } from '../../hooks/useTransactions'
import { useClients } from '../../hooks/useClients'
import { todayLocalISO } from '../../lib/dateUtils'
import type { NotaFiscalEmitida } from '../../types/domain'

// Registro manual — hoje a emissão de NFS-e acontece fora do sistema (portal
// da prefeitura). O relatório de divergência só é confiável se toda nota
// emitida for registrada aqui.
export default function NotasFiscaisSection() {
  const { notasFiscais, addNotaFiscal, deleteNotaFiscal, vincularTransacao } = useNotasFiscais()
  const { transactions } = useTransactions()
  const { clients } = useClients()

  const [formAberto, setFormAberto] = useState(false)
  const [numero, setNumero] = useState('')
  const [clientId, setClientId] = useState('')
  const [dataEmissao, setDataEmissao] = useState(todayLocalISO())
  const [valor, setValor] = useState(0)
  const [descricao, setDescricao] = useState('')
  const [deleting, setDeleting] = useState<NotaFiscalEmitida | null>(null)

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '—'

  const recebiveisDisponiveis = useMemo(
    () => transactions.filter((t) => t.type === 'Receber').sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [transactions]
  )

  const notasSemVinculo = notasFiscais.filter((n) => !n.transactionId)
  const recebimentosSemNota = useMemo(() => {
    const vinculados = new Set(notasFiscais.map((n) => n.transactionId).filter(Boolean))
    return transactions.filter((t) => t.type === 'Receber' && t.status === 'Pago' && !vinculados.has(t.id))
  }, [transactions, notasFiscais])

  const salvar = () => {
    if (!valor || valor <= 0) return
    addNotaFiscal.mutate(
      { numero: numero.trim() || null, clientId: clientId || null, dataEmissao, competencia: dataEmissao.slice(0, 7), valor, descricao: descricao.trim() || null },
      { onSuccess: () => { setFormAberto(false); setNumero(''); setClientId(''); setValor(0); setDescricao('') } }
    )
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-base-100">Notas Fiscais Emitidas</h3>
        <button onClick={() => setFormAberto((v) => !v)} className="flex items-center gap-1 text-[11.5px] font-semibold text-accent-400 hover:text-accent-300">
          <Plus className="w-3.5 h-3.5" /> Registrar nota fiscal
        </button>
      </div>
      <p className="text-[12px] text-base-500 mb-3">
        Registro manual — a emissão ainda acontece no portal da prefeitura, fora do sistema. Vincule cada nota ao recebimento correspondente pra conferir se bate.
      </p>

      {formAberto && (
        <div className="mb-4 pb-4 border-b border-base-800 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Número da Nota (opcional)"><Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: 2026/00123" /></Field>
          <Field label="Cliente">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Sem cliente vinculado</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Data de Emissão"><Input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} /></Field>
          <Field label="Valor (R$)"><CurrencyInput value={valor} onChange={(v) => setValor(v ?? 0)} /></Field>
          <div className="md:col-span-2">
            <Field label="Descrição (opcional)"><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Field>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={salvar} disabled={!valor || addNotaFiscal.isPending}>{addNotaFiscal.isPending ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      )}

      {notasFiscais.length === 0 ? (
        <EmptyState icon={FileWarning} title="Nenhuma nota registrada" description="Registre as notas fiscais já emitidas pra começar a conferência." />
      ) : (
        <div className="flex flex-col gap-1.5 mb-4">
          {notasFiscais.map((n) => (
            <div key={n.id} className="flex items-center gap-3 bg-base-850/60 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-base-200 truncate">{n.numero ?? <span className="italic text-base-500">sem número</span>} — {clientName(n.clientId)}</p>
                <p className="text-[10.5px] text-base-500">{new Date(n.dataEmissao + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
              </div>
              <span className="font-mono text-[13px] font-bold text-base-200">{formatBRL(n.valor)}</span>
              <Select
                value={n.transactionId ?? ''}
                onChange={(e) => vincularTransacao.mutate({ notaId: n.id, transactionId: e.target.value || null })}
                className="!py-1 text-[11px] w-44"
              >
                <option value="">Sem vínculo</option>
                {recebiveisDisponiveis.map((t) => (
                  <option key={t.id} value={t.id}>{t.description.slice(0, 24)} — {formatBRL(t.value)}</option>
                ))}
              </Select>
              <button onClick={() => setDeleting(n)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(notasSemVinculo.length > 0 || recebimentosSemNota.length > 0) && (
        <div className="border-t border-base-800 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="w-3.5 h-3.5 text-warning-400" />
            <h4 className="text-[12.5px] font-bold text-base-200">Relatório de Divergência</h4>
          </div>
          {notasSemVinculo.length > 0 && (
            <p className="text-[11.5px] text-warning-400 mb-1">
              {notasSemVinculo.length} nota(s) fiscal(is) sem recebimento vinculado.
            </p>
          )}
          {recebimentosSemNota.length > 0 && (
            <p className="text-[11.5px] text-warning-400">
              {recebimentosSemNota.length} recebimento(s) pago(s) sem nota fiscal registrada.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Excluir registro de nota fiscal?"
        description="Isso remove só o registro de conferência — não afeta a nota emitida de verdade no portal da prefeitura."
        confirmLabel="Excluir"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) deleteNotaFiscal.mutate(deleting.id, { onSuccess: () => setDeleting(null) }) }}
        isLoading={deleteNotaFiscal.isPending}
      />
    </Card>
  )
}
