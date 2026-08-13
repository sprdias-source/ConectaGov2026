import { useState } from 'react'
import { MessageCircleQuestion, Loader2, Send } from 'lucide-react'

interface QA {
  pergunta: string
  resposta: string
}

// Painel de pergunta livre sobre o edital, estilo "converse com o
// documento" — complementa o resumo estruturado da análise (AnaliseEditalResumo)
// pra quando a pergunta do cliente não cai em nenhum dos campos fixos
// extraídos. Compartilhado entre LicitacaoPage.tsx e OportunidadesPanel.tsx,
// que só diferem em qual hook (usePerguntaEdital / usePerguntaOportunidade)
// passam pra fazer a pergunta de verdade.
export function PerguntaEditalPanel({ perguntar, isPending }: {
  perguntar: (pergunta: string) => Promise<string>
  isPending: boolean
}) {
  const [pergunta, setPergunta] = useState('')
  const [historico, setHistorico] = useState<QA[]>([])
  const [erro, setErro] = useState<string | null>(null)

  const handleEnviar = async () => {
    const texto = pergunta.trim()
    if (!texto || isPending) return
    setErro(null)
    try {
      const resposta = await perguntar(texto)
      setHistorico((h) => [...h, { pergunta: texto, resposta }])
      setPergunta('')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível responder. Tente novamente.')
    }
  }

  return (
    <div className="border-t border-base-800/60 pt-3.5 flex flex-col gap-3">
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold flex items-center gap-1.5">
        <MessageCircleQuestion className="w-3.5 h-3.5 text-accent-400" /> Pergunte sobre este edital
      </p>

      {historico.length > 0 && (
        <div className="flex flex-col gap-2.5 max-h-72 overflow-y-auto">
          {historico.map((qa, idx) => (
            <div key={idx} className="flex flex-col gap-1 items-start">
              <p className="text-[12px] font-semibold text-base-200 bg-base-850/60 rounded-lg px-3 py-1.5 max-w-[90%]">{qa.pergunta}</p>
              <p className="text-[12px] text-base-300 bg-accent-500/10 border border-accent-500/20 rounded-lg px-3 py-2 max-w-[90%] whitespace-pre-line">{qa.resposta}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleEnviar() }}
          placeholder="Ex: qual o prazo de entrega? tem exigência de amostra?"
          disabled={isPending}
          className="flex-1 bg-base-900 border border-base-700 rounded-lg px-3 py-2 text-[12px] text-base-100 focus:border-accent-400 outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleEnviar}
          disabled={isPending || !pergunta.trim()}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 py-2 transition shrink-0"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Perguntar
        </button>
      </div>

      {erro && <p className="text-[11px] text-negative-400">{erro}</p>}
      <p className="text-[10px] text-base-500 italic">A resposta é gerada na hora, direto do PDF enviado — pode levar alguns segundos.</p>
    </div>
  )
}
