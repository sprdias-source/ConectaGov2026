import { useState } from 'react'
import { Users, Check, X } from 'lucide-react'
import { useConvitesEquipePendentes } from '../../hooks/useConvitesEquipePendentes'

// Aparece por cima de qualquer tela quando a conta logada foi convidada
// como membro de outra equipe — nunca vira 'ativo' sozinho (ver
// convidar-membro/index.ts): só depois que a própria pessoa aceita aqui,
// explicitamente, é que a conta passa a contar como membro daquela equipe.
// Mesmo padrão de "um modal bloqueante por vez" do ResolverCaptchaModal.
export default function ConvitesEquipeModal() {
  const { convitesPendentes, responder } = useConvitesEquipePendentes()
  const [erro, setErro] = useState<string | null>(null)

  const convite = convitesPendentes[0]
  if (!convite) return null

  const responderConvite = (aceitar: boolean) => {
    setErro(null)
    responder.mutate(
      { teamMemberId: convite.id, aceitar },
      { onError: (err) => setErro(err instanceof Error ? err.message : 'Erro ao responder ao convite') }
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
      <div className="bg-base-900 border border-base-700 rounded-xl p-5 max-w-sm w-full">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-accent-400" />
          <h3 className="font-bold text-base-100">Convite para equipe</h3>
        </div>
        <p className="text-[13px] text-base-400 mb-4 leading-relaxed">
          Você foi convidado{convite.nome ? ` como "${convite.nome}"` : ''} para fazer parte da equipe de outra conta no ConectaGov. Ao aceitar, o acesso que essa conta liberar pra você na Matriz de Permissões passa a valer — os dados que você já tem hoje continuam seus.
        </p>

        {erro && (
          <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-2.5 mb-3 text-[12px] text-negative-300">
            {erro}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => responderConvite(false)}
            disabled={responder.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-base-300 hover:text-negative-400 bg-base-850 hover:bg-base-800 border border-base-700 rounded-lg py-2 transition disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" /> Recusar
          </button>
          <button
            onClick={() => responderConvite(true)}
            disabled={responder.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 bg-accent-500 hover:bg-accent-400 text-base-950 font-semibold text-[13px] rounded-lg py-2 disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" /> {responder.isPending ? 'Enviando...' : 'Aceitar'}
          </button>
        </div>
      </div>
    </div>
  )
}
