import { useState, useMemo } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Gavel, ClipboardList, Wallet } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { useBiddings } from '../hooks/useBiddings'
import { useClients } from '../hooks/useClients'
import { usePendenciasChecklist } from '../hooks/useBiddingChecklist'
import { useTransactions } from '../hooks/useTransactions'
import { formatBRL } from '../hooks/useAccountBalances'
import { todayLocalISO } from '../lib/dateUtils'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

type EventoAgenda = {
  tipo: 'pregao' | 'checklist' | 'financeiro'
  data: string
  titulo: string
  subtitulo: string
}

export default function AgendaPage() {
  const { biddings } = useBiddings()
  const { clients } = useClients()
  const { pendencias } = usePendenciasChecklist()
  const { transactions } = useTransactions()

  const hoje = todayLocalISO()
  const [mesAtual, setMesAtual] = useState(() => {
    const d = new Date(hoje + 'T12:00:00')
    return { ano: d.getFullYear(), mes: d.getMonth() } // mes: 0-11
  })
  const [diaSelecionado, setDiaSelecionado] = useState(hoje)

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? '—'

  // Junta os 3 tipos de evento numa lista só, indexada por data (YYYY-MM-DD)
  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, EventoAgenda[]>()
    const add = (data: string | null, evento: EventoAgenda) => {
      if (!data) return
      const lista = mapa.get(data) ?? []
      lista.push(evento)
      mapa.set(data, lista)
    }

    for (const b of biddings) {
      if (!b.isActive || b.status !== 'Em Andamento') continue
      add(b.dataAbertura, {
        tipo: 'pregao',
        data: b.dataAbertura,
        titulo: b.objeto,
        subtitulo: `${clientName(b.clientId)} — ${b.orgao}`,
      })
    }

    for (const p of pendencias) {
      if (!p.prazo) continue
      add(p.prazo, {
        tipo: 'checklist',
        data: p.prazo,
        titulo: p.descricao,
        subtitulo: `${p.clientName} — ${p.biddingObjeto.slice(0, 40)}`,
      })
    }

    for (const t of transactions) {
      if (t.status === 'Pago') continue
      add(t.dueDate, {
        tipo: 'financeiro',
        data: t.dueDate,
        titulo: t.description,
        subtitulo: `${t.type === 'Pagar' ? 'A pagar' : 'A receber'} — ${formatBRL(t.value)}`,
      })
    }

    return mapa
  }, [biddings, pendencias, transactions, clients])

  // Monta a grade do mês: dias do mês anterior/seguinte pra completar
  // semanas, mais os dias do mês atual.
  const diasGrade = useMemo(() => {
    const primeiroDia = new Date(mesAtual.ano, mesAtual.mes, 1)
    const ultimoDia = new Date(mesAtual.ano, mesAtual.mes + 1, 0)
    const diaSemanaInicio = primeiroDia.getDay()
    const totalDias = ultimoDia.getDate()

    const dias: { data: string; noMes: boolean }[] = []
    for (let i = 0; i < diaSemanaInicio; i++) {
      const d = new Date(mesAtual.ano, mesAtual.mes, -diaSemanaInicio + i + 1)
      dias.push({ data: formatarISO(d), noMes: false })
    }
    for (let dia = 1; dia <= totalDias; dia++) {
      dias.push({ data: formatarISO(new Date(mesAtual.ano, mesAtual.mes, dia)), noMes: true })
    }
    while (dias.length % 7 !== 0) {
      const ultimaData = new Date(dias[dias.length - 1].data + 'T12:00:00')
      ultimaData.setDate(ultimaData.getDate() + 1)
      dias.push({ data: formatarISO(ultimaData), noMes: false })
    }
    return dias
  }, [mesAtual])

  const eventosDoDiaSelecionado = eventosPorDia.get(diaSelecionado) ?? []

  const mudarMes = (delta: number) => {
    setMesAtual((atual) => {
      const novaData = new Date(atual.ano, atual.mes + delta, 1)
      return { ano: novaData.getFullYear(), mes: novaData.getMonth() }
    })
  }

  const iconePorTipo = { pregao: Gavel, checklist: ClipboardList, financeiro: Wallet }
  const corPorTipo = { pregao: 'text-accent-400', checklist: 'text-warning-400', financeiro: 'text-positive-400' }

  return (
    <div className="pb-10">
      <PageHeader
        title="Agenda"
        subtitle="Pregões, prazos de checklist e financeiro — tudo num calendário só"
        icon={CalendarDays}
      />

      <div className="px-6 mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => mudarMes(-1)} className="p-1.5 text-base-400 hover:text-base-100 hover:bg-base-800 rounded transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-[14px] font-bold text-base-100">{MESES[mesAtual.mes]} de {mesAtual.ano}</p>
            <button onClick={() => mudarMes(1)} className="p-1.5 text-base-400 hover:text-base-100 hover:bg-base-800 rounded transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-base-500 uppercase tracking-wider py-1.5">{d}</div>
            ))}
            {diasGrade.map(({ data, noMes }) => {
              const eventos = eventosPorDia.get(data) ?? []
              const numeroDia = parseInt(data.slice(8, 10), 10)
              const ehHoje = data === hoje
              const selecionado = data === diaSelecionado
              return (
                <button
                  key={data}
                  onClick={() => setDiaSelecionado(data)}
                  className={`aspect-square flex flex-col items-center justify-start p-1 rounded-lg border transition ${
                    selecionado ? 'border-accent-500 bg-accent-500/10' : 'border-transparent hover:bg-base-850/60'
                  } ${!noMes ? 'opacity-30' : ''}`}
                >
                  <span className={`text-[12px] w-6 h-6 flex items-center justify-center rounded-full ${ehHoje ? 'bg-accent-500 text-base-950 font-bold' : 'text-base-300'}`}>
                    {numeroDia}
                  </span>
                  {eventos.length > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {Array.from(new Set(eventos.map((e) => e.tipo))).slice(0, 3).map((tipo) => (
                        <span key={tipo} className={`w-1.5 h-1.5 rounded-full ${
                          tipo === 'pregao' ? 'bg-accent-400' : tipo === 'checklist' ? 'bg-warning-400' : 'bg-positive-400'
                        }`} />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[13px] font-bold text-base-100 mb-3">
            {new Date(diaSelecionado + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
          {eventosDoDiaSelecionado.length === 0 ? (
            <p className="text-[12px] text-base-500 italic py-6 text-center">Nenhum evento nesta data.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {eventosDoDiaSelecionado.map((e, idx) => {
                const Icone = iconePorTipo[e.tipo]
                return (
                  <div key={idx} className="flex items-start gap-2.5 bg-base-850/60 border border-base-800 rounded-lg p-2.5">
                    <Icone className={`w-4 h-4 shrink-0 mt-0.5 ${corPorTipo[e.tipo]}`} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-base-200 truncate">{e.titulo}</p>
                      <p className="text-[11px] text-base-500 truncate">{e.subtitulo}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function formatarISO(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
