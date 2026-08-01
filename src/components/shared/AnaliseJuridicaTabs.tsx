import { AlertCircle, HelpCircle, Loader2, RefreshCw, Scale, ScanSearch } from 'lucide-react'
import { Button } from '../ui/FormControls'
import { SecaoTexto } from './AnaliseEditalResumo'
import type { PontoAnaliseJuridica, ResultadoAnaliseJuridica, TipoAnaliseJuridica } from '../../hooks/useAnaliseJuridicaEdital'

const TIPOS_ANALISE_JURIDICA: { tipo: TipoAnaliseJuridica; label: string; icon: typeof HelpCircle }[] = [
  { tipo: 'esclarecimento', label: 'Esclarecimentos', icon: HelpCircle },
  { tipo: 'impugnacao', label: 'Impugnações', icon: Scale },
  { tipo: 'raio_x', label: 'Raio-X', icon: ScanSearch },
]

const COR_NIVEL: Record<string, string> = {
  Alto: 'bg-negative-500/15 text-negative-400 border-negative-500/30',
  Alta: 'bg-negative-500/15 text-negative-400 border-negative-500/30',
  Médio: 'bg-warning-500/15 text-warning-400 border-warning-500/30',
  Média: 'bg-warning-500/15 text-warning-400 border-warning-500/30',
  Baixo: 'bg-base-800 text-base-400 border-base-700',
  Baixa: 'bg-base-800 text-base-400 border-base-700',
}

function Selo({ texto }: { texto?: string | null }) {
  if (!texto) return null
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 shrink-0 ${COR_NIVEL[texto] ?? 'bg-base-800 text-base-400 border-base-700'}`}>
      {texto}
    </span>
  )
}

function PontoJuridicoCard({ p, mostrarTipoPonto }: { p: PontoAnaliseJuridica; mostrarTipoPonto: boolean }) {
  return (
    <div className="bg-base-850/60 border border-base-800 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-[12.5px] font-bold text-accent-300">{p.localizacao}</p>
        <div className="flex items-center gap-1.5">
          {mostrarTipoPonto && <Selo texto={p.tipoPonto} />}
          <Selo texto={p.probabilidade} />
          <Selo texto={p.prioridade} />
        </div>
      </div>
      {p.textoOriginal && <p className="text-[12px] text-base-500 italic">"{p.textoOriginal}"</p>}
      <p className="text-[12px] text-base-300">{p.motivo}</p>
      {p.risco && <p className="text-[11px] text-warning-300"><strong className="font-bold">Risco:</strong> {p.risco}</p>}
      {p.fundamentoLegal && <p className="text-[11px] text-base-500"><strong className="font-bold text-base-400">Fundamento legal:</strong> {p.fundamentoLegal}</p>}
      {p.jurisprudencia && <p className="text-[11px] text-base-500"><strong className="font-bold text-base-400">Jurisprudência:</strong> {p.jurisprudencia}</p>}
      {p.sugestao && (
        <div className="bg-base-900/60 border border-base-700/40 rounded-lg p-2 text-[12px] text-base-200">
          {p.sugestao}
        </div>
      )}
    </div>
  )
}

interface AnaliseJuridicaResultado {
  status?: string
  resultado: ResultadoAnaliseJuridica | null
  erroMensagem: string | null
}

interface AnaliseJuridicaMutation {
  mutate: () => void
  isPending: boolean
  isError: boolean
  error: unknown
}

// Esclarecimentos / Impugnações / Raio-X — 3 análises de IA independentes
// sobre o mesmo edital, cada uma com seu próprio prompt jurídico. Os botões
// funcionam como abas (trocar não dispara a IA de novo à toa) e o botão de
// ação roda/refaz só a análise selecionada no momento.
//
// Genérico o suficiente pra rodar tanto sobre uma Licitação (Kanban) quanto
// sobre uma Oportunidade (antes de virar licitação de verdade) — puramente
// apresentacional: quem chama já decidiu qual tipo está ativo e já chamou o
// hook certo pra aquele tipo (useAnaliseJuridicaEdital ou
// useAnaliseJuridicaOportunidade), já que hooks não podem ser passados
// escondidos dentro de uma prop/callback (regras de hooks).
export function AnaliseJuridicaTabs({ temEdital, tipoAtivo, onTrocarTipo, analysis, analisar, travado }: {
  temEdital: boolean
  tipoAtivo: TipoAnaliseJuridica
  onTrocarTipo: (tipo: TipoAnaliseJuridica) => void
  analysis: AnaliseJuridicaResultado | null
  analisar: AnaliseJuridicaMutation
  travado: boolean
}) {
  const status = analysis?.status
  const processando = (status === 'processando' && !travado) || analisar.isPending
  const resultado = analysis?.resultado ?? null
  const pontos = resultado?.pontos ?? []
  const atual = TIPOS_ANALISE_JURIDICA.find((t) => t.tipo === tipoAtivo)!

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Análise Jurídica do Edital</p>
        <div className="flex items-center gap-2 flex-wrap">
          {TIPOS_ANALISE_JURIDICA.map(({ tipo, label, icon: Icon }) => (
            <button
              key={tipo}
              onClick={() => onTrocarTipo(tipo)}
              className={`flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border transition ${
                tipoAtivo === tipo
                  ? 'bg-accent-500/15 border-accent-500/40 text-accent-300'
                  : 'bg-base-850 border-base-700 text-base-400 hover:text-base-200 hover:border-base-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => analisar.mutate()} disabled={!temEdital || processando}>
          {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <atual.icon className="w-4 h-4" />}
          {processando ? 'Analisando...' : status === 'concluido' ? `Analisar ${atual.label} Novamente` : `Analisar ${atual.label}`}
        </Button>
        {!temEdital && (
          <span className="text-[11px] text-base-500 italic">Envie o edital acima antes de analisar.</span>
        )}
      </div>

      {(status === 'erro' || analisar.isError || travado) && (
        <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-negative-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[12px] text-negative-300">
              {travado
                ? 'A análise demorou demais e parece ter travado (provavelmente o edital é grande/escaneado demais pra function atual processar a tempo). Tente novamente.'
                : analysis?.erroMensagem || (analisar.error instanceof Error ? analisar.error.message : null) || 'Não foi possível concluir esta análise.'}
            </p>
            <button onClick={() => analisar.mutate()} className="flex items-center gap-1.5 text-[11px] text-accent-300 hover:text-accent-200 transition mt-1.5">
              <RefreshCw className="w-3 h-3" /> Tentar novamente
            </button>
          </div>
        </div>
      )}

      {!status && temEdital && (
        <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 text-[12px] text-accent-300 flex items-start gap-2">
          <atual.icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {tipoAtivo === 'esclarecimento' && 'Clique acima pra IA identificar pontos do edital que podem gerar pedido de esclarecimento ao órgão.'}
            {tipoAtivo === 'impugnacao' && 'Clique acima pra IA fazer uma auditoria jurídica em busca de fundamentos pra uma possível impugnação.'}
            {tipoAtivo === 'raio_x' && 'Clique acima pra uma auditoria completa combinando esclarecimentos e impugnações num raio-x só.'}
          </span>
        </div>
      )}

      {status === 'concluido' && (
        <div className="flex flex-col gap-3">
          {resultado?.resumoGeral && <SecaoTexto label="Panorama Geral" texto={resultado.resumoGeral} />}
          {pontos.length === 0 ? (
            <p className="text-[12px] text-base-500 italic">Nenhum ponto relevante identificado.</p>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
                {pontos.length} ponto(s) identificado(s)
              </p>
              <div className="flex flex-col gap-2">
                {pontos.map((p, idx) => (
                  <PontoJuridicoCard key={idx} p={p} mostrarTipoPonto={tipoAtivo === 'raio_x'} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
