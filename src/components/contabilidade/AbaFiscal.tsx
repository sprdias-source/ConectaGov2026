import { useState } from 'react'
import { Landmark, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card } from '../ui/Primitives'
import { Field, Input, Select, Button } from '../ui/FormControls'
import CurrencyInput from '../ui/CurrencyInput'
import ErrorAlert from '../ui/ErrorAlert'
import { formatBRL } from '../../hooks/useAccountBalances'
import { useRegimeTributario } from '../../hooks/useRegimeTributario'
import { useSimplesNacional } from '../../hooks/useSimplesNacional'
import { useTiposServico } from '../../hooks/useTiposServico'
import { todayLocalISO } from '../../lib/dateUtils'
import type { RegimeTributario, AnexoSimples } from '../../types/domain'
import NotasFiscaisSection from './NotasFiscaisSection'

const REGIME_LABEL: Record<RegimeTributario, string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
}

export default function AbaFiscal() {
  const { historico, vigente, registrarTroca } = useRegimeTributario()
  const { conferenciaDas, faixas } = useSimplesNacional()
  const { tiposServico, addTipoServico } = useTiposServico()

  const [competencia, setCompetencia] = useState(todayLocalISO().slice(0, 7))
  const [dasReal, setDasReal] = useState<number | null>(null)
  const [trocandoRegime, setTrocandoRegime] = useState(false)
  const [novoRegime, setNovoRegime] = useState<RegimeTributario>('simples_nacional')
  const [novoAnexo, setNovoAnexo] = useState<AnexoSimples>('III')
  const [novaVigencia, setNovaVigencia] = useState(todayLocalISO())
  const [novaObs, setNovaObs] = useState('')

  const [novoTipoAberto, setNovoTipoAberto] = useState(false)
  const [tipoNome, setTipoNome] = useState('')
  const [retemIss, setRetemIss] = useState(false)
  const [retemInss, setRetemInss] = useState(false)
  const [retemFederal, setRetemFederal] = useState(false)
  const [aliqIss, setAliqIss] = useState(0)
  const [aliqInss, setAliqInss] = useState(0)
  const [aliqFederal, setAliqFederal] = useState(0)

  const conferencia = conferenciaDas(competencia)

  const salvarTroca = () => {
    registrarTroca.mutate(
      { regime: novoRegime, anexoSimples: novoRegime === 'simples_nacional' ? novoAnexo : null, vigenciaInicio: novaVigencia, observacao: novaObs || undefined },
      { onSuccess: () => { setTrocandoRegime(false); setNovaObs('') } }
    )
  }

  const salvarTipoServico = () => {
    if (!tipoNome.trim()) return
    addTipoServico.mutate(
      {
        nome: tipoNome.trim(),
        retemIss, retemInss, retemIrPisCofinsCsll: retemFederal,
        aliquotaIssRetido: retemIss ? aliqIss : null,
        aliquotaInssRetido: retemInss ? aliqInss : null,
        aliquotaFederalRetido: retemFederal ? aliqFederal : null,
      },
      {
        onSuccess: () => {
          setNovoTipoAberto(false); setTipoNome('')
          setRetemIss(false); setRetemInss(false); setRetemFederal(false)
          setAliqIss(0); setAliqInss(0); setAliqFederal(0)
        },
      }
    )
  }

  return (
    <div className="px-6 mt-4 pb-10 flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Landmark className="w-4 h-4 text-accent-400" />
          <h3 className="text-sm font-bold text-base-100">Regime Tributário</h3>
        </div>
        <div className="flex items-center gap-0">
          {historico.map((h, idx) => (
            <div key={h.id} className="flex-1 text-center relative">
              {idx < historico.length - 1 && <div className="absolute top-[5px] left-1/2 w-full h-0.5 bg-base-700" />}
              <div className={`w-3 h-3 rounded-full mx-auto mb-1.5 relative z-10 ${h.vigenciaFim === null ? 'bg-accent-500 shadow-[0_0_0_4px_rgba(20,163,176,0.15)]' : 'bg-base-600'}`} />
              <p className={`text-[12px] font-bold ${h.vigenciaFim === null ? 'text-base-100' : 'text-base-500'}`}>
                {REGIME_LABEL[h.regime]}{h.anexoSimples ? ` · Anexo ${h.anexoSimples}` : ''}
              </p>
              <p className="text-[10px] text-base-500">
                {new Date(h.vigenciaInicio + 'T12:00:00').toLocaleDateString('pt-BR')} – {h.vigenciaFim ? new Date(h.vigenciaFim + 'T12:00:00').toLocaleDateString('pt-BR') : 'atual'}
              </p>
            </div>
          ))}
        </div>
        <div className="text-right mt-2">
          <button onClick={() => setTrocandoRegime((v) => !v)} className="text-[11.5px] font-semibold text-accent-400 hover:text-accent-300">
            {trocandoRegime ? 'Cancelar' : '+ Registrar troca de regime'}
          </button>
        </div>
        {trocandoRegime && (
          <div className="mt-3 pt-3 border-t border-base-800 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Novo Regime">
              <Select value={novoRegime} onChange={(e) => setNovoRegime(e.target.value as RegimeTributario)}>
                <option value="simples_nacional">Simples Nacional</option>
                <option value="lucro_presumido">Lucro Presumido</option>
                <option value="lucro_real">Lucro Real</option>
              </Select>
            </Field>
            {novoRegime === 'simples_nacional' && (
              <Field label="Anexo">
                <Select value={novoAnexo} onChange={(e) => setNovoAnexo(e.target.value as AnexoSimples)}>
                  <option value="III">Anexo III</option>
                  <option value="V">Anexo V</option>
                </Select>
              </Field>
            )}
            <Field label="Vigente a partir de">
              <Input type="date" value={novaVigencia} onChange={(e) => setNovaVigencia(e.target.value)} />
            </Field>
            <Field label="Observação (opcional)">
              <Input value={novaObs} onChange={(e) => setNovaObs(e.target.value)} placeholder="Ex: alteração contratual, mudança de faixa..." />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={salvarTroca} disabled={registrarTroca.isPending}>{registrarTroca.isPending ? 'Salvando...' : 'Registrar Troca'}</Button>
            </div>
            <ErrorAlert error={registrarTroca.error} />
          </div>
        )}
      </Card>

      {vigente?.regime === 'simples_nacional' && conferencia && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-sm font-bold text-base-100 mb-1">RBT12 e Faixa Atual</h3>
              <p className="text-[12px] text-base-500 mb-3">Receita bruta acumulada nos últimos 12 meses</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-base-900 border border-base-800 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-base-500 font-bold">RBT12</p>
                  <p className="text-[14px] font-extrabold font-mono text-base-100">{formatBRL(conferencia.rbt12)}</p>
                </div>
                <div className="bg-base-900 border border-base-800 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-base-500 font-bold">Faixa</p>
                  <p className="text-[14px] font-extrabold text-base-100">{conferencia.faixaAtual.faixa} de 6</p>
                  {!conferencia.faixaAtual.conferido && (
                    <p className="text-[9.5px] text-warning-400 flex items-center gap-1 mt-0.5"><AlertTriangle className="w-2.5 h-2.5" /> a conferir</p>
                  )}
                </div>
                <div className="bg-base-900 border border-base-800 rounded-lg p-3">
                  <p className="text-[10px] uppercase text-base-500 font-bold">Alíquota Efetiva</p>
                  <p className="text-[14px] font-extrabold font-mono text-accent-400">{conferencia.aliquotaEfetiva.toFixed(2)}%</p>
                </div>
              </div>
              {conferencia.faltaProximaFaixa !== null && (
                <p className="text-[11.5px] text-base-500 mt-3">
                  Faltam <b className="text-base-300">{formatBRL(conferencia.faltaProximaFaixa)}</b> pra próxima faixa.
                </p>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-bold text-base-100 mb-1">Conferência do DAS</h3>
              <p className="text-[12px] text-base-500 mb-3">Estimado pelo sistema × valor real emitido pela contabilidade</p>
              <Field label="Competência">
                <Input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
              </Field>
              <div className="flex justify-between text-[12px] mt-3 py-1">
                <span className="text-base-400">Receita do mês</span>
                <span className="font-mono font-semibold text-base-200">{formatBRL(conferencia.receitaMes)}</span>
              </div>
              <div className="flex justify-between text-[12px] py-1">
                <span className="text-base-400">DAS Estimado</span>
                <span className="font-mono font-bold text-base-100">{formatBRL(conferencia.dasEstimado)}</span>
              </div>
              <div className="flex justify-between items-center text-[12px] py-2 mt-1 border-t border-base-800">
                <span className="text-base-400">Valor real emitido</span>
                <div className="w-32"><CurrencyInput value={dasReal ?? 0} onChange={setDasReal} /></div>
              </div>
              {dasReal !== null && dasReal > 0 && (
                <div className={`mt-2 text-center text-[11.5px] font-bold rounded-lg py-1.5 ${Math.abs(dasReal - conferencia.dasEstimado) < 0.02 ? 'bg-positive-500/10 text-positive-400' : 'bg-warning-500/10 text-warning-400'}`}>
                  {Math.abs(dasReal - conferencia.dasEstimado) < 0.02
                    ? <span className="flex items-center justify-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Confere — diferença R$ 0,00</span>
                    : `Diferença: ${formatBRL(dasReal - conferencia.dasEstimado)}`}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="text-sm font-bold text-base-100 mb-1">Detalhamento por Tributo</h3>
            <p className="text-[12px] text-base-500 mb-3">Competência {competencia}</p>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-base-800 text-left">
                  <th className="pb-2 font-bold text-[10px] uppercase text-base-500">Tributo</th>
                  <th className="pb-2 font-bold text-[10px] uppercase text-base-500 text-right">%</th>
                  <th className="pb-2 font-bold text-[10px] uppercase text-base-500 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {conferencia.breakdown.map((b) => (
                  <tr key={b.tributo} className="border-b border-base-800/60">
                    <td className="py-1.5 text-base-300">
                      {b.tributo}
                      {!b.conferido && <span className="ml-1.5 text-[9.5px] text-warning-400">(a conferir)</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono text-base-500">{b.percentual.toFixed(2)}%</td>
                    <td className="py-1.5 text-right font-mono font-semibold text-base-200">{formatBRL(b.valor)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-base-700">
                  <td className="py-2 font-bold text-base-100" colSpan={2}>DAS Estimado</td>
                  <td className="py-2 text-right font-mono font-extrabold text-accent-300">{formatBRL(conferencia.dasEstimado)}</td>
                </tr>
              </tbody>
            </table>
            {!faixas.every((f) => f.conferido) && (
              <p className="text-[10.5px] text-warning-400 mt-3 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                Algumas faixas ainda não foram conferidas contra a Resolução CGSN 140/2018 — a Faixa 1 foi validada contra um DAS real, as demais precisam de revisão antes de confiar 100%.
              </p>
            )}
          </Card>
        </>
      )}

      {vigente?.regime !== 'simples_nacional' && vigente && (
        <Card className="p-5">
          <p className="text-[12.5px] text-base-400">
            Regime vigente é <b>{REGIME_LABEL[vigente.regime]}</b> — a conferência de RBT12/DAS só se aplica ao Simples Nacional.
          </p>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-base-100">Tipos de Serviço</h3>
          <button onClick={() => setNovoTipoAberto((v) => !v)} className="flex items-center gap-1 text-[11.5px] font-semibold text-accent-400 hover:text-accent-300">
            <Plus className="w-3.5 h-3.5" /> Novo tipo de serviço
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {tiposServico.map((t) => {
            const semRetencao = !t.retemIss && !t.retemInss && !t.retemIrPisCofinsCsll
            return (
              <div key={t.id} className="flex items-center justify-between bg-base-850/60 rounded-lg px-3 py-2">
                <span className="text-[13px] text-base-200">{t.nome}</span>
                {semRetencao ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-500/10 text-accent-400">Sem retenção</span>
                ) : (
                  <span className="flex gap-1">
                    {t.retemIss && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-warning-500/10 text-warning-400">ISS {t.aliquotaIssRetido}%</span>}
                    {t.retemInss && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-warning-500/10 text-warning-400">INSS {t.aliquotaInssRetido}%</span>}
                    {t.retemIrPisCofinsCsll && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-warning-500/10 text-warning-400">IR/PIS/COFINS/CSLL {t.aliquotaFederalRetido}%</span>}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {novoTipoAberto && (
          <div className="mt-3 pt-3 border-t border-base-800 flex flex-col gap-3">
            <Field label="Nome do Tipo de Serviço">
              <Input value={tipoNome} onChange={(e) => setTipoNome(e.target.value)} placeholder="Ex: Locação de Bens Móveis" />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="flex items-center gap-2 text-[12px] text-base-300 mb-1.5">
                  <input type="checkbox" checked={retemIss} onChange={(e) => setRetemIss(e.target.checked)} className="accent-accent-500" /> Retém ISS
                </label>
                {retemIss && <Input type="number" step="0.01" placeholder="Alíquota %" value={aliqIss || ''} onChange={(e) => setAliqIss(parseFloat(e.target.value) || 0)} />}
              </div>
              <div>
                <label className="flex items-center gap-2 text-[12px] text-base-300 mb-1.5">
                  <input type="checkbox" checked={retemInss} onChange={(e) => setRetemInss(e.target.checked)} className="accent-accent-500" /> Retém INSS
                </label>
                {retemInss && <Input type="number" step="0.01" placeholder="Alíquota %" value={aliqInss || ''} onChange={(e) => setAliqInss(parseFloat(e.target.value) || 0)} />}
              </div>
              <div>
                <label className="flex items-center gap-2 text-[12px] text-base-300 mb-1.5">
                  <input type="checkbox" checked={retemFederal} onChange={(e) => setRetemFederal(e.target.checked)} className="accent-accent-500" /> Retém IR/PIS/COFINS/CSLL
                </label>
                {retemFederal && <Input type="number" step="0.01" placeholder="Alíquota %" value={aliqFederal || ''} onChange={(e) => setAliqFederal(parseFloat(e.target.value) || 0)} />}
              </div>
            </div>
            {retemFederal && vigente?.regime === 'simples_nacional' && (
              <p className="text-[10.5px] text-warning-400 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                Empresas optantes pelo Simples Nacional são legalmente isentas dessa retenção (Lei 10.833/2003, art. 34) — confirme se esse tipo de serviço realmente exige isso antes de marcar.
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={salvarTipoServico} disabled={!tipoNome.trim() || addTipoServico.isPending}>Salvar</Button>
            </div>
          </div>
        )}
      </Card>

      <NotasFiscaisSection />
    </div>
  )
}
