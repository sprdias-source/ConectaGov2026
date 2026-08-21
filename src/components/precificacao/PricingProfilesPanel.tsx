import { useState } from 'react'
import { Plus, X, ChevronDown, ChevronRight, Trash2, Calculator } from 'lucide-react'
import { Button, Input } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import ConfirmDialog from '../ui/ConfirmDialog'
import { formatBRL } from '../../hooks/useAccountBalances'
import { usePricingProfiles } from '../../hooks/usePricingProfiles'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import { calcularValorMinimo, somarLinhasPorTipo } from '../../lib/precificacao'
import { mensagemDeErro } from '../../lib/errors'
import type { PricingProfile, PricingProfileLine } from '../../types/domain'

type LinhaDraft = Partial<PricingProfileLine> & { _key: string }
let keyCounter = 0
const newKey = () => `linha-${Date.now()}-${keyCounter++}`

const linhaVazia = (tipo: PricingProfileLine['tipo']): LinhaDraft => ({ _key: newKey(), tipo, nome: '', percentual: 0 })

// Editor de linhas de Impostos ou Despesas — cada linha é nome + percentual,
// igual ao formulário "Assistente de perfil de precificação" da Licitei.
function EditorLinhas({ titulo, linhas, onChange }: {
  titulo: string
  linhas: LinhaDraft[]
  onChange: (linhas: LinhaDraft[]) => void
}) {
  const tipo = titulo === 'Impostos' ? 'imposto' : 'despesa'
  return (
    <div className="border border-base-800 rounded-lg p-3 bg-base-900/40">
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">{titulo}</p>
      <div className="flex flex-col gap-2">
        {linhas.map((l) => (
          <div key={l._key} className="flex items-center gap-2">
            <Input
              placeholder={tipo === 'imposto' ? 'Ex: DAS (Simples Nacional)' : 'Ex: Frete e Despesas Operacionais'}
              value={l.nome ?? ''}
              onChange={(e) => onChange(linhas.map((x) => (x._key === l._key ? { ...x, nome: e.target.value } : x)))}
              className="flex-1 !py-1.5 !px-2 text-[12px]"
            />
            <Input
              type="number" step="0.01" placeholder="%"
              value={l.percentual ?? ''}
              onChange={(e) => onChange(linhas.map((x) => (x._key === l._key ? { ...x, percentual: parseFloat(e.target.value) || 0 } : x)))}
              className="w-20 !py-1.5 !px-2 text-[12px] text-right font-mono"
            />
            <button type="button" onClick={() => onChange(linhas.filter((x) => x._key !== l._key))} className="text-base-500 hover:text-negative-400 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...linhas, linhaVazia(tipo)])}
        className="mt-2 text-[11px] font-semibold text-accent-400 hover:text-accent-300"
      >
        + Adicionar {tipo === 'imposto' ? 'imposto' : 'despesa'}
      </button>
    </div>
  )
}

// Memorial de cálculo ao vivo — mesma ideia da simulação da Licitei: mostra
// pra onde vai cada percentual antes de aplicar o perfil de verdade.
function MemorialCalculo({ impostosPct, despesasPct, margemPct }: { impostosPct: number; despesasPct: number; margemPct: number }) {
  const [custoTeste, setCustoTeste] = useState('100')
  const custo = parseFloat(custoTeste) || 0
  const valorMinimo = calcularValorMinimo(custo, impostosPct, despesasPct, margemPct)

  return (
    <div className="border border-base-800 rounded-lg p-3 bg-base-900/40">
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Memorial de Cálculo</p>
      <code className="block text-[10.5px] text-accent-400 bg-accent-500/10 border border-accent-500/20 rounded-md px-2 py-1.5 mb-2">
        Valor Mínimo = Custo ÷ ((100% − Impostos − Despesas − Margem) ÷ 100)
      </code>
      <div className="mb-2">
        <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Custo de Teste (R$)</label>
        <Input type="number" step="0.01" value={custoTeste} onChange={(e) => setCustoTeste(e.target.value)} className="!py-1.5 !px-2 text-[12px] max-w-[140px]" />
      </div>
      {valorMinimo === null ? (
        <p className="text-[11px] text-negative-400">Impostos + Despesas + Margem somam 100% ou mais — essa conta não fecha.</p>
      ) : (
        <div className="flex flex-col gap-1 text-[11.5px] text-base-400">
          <div className="flex justify-between"><span>Impostos ({impostosPct.toFixed(2)}%)</span><span className="font-mono text-base-200">{formatBRL(valorMinimo * impostosPct / 100)}</span></div>
          <div className="flex justify-between"><span>Despesas ({despesasPct.toFixed(2)}%)</span><span className="font-mono text-base-200">{formatBRL(valorMinimo * despesasPct / 100)}</span></div>
          <div className="flex justify-between"><span>Lucro Líquido ({margemPct.toFixed(2)}%)</span><span className="font-mono text-base-200">{formatBRL(valorMinimo * margemPct / 100)}</span></div>
          <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-dashed border-base-700">
            <span className="text-[11.5px] font-bold text-base-200">Valor Mínimo Sugerido</span>
            <span className="font-mono text-lg font-extrabold text-accent-300">{formatBRL(valorMinimo)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function FormularioPerfil({ nome, descricao, margemPct, linhas, onChangeNome, onChangeDescricao, onChangeMargem, onChangeLinhas }: {
  nome: string
  descricao: string
  margemPct: string
  linhas: LinhaDraft[]
  onChangeNome: (v: string) => void
  onChangeDescricao: (v: string) => void
  onChangeMargem: (v: string) => void
  onChangeLinhas: (v: LinhaDraft[]) => void
}) {
  const impostos = linhas.filter((l) => l.tipo === 'imposto')
  const despesas = linhas.filter((l) => l.tipo === 'despesa')
  const impostosPct = somarLinhasPorTipo(linhas.map((l) => ({ tipo: l.tipo as 'imposto' | 'despesa', percentual: l.percentual ?? 0 })), 'imposto')
  const despesasPct = somarLinhasPorTipo(linhas.map((l) => ({ tipo: l.tipo as 'imposto' | 'despesa', percentual: l.percentual ?? 0 })), 'despesa')

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nome do Perfil *</label>
          <Input placeholder="Ex: Simples Nacional — Comércio" value={nome} onChange={(e) => onChangeNome(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Margem de Lucro (%)</label>
          <Input type="number" step="0.01" value={margemPct} onChange={(e) => onChangeMargem(e.target.value)} className="max-w-[140px]" />
        </div>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Descrição</label>
        <Input placeholder="Ex: Empresa do Simples Nacional, Anexo I (Comércio)" value={descricao} onChange={(e) => onChangeDescricao(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="flex flex-col gap-3">
          <EditorLinhas titulo="Impostos" linhas={impostos} onChange={(novos) => onChangeLinhas([...novos, ...despesas])} />
          <EditorLinhas titulo="Despesas" linhas={despesas} onChange={(novos) => onChangeLinhas([...impostos, ...novos])} />
        </div>
        <MemorialCalculo impostosPct={impostosPct} despesasPct={despesasPct} margemPct={parseFloat(margemPct) || 0} />
      </div>
    </div>
  )
}

function PerfilDetalhe({ perfil, podeEditar }: { perfil: PricingProfile; podeEditar: boolean }) {
  const { salvarPerfil, deletePerfil } = usePricingProfiles()
  const [nome, setNome] = useState(perfil.nome)
  const [descricao, setDescricao] = useState(perfil.descricao ?? '')
  const [margemPct, setMargemPct] = useState(String(perfil.margemPct))
  const [linhas, setLinhas] = useState<LinhaDraft[]>(perfil.linhas.map((l) => ({ ...l, _key: newKey() })))
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const handleSalvar = () => {
    setErro(null)
    if (!nome.trim()) { setErro('Dê um nome pra esse perfil.'); return }
    salvarPerfil.mutate(
      { perfil: { id: perfil.id, nome: nome.trim(), descricao: descricao.trim() || null, margemPct: parseFloat(margemPct) || 0 }, linhas },
      { onError: (err) => setErro(mensagemDeErro(err)) }
    )
  }

  return (
    <div className="border-t border-base-800 px-4 py-3.5 flex flex-col gap-3.5 bg-base-900/30">
      <FormularioPerfil
        nome={nome} descricao={descricao} margemPct={margemPct} linhas={linhas}
        onChangeNome={setNome} onChangeDescricao={setDescricao} onChangeMargem={setMargemPct} onChangeLinhas={setLinhas}
      />
      {erro && <p className="text-[11px] text-negative-400">{erro}</p>}
      {podeEditar && (
        <div className="flex items-center justify-between pt-1 border-t border-base-800/60">
          <button onClick={() => setConfirmandoExclusao(true)} className="flex items-center gap-1 text-[11px] text-base-500 hover:text-negative-400">
            <Trash2 className="w-3.5 h-3.5" /> Excluir Perfil
          </button>
          <Button onClick={handleSalvar} disabled={salvarPerfil.isPending}>
            {salvarPerfil.isPending ? 'Salvando...' : 'Salvar Perfil'}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmandoExclusao}
        title="Excluir Perfil de Precificação"
        description={`Remove o perfil "${perfil.nome}". Itens que já tiveram esse perfil aplicado mantêm o Valor Mínimo calculado — só perdem o vínculo com o perfil. Não pode ser desfeito.`}
        confirmLabel="Excluir"
        danger
        isLoading={deletePerfil.isPending}
        onCancel={() => setConfirmandoExclusao(false)}
        onConfirm={() => deletePerfil.mutate(perfil, { onSuccess: () => setConfirmandoExclusao(false) })}
      />
    </div>
  )
}

export default function PricingProfilesPanel() {
  const { nivel, carregando: carregandoPermissao } = usePermissaoFerramenta('cadastros')
  const podeEditar = nivel === 'edicao' && !carregandoPermissao
  const { profiles, isLoading, salvarPerfil } = usePricingProfiles()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [descricaoNova, setDescricaoNova] = useState('')
  const [margemNova, setMargemNova] = useState('15')
  const [linhasNovas, setLinhasNovas] = useState<LinhaDraft[]>([linhaVazia('imposto'), linhaVazia('despesa')])
  const [erroForm, setErroForm] = useState<string | null>(null)

  const resetForm = () => {
    setMostrarForm(false)
    setNomeNovo('')
    setDescricaoNova('')
    setMargemNova('15')
    setLinhasNovas([linhaVazia('imposto'), linhaVazia('despesa')])
  }

  const handleSalvarNovo = async () => {
    setErroForm(null)
    if (!nomeNovo.trim()) { setErroForm('Dê um nome pra esse perfil.'); return }
    try {
      await salvarPerfil.mutateAsync({
        perfil: { nome: nomeNovo.trim(), descricao: descricaoNova.trim() || null, margemPct: parseFloat(margemNova) || 0 },
        linhas: linhasNovas,
      })
      resetForm()
    } catch (err) {
      setErroForm(mensagemDeErro(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-base-100 flex items-center gap-1.5"><Calculator className="w-4 h-4 text-accent-400" /> Perfis de Precificação</h3>
          <p className="text-[11px] text-base-500 mt-0.5">Margem + Impostos + Despesas, salvos uma vez e aplicáveis em lote aos itens de qualquer licitação (aba "Precificação")</p>
        </div>
        {podeEditar && !mostrarForm && (
          <button onClick={() => setMostrarForm(true)} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
            <Plus className="w-3.5 h-3.5" /> Novo Perfil
          </button>
        )}
      </div>

      <ErrorAlert error={salvarPerfil.error} />

      {mostrarForm && podeEditar && (
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl px-4 py-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-accent-300 font-semibold">Novo Perfil</p>
            <button onClick={resetForm} className="text-base-500 hover:text-base-300"><X className="w-3.5 h-3.5" /></button>
          </div>
          <FormularioPerfil
            nome={nomeNovo} descricao={descricaoNova} margemPct={margemNova} linhas={linhasNovas}
            onChangeNome={setNomeNovo} onChangeDescricao={setDescricaoNova} onChangeMargem={setMargemNova} onChangeLinhas={setLinhasNovas}
          />
          {erroForm && <p className="text-[11px] text-negative-400">{erroForm}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={resetForm}>Cancelar</Button>
            <Button onClick={handleSalvarNovo} disabled={!nomeNovo.trim() || salvarPerfil.isPending}>
              {salvarPerfil.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-[12px] text-base-500 italic py-2">Carregando...</p>
      ) : profiles.length === 0 ? (
        <p className="text-[12px] text-base-500 italic py-2">Nenhum perfil de precificação cadastrado ainda.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {profiles.map((p) => {
            const aberto = expandedId === p.id
            const impostosPct = somarLinhasPorTipo(p.linhas, 'imposto')
            const despesasPct = somarLinhasPorTipo(p.linhas, 'despesa')
            return (
              <div key={p.id} className="bg-base-850/60 border border-base-800 rounded-lg overflow-hidden">
                <button onClick={() => setExpandedId(aberto ? null : p.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-base-850 transition">
                  {aberto ? <ChevronDown className="w-3.5 h-3.5 text-base-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-base-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-base-200 truncate">{p.nome}</p>
                    {p.descricao && <p className="text-[11px] text-base-500 truncate">{p.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border bg-accent-500/10 text-accent-400 border-accent-500/25">Margem {p.margemPct}%</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border bg-warning-500/10 text-warning-400 border-warning-500/25">Impostos {impostosPct.toFixed(2)}%</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border bg-base-800 text-base-400 border-base-700">Despesas {despesasPct.toFixed(2)}%</span>
                  </div>
                </button>
                {aberto && <PerfilDetalhe perfil={p} podeEditar={podeEditar} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
