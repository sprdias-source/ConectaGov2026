import { useState } from 'react'
import Modal from '../ui/Modal'
import { Field, Input, Button } from '../ui/FormControls'
import { useBiddings } from '../../hooks/useBiddings'
import { useToast } from '../../hooks/useToast'
import { todayLocalISO } from '../../lib/dateUtils'
import type { Bidding } from '../../types/domain'

// Sempre que a etapa "Adjudicada e Homologada" é ativada — entrando nela
// vindo de outra etapa, ou pelo botão de corrigir num card/etapa que já
// está parada aqui — abre esse diálogo, pré-preenchido com a data que já
// estiver gravada (ou hoje, se ainda não tiver nenhuma). Substitui o
// preenchimento automático "hoje" de antes (ver
// tentarPreencherValorGanhoAutomatico em useBiddings.ts), que nunca batia
// com o dia real da homologação e não dava nenhum jeito de corrigir depois
// — importante pra quem está lançando ou arrumando licitações antigas.
//
// Compartilhado entre o Kanban (KanbanLicitacoesPage.tsx) e a esteira de
// etapas da página da própria licitação (LicitacaoPage.tsx) — os dois
// caminhos pra mudar a etapa de uma licitação precisam da mesma pergunta,
// senão só um deles fica com o cadastro correto.
export default function HomologacaoDialog({ bidding, onClose }: { bidding: Bidding | null; onClose: () => void }) {
  const { updateEtapa } = useBiddings()
  const { showToast } = useToast()
  const [data, setData] = useState(() => bidding?.dataHomologacao ?? todayLocalISO())

  if (!bidding) return null

  const jaTinhaData = bidding.dataHomologacao != null

  const salvar = () => {
    updateEtapa.mutate(
      { biddingId: bidding.id, etapa: 'Adjudicada e Homologada', dataHomologacao: data },
      {
        onSuccess: () => { showToast('Data de Homologação salva.'); onClose() },
        onError: (err) => showToast(`Erro ao salvar a data: ${err instanceof Error ? err.message : String(err)}`, 'error'),
      }
    )
  }

  return (
    <Modal open onClose={onClose} title="Data de Homologação" maxWidth="max-w-sm">
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-base-400">{bidding.objeto}</p>
        {jaTinhaData && (
          <p className="text-[11px] text-warning-400 font-semibold">⚠ Essa licitação já tinha uma data registrada — corrija se estiver errada.</p>
        )}
        <Field label="Data em que o órgão homologou o resultado" required>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={!data || updateEtapa.isPending}>
            {updateEtapa.isPending ? 'Salvando...' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
