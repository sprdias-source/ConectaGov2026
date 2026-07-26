import { useMemo, useState } from 'react'
import { Printer, Gavel } from 'lucide-react'
import { Card, StatusBadge, EmptyState } from '../ui/Primitives'
import { Select } from '../ui/FormControls'
import { formatBRL } from '../../hooks/useAccountBalances'
import type { Client, Bidding } from '../../types/domain'

// Valor "fechado" de uma licitação ganha e "valor em jogo" de uma perdida —
// mesma convenção usada no BI de Concorrência (valorOfertadoReal quando
// existe, senão cai pro valor licitado original).
const valorRelevante = (b: Bidding) => b.valorOfertadoReal ?? b.valorLicitado

export default function RelatorioLicitacoesCliente({ clients, biddings }: { clients: Client[]; biddings: Bidding[] }) {
  const [clientId, setClientId] = useState('')

  const cliente = clients.find((c) => c.id === clientId) ?? null

  const doCliente = useMemo(
    () => biddings.filter((b) => b.clientId === clientId && b.isActive).sort((a, b) => a.dataAbertura.localeCompare(b.dataAbertura)),
    [biddings, clientId]
  )

  const stats = useMemo(() => {
    const participou = doCliente.filter((b) => b.status !== 'Cancelada')
    const ganhou = doCliente.filter((b) => b.status === 'Ganhou')
    const perdeu = doCliente.filter((b) => b.status === 'Perdeu')
    const emAndamento = doCliente.filter((b) => b.status === 'Em Andamento')
    const canceladas = doCliente.filter((b) => b.status === 'Cancelada')
    const valorFechado = ganhou.reduce((s, b) => s + valorRelevante(b), 0)
    // "Quanto deixou de ganhar" = soma do valor das oportunidades perdidas.
    const valorPerdido = perdeu.reduce((s, b) => s + valorRelevante(b), 0)
    return {
      totalEnviadas: doCliente.length,
      totalParticipou: participou.length,
      totalGanhou: ganhou.length,
      totalPerdeu: perdeu.length,
      totalEmAndamento: emAndamento.length,
      totalCanceladas: canceladas.length,
      valorFechado,
      valorPerdido,
    }
  }, [doCliente])

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 screen-only">
        <div className="w-72">
          <label className="text-[10px] font-bold uppercase tracking-wider text-base-500 block mb-1">Cliente</label>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Selecione um cliente...</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      </Card>

      {!cliente ? (
        <Card className="screen-only">
          <EmptyState icon={Gavel} title="Selecione um cliente" description="Escolha um cliente acima para gerar o relatório detalhado de oportunidades enviadas, participação e resultados." />
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between screen-only">
            <div>
              <p className="text-[15px] font-bold text-base-100">{cliente.name}</p>
              {cliente.cnpj && <p className="text-[12px] text-base-500">CNPJ: {cliente.cnpj}</p>}
            </div>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 text-[12px] font-semibold text-base-300 hover:text-base-100 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition">
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 screen-only">
            <CardEstatistica label="Oportunidades Enviadas" valor={stats.totalEnviadas} />
            <CardEstatistica label="Participou" valor={stats.totalParticipou} />
            <CardEstatistica label="Ganhou" valor={stats.totalGanhou} cor="text-positive-400" />
            <CardEstatistica label="Perdeu" valor={stats.totalPerdeu} cor="text-negative-400" />
            <CardEstatistica label="Em Andamento" valor={stats.totalEmAndamento} cor="text-accent-400" />
            <CardEstatistica label="Não Participou / Cancelada" valor={stats.totalCanceladas} />
            <CardEstatistica label="Valor Fechado (Ganhas)" valor={formatBRL(stats.valorFechado)} cor="text-positive-400" mono />
            <CardEstatistica label="Deixou de Ganhar (Perdidas)" valor={formatBRL(stats.valorPerdido)} cor="text-negative-400" mono />
          </div>

          <Card className="overflow-hidden screen-only">
            {doCliente.length === 0 ? (
              <EmptyState icon={Gavel} title="Nenhuma oportunidade cadastrada" description="Este cliente ainda não tem licitações cadastradas no sistema." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-800 text-left">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Abertura</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Órgão</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Local</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Objeto</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right">Valor Licitado</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Status</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500 text-right bg-base-850/40">Valor Fechado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doCliente.map((b) => (
                      <tr key={b.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                        <td className="px-4 py-2.5 text-base-300 text-[12px] whitespace-nowrap">{new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                        <td className="px-4 py-2.5 text-base-300 text-[12px] max-w-[160px] truncate">{b.orgao}</td>
                        <td className="px-4 py-2.5 text-base-400 text-[12px] whitespace-nowrap">{[b.municipio, b.uf].filter(Boolean).join('/')}</td>
                        <td className="px-4 py-2.5 text-base-400 text-[12px] max-w-[260px] truncate">{b.objeto}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-base-300 text-[12px]">{formatBRL(b.valorLicitado)}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-[12px] bg-base-850/25">
                          {b.status === 'Ganhou' ? <span className="text-positive-400">{formatBRL(valorRelevante(b))}</span>
                            : b.status === 'Perdeu' ? <span className="text-negative-400">{formatBRL(valorRelevante(b))}</span>
                              : <span className="text-base-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {doCliente.length > 0 && (
            <div className="print-only bg-white text-slate-900 rounded-lg p-6" style={{ display: 'none' }}>
              <h2 className="text-center font-bold text-lg uppercase mb-1">Relatório de Oportunidades — {cliente.name}</h2>
              {cliente.cnpj && <p className="text-center text-sm">CNPJ: {cliente.cnpj}</p>}
              <p className="text-center text-sm mb-4">Gerado em {new Date().toLocaleDateString('pt-BR')}</p>

              <table className="w-full text-[12px] mb-4">
                <tbody>
                  <tr><td className="py-0.5 pr-2 font-semibold">Oportunidades enviadas:</td><td>{stats.totalEnviadas}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Participou:</td><td>{stats.totalParticipou}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Ganhou:</td><td>{stats.totalGanhou}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Perdeu:</td><td>{stats.totalPerdeu}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Em andamento:</td><td>{stats.totalEmAndamento}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Não participou / cancelada:</td><td>{stats.totalCanceladas}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Valor fechado (contratos ganhos):</td><td>{formatBRL(stats.valorFechado)}</td></tr>
                  <tr><td className="py-0.5 pr-2 font-semibold">Valor deixado de ganhar (oportunidades perdidas):</td><td>{formatBRL(stats.valorPerdido)}</td></tr>
                </tbody>
              </table>

              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-400 text-left">
                    <th className="py-1.5 pr-2">Abertura</th>
                    <th className="py-1.5 pr-2">Órgão</th>
                    <th className="py-1.5 pr-2">Local</th>
                    <th className="py-1.5 pr-2">Objeto</th>
                    <th className="py-1.5 pr-2 text-right">Vl. Licitado</th>
                    <th className="py-1.5 pr-2">Status</th>
                    <th className="py-1.5 text-right">Vl. Fechado</th>
                  </tr>
                </thead>
                <tbody>
                  {doCliente.map((b) => (
                    <tr key={b.id} className="border-b border-slate-200">
                      <td className="py-1 pr-2">{new Date(b.dataAbertura + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="py-1 pr-2">{b.orgao}</td>
                      <td className="py-1 pr-2">{[b.municipio, b.uf].filter(Boolean).join('/')}</td>
                      <td className="py-1 pr-2">{b.objeto}</td>
                      <td className="py-1 pr-2 text-right">{formatBRL(b.valorLicitado)}</td>
                      <td className="py-1 pr-2">{b.status}</td>
                      <td className="py-1 text-right">{b.status === 'Ganhou' || b.status === 'Perdeu' ? formatBRL(valorRelevante(b)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CardEstatistica({ label, valor, cor = 'text-base-100', mono = false }: { label: string; valor: string | number; cor?: string; mono?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">{label}</p>
      <p className={`text-lg font-extrabold ${mono ? 'font-mono' : ''} ${cor}`}>{valor}</p>
    </Card>
  )
}
