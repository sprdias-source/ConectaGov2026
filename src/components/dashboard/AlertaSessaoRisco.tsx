import { AlertOctagon } from 'lucide-react'
import { Card } from '../ui/Primitives'
import { useSessoesDeRisco, JANELA_SESSAO_RISCO_DIAS } from '../../hooks/useSessoesDeRisco'
import { useClients } from '../../hooks/useClients'

// Alerta de maior prioridade da tela onde aparece: sessão iminente +
// documentação não pronta é uma combinação perigosa (vai disputar sem
// estar habilitado), por isso fica mais forte visualmente que os avisos
// normais de vencimento. Usado no Dashboard e no Painel Hoje — self-
// contido (busca os próprios dados) pra não duplicar a lógica em cada tela.
export default function AlertaSessaoRisco() {
  const { sessoesDeRisco } = useSessoesDeRisco()
  const { clients } = useClients()

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente removido'

  if (sessoesDeRisco.length === 0) return null

  return (
    <div className="px-6 mt-4">
      <Card className="p-4 border-2 border-negative-500/60 bg-negative-500/15 flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 text-negative-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-extrabold text-negative-300 uppercase tracking-wide">
            Sessão próxima sem documentação pronta
          </p>
          <p className="text-[11px] text-negative-400/80 mt-0.5">
            Disputa em até {JANELA_SESSAO_RISCO_DIAS} dias com checklist obrigatório incompleto ou com certidão vencendo.
          </p>
          <div className="flex flex-col gap-1.5 mt-2.5">
            {sessoesDeRisco.map(({ bidding: b, dias, status }) => (
              <div key={b.id} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-negative-200 truncate">
                  {b.objeto} — {clientName(b.clientId)} ({b.orgao})
                </span>
                <span className="font-bold text-negative-300 shrink-0 whitespace-nowrap">
                  {status} · {dias === 0 ? 'sessão hoje' : dias === 1 ? 'sessão amanhã' : `sessão em ${dias} dias`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
