import { useState, useMemo } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Gavel, ClipboardList, Wallet, AlarmClock, Plus, Pencil } from 'lucide-react'
import { PageHeader, Card } from '../components/ui/Primitives'
import { Button } from '../components/ui/FormControls'
import PersonalEventFormModal, { type PersonalEventFormValues } from '../components/agenda/PersonalEventFormModal'
import { useAgendaEventos, type EventoAgenda } from '../hooks/useAgendaEventos'
import { usePersonalEvents } from '../hooks/usePersonalEvents'
import { useToast } from '../hooks/useToast'
import { todayLocalISO } from '../lib/dateUtils'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

export default function AgendaPage() {
  const { eventosPorDia } = useAgendaEventos()
  const { events: personalEvents, addEvent, updateEvent, deleteEvent } = usePersonalEvents()
  const { showToast } = useToast()

  const hoje = todayLocalISO()
  const [mesAtual, setMesAtual] = useState(() => {
    const d = new Date(hoje + 'T12:00:00')
    return { ano: d.getFullYear(), mes: d.getMonth() } // mes: 0-11
  })
  const [diaSelecionado, setDiaSelecionado] = useState(hoje)
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<{ id: string; values: PersonalEventFormValues } | null>(null)

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

  const iconePorTipo = { pregao: Gavel, checklist: ClipboardList, financeiro: Wallet, pessoal: AlarmClock }
  const corPorTipo = { pregao: 'text-accent-400', checklist: 'text-warning-400', financeiro: 'text-positive-400', pessoal: 'text-negative-400' }
  const corPontoPorTipo: Record<string, string> = {
    pregao: 'bg-accent-400', checklist: 'bg-warning-400', financeiro: 'bg-positive-400', pessoal: 'bg-negative-400',
  }

  const abrirNovo = () => {
    setEditando(null)
    setModalAberto(true)
  }

  const abrirEdicao = (evento: EventoAgenda) => {
    if (evento.tipo !== 'pessoal' || !evento.id) return
    setEditando({ id: evento.id, values: { titulo: evento.titulo, descricao: evento.subtitulo === 'Compromisso pessoal' ? '' : evento.subtitulo, data: evento.data } })
    setModalAberto(true)
  }

  const salvar = (values: PersonalEventFormValues) => {
    if (editando) {
      updateEvent.mutate({ id: editando.id, ...values }, {
        onSuccess: () => { showToast('Compromisso atualizado.'); setModalAberto(false) },
        onError: () => showToast('Erro ao atualizar compromisso.', 'error'),
      })
    } else {
      addEvent.mutate({ ...values, data: values.data || diaSelecionado }, {
        onSuccess: () => { showToast('Compromisso adicionado.'); setModalAberto(false) },
        onError: () => showToast('Erro ao adicionar compromisso.', 'error'),
      })
    }
  }

  const excluir = () => {
    if (!editando) return
    const evento = personalEvents.find((e) => e.id === editando.id)
    if (!evento) return
    deleteEvent.mutate(evento, {
      onSuccess: () => { showToast('Compromisso excluído.'); setModalAberto(false) },
      onError: () => showToast('Erro ao excluir compromisso.', 'error'),
    })
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Agenda"
        subtitle="Pregões, prazos de checklist, financeiro e seus compromissos pessoais — tudo num calendário só"
        icon={CalendarDays}
        actions={
          <Button onClick={abrirNovo}>
            <Plus className="w-4 h-4" /> Novo Compromisso
          </Button>
        }
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
                        <span key={tipo} className={`w-1.5 h-1.5 rounded-full ${corPontoPorTipo[tipo]}`} />
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
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-base-200 truncate">{e.titulo}</p>
                      <p className="text-[11px] text-base-500 truncate">{e.subtitulo}</p>
                    </div>
                    {e.tipo === 'pessoal' && (
                      <button onClick={() => abrirEdicao(e)} className="p-1 text-base-500 hover:text-base-100 hover:bg-base-800 rounded shrink-0" title="Editar compromisso">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <PersonalEventFormModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onSave={salvar}
        onDelete={editando ? excluir : undefined}
        initial={editando ? editando.values : null}
        defaultData={diaSelecionado}
        isSaving={addEvent.isPending || updateEvent.isPending}
        isDeleting={deleteEvent.isPending}
        error={addEvent.error || updateEvent.error || deleteEvent.error}
      />
    </div>
  )
}

function formatarISO(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
