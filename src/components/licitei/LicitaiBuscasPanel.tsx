import { useState } from 'react'
import { Plus, X, ChevronDown, ChevronRight, Play, Trash2, Search } from 'lucide-react'
import { Button, Input, Select } from '../ui/FormControls'
import ErrorAlert from '../ui/ErrorAlert'
import ConfirmDialog from '../ui/ConfirmDialog'
import { useLicitaiBuscas } from '../../hooks/useLicitaiBuscas'
import { MODALIDADES_VALIDAS } from '../../lib/analiseEdital'
import { mensagemDeErro } from '../../lib/errors'
import type { LicitaiBusca, LicitaiBuscaFiltros } from '../../types/domain'

// Sigla + nome dos estados brasileiros — só usado aqui pro filtro de
// Localização, não existe em nenhum outro lugar do sistema ainda.
const ESTADOS_BR: { sigla: string; nome: string }[] = [
  { sigla: 'AC', nome: 'Acre' }, { sigla: 'AL', nome: 'Alagoas' }, { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' }, { sigla: 'BA', nome: 'Bahia' }, { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' }, { sigla: 'ES', nome: 'Espírito Santo' }, { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' }, { sigla: 'MT', nome: 'Mato Grosso' }, { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' }, { sigla: 'PA', nome: 'Pará' }, { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' }, { sigla: 'PE', nome: 'Pernambuco' }, { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' }, { sigla: 'RN', nome: 'Rio Grande do Norte' }, { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' }, { sigla: 'RR', nome: 'Roraima' }, { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' }, { sigla: 'SE', nome: 'Sergipe' }, { sigla: 'TO', nome: 'Tocantins' },
]

const PERIODOS: { value: NonNullable<LicitaiBuscaFiltros['periodo']>; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7_dias', label: 'Próximos 7 dias' },
  { value: '30_dias', label: 'Próximos 30 dias' },
  { value: '6_meses', label: 'Próximos 6 meses' },
  { value: 'personalizado', label: 'Personalizado' },
]

const FILTROS_VAZIO: LicitaiBuscaFiltros = {
  palavraChave: '',
  tipoData: 'abertura',
  periodo: '6_meses',
  periodoInicio: '',
  periodoFim: '',
  somenteRecebendoProposta: true,
  modalidade: '',
  localizacaoModo: 'estados_cidades',
  estado: '',
  cidade: '',
  raioKm: 200,
  portal: '',
  registroPreco: null,
  tipo: [],
  palavrasIndesejadas: '',
  codigoUasg: '',
  numeroCompra: '',
  valorCompraMin: null,
  valorCompraMax: null,
  valorItemMin: null,
  valorItemMax: null,
  modoDisputa: '',
  esfera: null,
  orgao: '',
}

// Todos os campos abaixo espelham 1:1 o painel "Filtros de Pesquisa" do
// Licitei — é o que o robô (próxima etapa) vai preencher automaticamente
// naquele formulário. Quem não usa um campo simplesmente deixa em branco,
// igual no próprio Licitei.
function FormularioFiltros({ filtros, onChange }: {
  filtros: LicitaiBuscaFiltros
  onChange: (filtros: LicitaiBuscaFiltros) => void
}) {
  const set = <K extends keyof LicitaiBuscaFiltros>(campo: K, valor: LicitaiBuscaFiltros[K]) => onChange({ ...filtros, [campo]: valor })
  const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Palavra-chave</label>
        <Input placeholder="Digite o que você quer vender" value={filtros.palavraChave ?? ''} onChange={(e) => set('palavraChave', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Tipo de data</label>
          <Select value={filtros.tipoData ?? 'abertura'} onChange={(e) => set('tipoData', e.target.value as LicitaiBuscaFiltros['tipoData'])}>
            <option value="abertura">Abertura</option>
            <option value="publicacao">Publicação</option>
            <option value="encerramento">Encerramento</option>
          </Select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Período</label>
          <Select value={filtros.periodo ?? '6_meses'} onChange={(e) => set('periodo', e.target.value as LicitaiBuscaFiltros['periodo'])}>
            {PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
        </div>
        {filtros.periodo === 'personalizado' && (
          <div className="flex items-end gap-1.5">
            <Input type="date" value={filtros.periodoInicio ?? ''} onChange={(e) => set('periodoInicio', e.target.value)} />
            <Input type="date" value={filtros.periodoFim ?? ''} onChange={(e) => set('periodoFim', e.target.value)} />
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-[12px] text-base-300 cursor-pointer w-fit">
        <input type="checkbox" checked={filtros.somenteRecebendoProposta ?? false} onChange={(e) => set('somenteRecebendoProposta', e.target.checked)} className="accent-accent-500" />
        Somente recebendo proposta
      </label>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Modalidade</label>
        <Select value={filtros.modalidade ?? ''} onChange={(e) => set('modalidade', e.target.value)}>
          <option value="">— Qualquer —</option>
          {MODALIDADES_VALIDAS.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
      </div>

      <div className="bg-base-900/40 border border-base-800 rounded-lg p-3 flex flex-col gap-3">
        <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Localização</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => set('localizacaoModo', 'estados_cidades')}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition ${(filtros.localizacaoModo ?? 'estados_cidades') === 'estados_cidades' ? 'bg-accent-500/15 border-accent-500/40 text-accent-300' : 'bg-base-850 border-base-700 text-base-400'}`}
          >
            Estados/Cidades
          </button>
          <button
            type="button"
            onClick={() => set('localizacaoModo', 'raio_distancia')}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition ${filtros.localizacaoModo === 'raio_distancia' ? 'bg-accent-500/15 border-accent-500/40 text-accent-300' : 'bg-base-850 border-base-700 text-base-400'}`}
          >
            Raio de distância
          </button>
        </div>
        {(filtros.localizacaoModo ?? 'estados_cidades') === 'estados_cidades' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Estado</label>
              <Select value={filtros.estado ?? ''} onChange={(e) => set('estado', e.target.value)}>
                <option value="">— Selecionar estado —</option>
                {ESTADOS_BR.map((e) => <option key={e.sigla} value={e.sigla}>{e.nome}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Cidade</label>
              <Input placeholder="Selecionar cidade" value={filtros.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Cidade (centro do raio)</label>
              <Input placeholder="Selecionar cidade" value={filtros.cidade ?? ''} onChange={(e) => set('cidade', e.target.value)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold">Raio de distância</label>
                <span className="text-[12px] font-semibold text-base-200">{filtros.raioKm ?? 0} km</span>
              </div>
              <input
                type="range"
                min={0}
                max={500}
                step={10}
                value={filtros.raioKm ?? 0}
                onChange={(e) => set('raioKm', Number(e.target.value))}
                className="w-full accent-accent-500"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Portal</label>
        <Input placeholder="Pesquisar portal" value={filtros.portal ?? ''} onChange={(e) => set('portal', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Registro de Preço</label>
          <Select value={filtros.registroPreco ?? ''} onChange={(e) => set('registroPreco', (e.target.value || null) as LicitaiBuscaFiltros['registroPreco'])}>
            <option value="">— Qualquer —</option>
            <option value="sim">Sim</option>
            <option value="nao">Não</option>
          </Select>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1">Tipo</p>
          <div className="flex items-center gap-3 h-9">
            {(['material', 'servico'] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-[12px] text-base-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtros.tipo?.includes(t) ?? false}
                  onChange={(e) => {
                    const atual = filtros.tipo ?? []
                    set('tipo', e.target.checked ? [...atual, t] : atual.filter((x) => x !== t))
                  }}
                  className="accent-accent-500"
                />
                {t === 'material' ? 'Material' : 'Serviço'}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Palavras indesejadas</label>
        <Input placeholder="Termos que não quer como resultado" value={filtros.palavrasIndesejadas ?? ''} onChange={(e) => set('palavrasIndesejadas', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Código UASG</label>
          <Input value={filtros.codigoUasg ?? ''} onChange={(e) => set('codigoUasg', e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Número da Compra</label>
          <Input placeholder="Ex: 90001/2024" value={filtros.numeroCompra ?? ''} onChange={(e) => set('numeroCompra', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Valor da compra total (estimado)</label>
          <div className="flex items-center gap-1.5">
            <Input type="number" placeholder="Min" value={filtros.valorCompraMin ?? ''} onChange={(e) => set('valorCompraMin', numOrNull(e.target.value))} />
            <Input type="number" placeholder="Max" value={filtros.valorCompraMax ?? ''} onChange={(e) => set('valorCompraMax', numOrNull(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Valor do item (estimado)</label>
          <div className="flex items-center gap-1.5">
            <Input type="number" placeholder="Min" value={filtros.valorItemMin ?? ''} onChange={(e) => set('valorItemMin', numOrNull(e.target.value))} />
            <Input type="number" placeholder="Max" value={filtros.valorItemMax ?? ''} onChange={(e) => set('valorItemMax', numOrNull(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Modo de disputa</label>
          <Select value={filtros.modoDisputa ?? ''} onChange={(e) => set('modoDisputa', e.target.value)}>
            <option value="">— Qualquer —</option>
            <option value="Aberto">Aberto</option>
            <option value="Fechado">Fechado</option>
            <option value="Aberto e Fechado">Aberto e Fechado</option>
          </Select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Esfera</label>
          <Select value={filtros.esfera ?? ''} onChange={(e) => set('esfera', (e.target.value || null) as LicitaiBuscaFiltros['esfera'])}>
            <option value="">— Selecionar esfera —</option>
            <option value="federal">Federal</option>
            <option value="estadual">Estadual</option>
            <option value="municipal">Municipal</option>
          </Select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Órgão</label>
          <Input placeholder="Pesquisar órgão" value={filtros.orgao ?? ''} onChange={(e) => set('orgao', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

function BuscaDetalhe({ busca, podeEditar }: { busca: LicitaiBusca; podeEditar: boolean }) {
  const { updateBusca, alternarAtivo, deleteBusca } = useLicitaiBuscas()
  const [filtros, setFiltros] = useState<LicitaiBuscaFiltros>(busca.filtros)
  const [nome, setNome] = useState(busca.nome)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const alterado = JSON.stringify(filtros) !== JSON.stringify(busca.filtros) || nome !== busca.nome

  const handleSalvar = () => {
    setErro(null)
    if (!nome.trim()) { setErro('Dê um nome pra essa busca.'); return }
    updateBusca.mutate({ ...busca, nome: nome.trim(), filtros }, { onError: (err) => setErro(mensagemDeErro(err)) })
  }

  return (
    <div className="border-t border-base-800 px-4 py-3.5 flex flex-col gap-3.5 bg-base-900/30">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nome da busca</label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEditar} placeholder="Ex: TI — Goiás — Registro de Preço" />
      </div>

      <FormularioFiltros filtros={filtros} onChange={setFiltros} />

      {erro && <p className="text-[11px] text-negative-400">{erro}</p>}

      <div className="flex items-center justify-between pt-1 border-t border-base-800/60">
        <div className="flex items-center gap-2">
          <span title="Robô ainda não configurado — em breve">
            <Button disabled>
              <Play className="w-3.5 h-3.5" /> Rodar Busca
            </Button>
          </span>
          {busca.ultimaExecucaoEm && (
            <span className="text-[11px] text-base-500">Última execução: {new Date(busca.ultimaExecucaoEm).toLocaleString('pt-BR')}</span>
          )}
        </div>
        {podeEditar && (
          <div className="flex items-center gap-3">
            <button onClick={() => alternarAtivo.mutate(busca)} className="text-[11px] text-base-400 hover:text-base-200">
              {busca.ativo ? 'Desativar' : 'Ativar'}
            </button>
            <button onClick={() => setConfirmandoExclusao(true)} className="flex items-center gap-1 text-[11px] text-base-500 hover:text-negative-400">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
            <Button onClick={handleSalvar} disabled={!alterado || updateBusca.isPending}>
              {updateBusca.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmandoExclusao}
        title="Excluir Busca"
        description={`Remove a busca "${busca.nome}". Editais já encontrados por ela continuam na lista. Não pode ser desfeito.`}
        confirmLabel="Excluir"
        danger
        isLoading={deleteBusca.isPending}
        onCancel={() => setConfirmandoExclusao(false)}
        onConfirm={() => deleteBusca.mutate(busca, { onSuccess: () => setConfirmandoExclusao(false) })}
      />
    </div>
  )
}

export default function LicitaiBuscasPanel({ podeEditar }: { podeEditar: boolean }) {
  const { buscas, isLoading, addBusca } = useLicitaiBuscas()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [filtrosNovo, setFiltrosNovo] = useState<LicitaiBuscaFiltros>(FILTROS_VAZIO)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const handleSalvarNova = async () => {
    setErroForm(null)
    if (!nomeNovo.trim()) { setErroForm('Dê um nome pra essa busca.'); return }
    try {
      await addBusca.mutateAsync({ nome: nomeNovo.trim(), filtros: filtrosNovo })
      setMostrarForm(false)
      setNomeNovo('')
      setFiltrosNovo(FILTROS_VAZIO)
    } catch (err) {
      setErroForm(mensagemDeErro(err))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-base-100 flex items-center gap-1.5"><Search className="w-4 h-4 text-accent-400" /> Buscas Salvas — Licitei</h3>
          <p className="text-[11px] text-base-500 mt-0.5">Mesmos filtros do painel de pesquisa do Licitei — usados pelo robô pra buscar editais automaticamente</p>
        </div>
        {podeEditar && !mostrarForm && (
          <button onClick={() => setMostrarForm(true)} className="flex items-center gap-1.5 text-[11px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition">
            <Plus className="w-3.5 h-3.5" /> Nova busca
          </button>
        )}
      </div>

      <ErrorAlert error={addBusca.error} />

      {mostrarForm && podeEditar && (
        <div className="bg-base-850/60 border border-accent-500/20 rounded-xl px-4 py-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-accent-300 font-semibold">Nova busca</p>
            <button onClick={() => { setMostrarForm(false); setNomeNovo(''); setFiltrosNovo(FILTROS_VAZIO) }} className="text-base-500 hover:text-base-300"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nome da busca *</label>
            <Input placeholder="Ex: TI — Goiás — Registro de Preço" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} />
          </div>
          <FormularioFiltros filtros={filtrosNovo} onChange={setFiltrosNovo} />
          {erroForm && <p className="text-[11px] text-negative-400">{erroForm}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setMostrarForm(false); setNomeNovo(''); setFiltrosNovo(FILTROS_VAZIO) }}>Cancelar</Button>
            <Button onClick={handleSalvarNova} disabled={!nomeNovo.trim() || addBusca.isPending}>
              {addBusca.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-[12px] text-base-500 italic py-2">Carregando...</p>
      ) : buscas.length === 0 ? (
        <p className="text-[12px] text-base-500 italic py-2">Nenhuma busca salva ainda.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {buscas.map((b) => {
            const aberto = expandedId === b.id
            return (
              <div key={b.id} className="bg-base-850/60 border border-base-800 rounded-lg overflow-hidden">
                <button onClick={() => setExpandedId(aberto ? null : b.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-base-850 transition">
                  {aberto ? <ChevronDown className="w-3.5 h-3.5 text-base-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-base-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-base-200 truncate">{b.nome}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${b.ativo ? 'bg-positive-500/15 text-positive-400 border-positive-500/30' : 'bg-base-700/40 text-base-400 border-base-700'}`}>
                    {b.ativo ? 'Ativa' : 'Inativa'}
                  </span>
                </button>
                {aberto && <BuscaDetalhe busca={b} podeEditar={podeEditar} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
