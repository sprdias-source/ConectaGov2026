import { useMemo } from 'react'
import { formatBRL } from '../../hooks/useAccountBalances'

interface PulseData {
  editais: number
  disputas: number
  vitorias: number
  comissaoPrevista: number
}

/**
 * Elemento de assinatura visual do Dashboard — específico ao negócio do
 * ConectaGov, não um gráfico genérico de biblioteca. Combina em uma só
 * peça visual o funil real da operação (editais monitorados -> disputas
 * -> vitórias) com a expectativa financeira do mês, através de um anel de
 * progresso cujo preenchimento é a taxa de conversão do funil.
 */
export default function OperationPulse({ editais, disputas, vitorias, comissaoPrevista }: PulseData) {
  const taxaConversao = editais > 0 ? Math.min(100, Math.round((vitorias / editais) * 100)) : 0

  const { circumference, dashoffset } = useMemo(() => {
    const radius = 64
    const circumference = 2 * Math.PI * radius
    const dashoffset = circumference - (taxaConversao / 100) * circumference
    return { circumference, dashoffset }
  }, [taxaConversao])

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-40 h-40 shrink-0">
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
          <circle cx="80" cy="80" r="64" fill="none" stroke="var(--color-base-800)" strokeWidth="10" />
          <circle
            cx="80" cy="80" r="64" fill="none"
            stroke="var(--color-accent-400)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold font-mono text-base-100 tabular-nums">{taxaConversao}%</span>
          <span className="text-[9px] uppercase tracking-widest text-base-500 font-bold mt-0.5">conversão</span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-base-500 font-bold mb-2">Pulso da Operação</p>
        <div className="flex flex-col gap-2.5">
          <FunnelRow label="Editais monitorados" value={editais} color="bg-base-500" />
          <FunnelRow label="Em disputa" value={disputas} color="bg-accent-400" />
          <FunnelRow label="Vitórias" value={vitorias} color="bg-positive-400" />
        </div>
        <div className="mt-3 pt-3 border-t border-base-800">
          <p className="text-[10px] uppercase tracking-widest text-base-500 font-bold">Comissão prevista no funil ativo</p>
          <p className="text-lg font-extrabold font-mono text-accent-300 tabular-nums mt-0.5">{formatBRL(comissaoPrevista)}</p>
        </div>
      </div>
    </div>
  )
}

function FunnelRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-1.5 h-1.5 rounded-full ${color} shrink-0`} />
      <span className="text-[12px] text-base-300 flex-1">{label}</span>
      <span className="text-[13px] font-mono font-bold text-base-100 tabular-nums">{value}</span>
    </div>
  )
}
