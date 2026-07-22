import { useState, useEffect } from 'react'
import { ShieldQuestion, Send } from 'lucide-react'
import { useCaptchaSessions } from '../../hooks/useCaptchaSessions'
import { useClients } from '../../hooks/useClients'

// Aparece por cima de qualquer tela do sistema quando um robô (rodando no
// GitHub Actions) fica esperando o usuário resolver um captcha pra
// continuar. Só mostra uma sessão por vez, mesmo que várias estejam na
// fila — evita empilhar modais.
export default function ResolverCaptchaModal() {
  const { sessoesPendentes, responder } = useCaptchaSessions()
  const { clients } = useClients()
  const [resposta, setResposta] = useState('')

  const sessao = sessoesPendentes[0]

  useEffect(() => {
    setResposta('')
  }, [sessao?.id])

  // Beep gerado direto no navegador (sem depender de arquivo de áudio) —
  // toca 2 vezes, pra chamar atenção mesmo se o usuário estiver longe da
  // tela. Alguns navegadores bloqueiam áudio sem interação prévia do
  // usuário nessa aba — nesse caso, falha silenciosamente (o alerta
  // visual do modal continua funcionando normalmente).
  useEffect(() => {
    if (!sessao) return
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContextClass()
      const tocarBeep = (delayMs: number) => {
        setTimeout(() => {
          const oscillator = ctx.createOscillator()
          const gain = ctx.createGain()
          oscillator.connect(gain)
          gain.connect(ctx.destination)
          oscillator.type = 'sine'
          oscillator.frequency.value = 880
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
          oscillator.start()
          oscillator.stop(ctx.currentTime + 0.4)
        }, delayMs)
      }
      tocarBeep(0)
      tocarBeep(500)
    } catch {
      // navegador bloqueou áudio — sem problema, o alerta visual continua
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.id])

  if (!sessao) return null

  const clientName = clients.find((c) => c.id === sessao.clientId)?.name ?? 'Cliente'

  const handleEnviar = () => {
    if (!resposta.trim()) return
    responder.mutate({ id: sessao.id, resposta: resposta.trim() })
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
      <div className="bg-base-900 border border-base-700 rounded-xl p-5 max-w-sm w-full">
        <div className="flex items-center gap-2 mb-3">
          <ShieldQuestion className="w-5 h-5 text-accent-400" />
          <h3 className="font-bold text-base-100">Resolver Captcha</h3>
        </div>
        <p className="text-[12px] text-base-400 mb-3">
          O robô de <strong className="text-base-200">{sessao.tipo.toUpperCase()}</strong> pra{' '}
          <strong className="text-base-200">{clientName}</strong> está esperando você digitar o captcha abaixo:
        </p>
        <img
          src={sessao.imagemBase64}
          alt="Captcha"
          className="w-full rounded-lg border border-base-700 mb-3 bg-white"
        />
        <input
          autoFocus
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleEnviar() }}
          placeholder="Digite o que está na imagem"
          className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 mb-3 focus:outline-none focus:ring-1 focus:ring-accent-500"
        />
        <button
          onClick={handleEnviar}
          disabled={responder.isPending || !resposta.trim()}
          className="w-full flex items-center justify-center gap-1.5 bg-accent-500 hover:bg-accent-400 text-base-950 font-semibold text-[13px] rounded-lg py-2 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" /> {responder.isPending ? 'Enviando...' : 'Enviar Resposta'}
        </button>
      </div>
    </div>
  )
}
