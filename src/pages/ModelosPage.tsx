import { useState, useMemo } from 'react'
import { BookOpen, Plus, Search, Download, Trash2, Copy, FileText, X, Wand2, Sparkles } from 'lucide-react'
import { PageHeader, Card, EmptyState } from '../components/ui/Primitives'
import { Button, Input, Select } from '../components/ui/FormControls'
import { useModelosDocumentos } from '../hooks/useModelosDocumentos'
import { useClients } from '../hooks/useClients'
import { useBiddings } from '../hooks/useBiddings'
import { usePermissaoFerramenta } from '../hooks/usePermissaoFerramenta'
import { DECLARACOES_PADRAO } from '../lib/declaracoesPadrao'
import type { CategoriaModeloDocumento } from '../types/domain'

const CATEGORIAS: CategoriaModeloDocumento[] = [
  'Impugnação', 'Recurso', 'Contrarrazão', 'Declaração', 'Proposta', 'Memorial', 'Planilha', 'Outro',
]

// Mesmas chaves usadas em gerar-proposta/gerar-declaracoes — preenchimento
// aqui é client-side (sem chamar Edge Function), pra ser instantâneo — o
// cenário descrito é literalmente "pregoeiro pedindo ajuste em minutos".
function preencherModelo(conteudo: string, client: any, bidding: any | null): string {
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()
  const valores: Record<string, string> = {
    cliente_nome: client?.name ?? '',
    cliente_cnpj: client?.cnpj ?? '',
    responsavel_nome: client?.responsavelNome ?? '',
    responsavel_cpf: client?.responsavelCpf ?? '',
    responsavel_cargo: client?.responsavelCargo ?? '',
    cidade_emissao: client?.cidade ?? '',
    data_emissao: hoje,
    orgao: bidding?.orgao ?? '',
    modalidade: bidding?.modalidade ?? '',
    numero_edital: bidding?.numeroEdital ?? '',
    objeto: bidding?.objeto ?? '',
  }
  return conteudo.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in valores ? valores[key] : match))
}

export default function ModelosPage() {
  const { modelos, isLoading, addModelo, deleteModelo, getDownloadUrl } = useModelosDocumentos()
  const { clients } = useClients()
  const { biddings } = useBiddings()
  const { nivel: nivelCadastros } = usePermissaoFerramenta('cadastros')
  const podeEditar = nivelCadastros === 'edicao'
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [gerandoId, setGerandoId] = useState<string | null>(null)
  const [carregandoPadrao, setCarregandoPadrao] = useState(false)
  const [gerarClientId, setGerarClientId] = useState('')
  const [gerarBiddingId, setGerarBiddingId] = useState('')
  const [resultadoGerado, setResultadoGerado] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', categoria: CATEGORIAS[0] as CategoriaModeloDocumento, tags: '', conteudo: '', observacoes: '' })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [baixando, setBaixando] = useState<string | null>(null)

  const modelosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return modelos.filter((m) => {
      if (filtroCategoria !== 'todas' && m.categoria !== filtroCategoria) return false
      if (!termo) return true
      const alvo = `${m.nome} ${m.tags ?? ''} ${m.conteudo ?? ''}`.toLowerCase()
      return alvo.includes(termo)
    })
  }, [modelos, busca, filtroCategoria])

  const handleSalvar = async () => {
    if (!form.nome.trim()) return
    await addModelo.mutateAsync({
      nome: form.nome.trim(),
      categoria: form.categoria,
      tags: form.tags.trim() || null,
      conteudo: form.conteudo.trim() || null,
      observacoes: form.observacoes.trim() || null,
      file: arquivo,
    })
    setShowForm(false)
    setForm({ nome: '', categoria: CATEGORIAS[0], tags: '', conteudo: '', observacoes: '' })
    setArquivo(null)
  }

  const handleCopiar = async (conteudo: string) => {
    try {
      await navigator.clipboard.writeText(conteudo)
      alert('Conteúdo copiado!')
    } catch {
      alert('Não foi possível copiar — selecione e copie manualmente.')
    }
  }

  const handleBaixar = async (id: string, storagePath: string) => {
    setBaixando(id)
    try {
      const url = await getDownloadUrl(storagePath)
      window.open(url, '_blank')
    } catch {
      alert('Não foi possível abrir o arquivo.')
    } finally {
      setBaixando(null)
    }
  }

  const handleAbrirGerar = (id: string) => {
    setGerandoId(gerandoId === id ? null : id)
    setGerarClientId('')
    setGerarBiddingId('')
    setResultadoGerado('')
  }

  const handleConfirmarGerar = (conteudo: string) => {
    const client = clients.find((c) => c.id === gerarClientId)
    const bidding = biddings.find((b) => b.id === gerarBiddingId) ?? null
    if (!client) return
    setResultadoGerado(preencherModelo(conteudo, client, bidding))
  }

  const biddingsDoCliente = biddings.filter((b) => b.clientId === gerarClientId)

  const handleCarregarPadrao = async () => {
    setCarregandoPadrao(true)
    try {
      const nomesExistentes = new Set(modelos.map((m) => m.nome))
      const faltando = DECLARACOES_PADRAO.filter((d) => !nomesExistentes.has(d.nome))
      if (faltando.length === 0) {
        alert('Todas as declarações padrão já estão cadastradas.')
        return
      }
      for (const d of faltando) {
        await addModelo.mutateAsync({ nome: d.nome, categoria: d.categoria, tags: d.tags, conteudo: d.conteudo })
      }
      alert(`${faltando.length} declaração(ões) padrão adicionada(s). Confira a base legal com seu jurídico antes de usar oficialmente.`)
    } catch (err) {
      alert('Erro ao carregar as declarações padrão: ' + String(err))
    } finally {
      setCarregandoPadrao(false)
    }
  }

  return (
    <div className="pb-10">
      <PageHeader
        title="Banco de Modelos"
        subtitle="Impugnações, recursos, contrarrazões, declarações e outros modelos reutilizáveis — tudo pesquisável"
        icon={BookOpen}
        actions={
          podeEditar ? (
            <>
              <button
                onClick={handleCarregarPadrao}
                disabled={carregandoPadrao}
                title="Adiciona as 16 declarações padrão mais comuns (Lei 14.133/2021) — não duplica as que já existem"
                className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-300 hover:text-accent-200 bg-base-850 border border-base-700 rounded-lg px-3 py-1.5 transition disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" /> {carregandoPadrao ? 'Carregando...' : 'Carregar Declarações Padrão'}
              </button>
              <button
                onClick={() => setShowForm((v) => !v)}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-base-950 bg-accent-500 hover:bg-accent-400 rounded-lg px-3 py-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Novo Modelo
              </button>
            </>
          ) : undefined
        }
      />

      <div className="px-6 mt-4 flex flex-col gap-4">
        <Card className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-4 h-4 text-base-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                placeholder="Buscar por nome, tag ou conteúdo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full bg-base-850 border border-base-700 rounded-lg pl-9 pr-3 py-2 text-sm text-base-100 placeholder:text-base-500 focus:border-accent-400 outline-none"
              />
            </div>
            <Select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="w-56">
              <option value="todas">Todas as categorias</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </Card>

        {showForm && (
          <Card className="p-4 border-accent-500/20">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-bold text-base-100">Novo Modelo</p>
              <button onClick={() => setShowForm(false)} className="text-base-500 hover:text-base-200"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Nome *</label>
                  <Input placeholder="Ex: Recurso Administrativo Padrão" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Categoria</label>
                  <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaModeloDocumento })}>
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Tags (separadas por vírgula)</label>
                <Input placeholder="Ex: pregão eletrônico, prazo, urgente" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Texto do modelo (opcional — pra copiar rápido)</label>
                <textarea
                  value={form.conteudo}
                  onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                  rows={5}
                  className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 focus:border-accent-400 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Arquivo (opcional)</label>
                <input
                  type="file"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                  className="w-full text-[12px] text-base-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-accent-500 file:text-base-950 file:font-semibold file:text-[11px] hover:file:bg-accent-400 file:cursor-pointer"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button onClick={handleSalvar} disabled={!form.nome.trim() || addModelo.isPending}>
                  {addModelo.isPending ? 'Salvando...' : 'Salvar Modelo'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {isLoading ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando modelos...</div>
        ) : modelosFiltrados.length === 0 ? (
          <Card>
            <EmptyState icon={BookOpen} title="Nenhum modelo encontrado" description="Cadastre modelos de impugnações, recursos, declarações e outros documentos que você reutiliza." />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {modelosFiltrados.map((m) => (
              <Card key={m.id} className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-accent-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-base-100">{m.nome}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent-500/15 text-accent-300 border border-accent-500/25">{m.categoria}</span>
                    </div>
                    {m.tags && <p className="text-[11px] text-base-500 mt-0.5">{m.tags}</p>}
                    {m.conteudo && expandido === m.id && (
                      <div className="mt-2 bg-base-950 border border-base-800 rounded-lg p-3 text-[12px] text-base-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {m.conteudo}
                      </div>
                    )}
                    {m.conteudo && gerandoId === m.id && (
                      <div className="mt-2 bg-base-900/60 border border-accent-500/20 rounded-lg p-3 flex flex-col gap-2">
                        <p className="text-[11px] text-accent-300 font-semibold">Preencher com dados de:</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={gerarClientId} onChange={(e) => { setGerarClientId(e.target.value); setGerarBiddingId(''); setResultadoGerado('') }}>
                            <option value="">Cliente...</option>
                            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                          <Select value={gerarBiddingId} onChange={(e) => setGerarBiddingId(e.target.value)} disabled={!gerarClientId}>
                            <option value="">Licitação (opcional)...</option>
                            {biddingsDoCliente.map((b) => <option key={b.id} value={b.id}>{b.objeto.slice(0, 40)}</option>)}
                          </Select>
                        </div>
                        <Button onClick={() => handleConfirmarGerar(m.conteudo!)} disabled={!gerarClientId} className="self-start">
                          <Wand2 className="w-3.5 h-3.5" /> Preencher
                        </Button>
                        {resultadoGerado && (
                          <>
                            <textarea
                              readOnly
                              value={resultadoGerado}
                              rows={6}
                              className="w-full bg-base-950 border border-base-800 rounded-lg px-3 py-2 text-[12px] text-base-200 whitespace-pre-wrap"
                            />
                            <Button variant="secondary" onClick={() => handleCopiar(resultadoGerado)} className="self-start">
                              <Copy className="w-3.5 h-3.5" /> Copiar texto preenchido
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {m.conteudo && (
                      <>
                        <button onClick={() => handleAbrirGerar(m.id)} title="Preencher com dados de um cliente/licitação" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition text-[11px] font-semibold px-2 flex items-center gap-1">
                          <Wand2 className="w-3.5 h-3.5" /> Gerar
                        </button>
                        <button onClick={() => setExpandido(expandido === m.id ? null : m.id)} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition text-[11px] font-semibold px-2">
                          {expandido === m.id ? 'Ocultar' : 'Ver texto'}
                        </button>
                        <button onClick={() => handleCopiar(m.conteudo!)} title="Copiar texto" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {m.storagePath && (
                      <button onClick={() => handleBaixar(m.id, m.storagePath!)} disabled={baixando === m.id} title="Baixar arquivo" className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {podeEditar && (
                      <button onClick={() => deleteModelo.mutate(m)} title="Remover" className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
