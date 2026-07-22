import { useState } from 'react'
import {
  X, FileText, Upload, Plus, Trash2, CheckCircle2, Circle, Download,
  AlertCircle, Loader2, Sparkles, Award, Check, History, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button, Input, Select } from '../ui/FormControls'
import { useAttachedFiles } from '../../hooks/useAttachedFiles'
import { useBiddingChecklist } from '../../hooks/useBiddingChecklist'
import { useBiddingItemVersions } from '../../hooks/useBiddingItemVersions'
import { useClientDocuments, calcDocStatus } from '../../hooks/useClientDocuments'
import { useAtestados, calcularSimilaridade } from '../../hooks/useAtestados'
import { useBiddings } from '../../hooks/useBiddings'
import { usePermissaoFerramenta } from '../../hooks/usePermissaoFerramenta'
import { CERT_CONFIG } from '../../types/domain'
import type { Bidding, BiddingChecklistItem, BiddingEtapa } from '../../types/domain'

const ETAPAS_TRILHA: BiddingEtapa[] = [
  'Análise de Edital',
  'Montagem de Documentação',
  'Proposta Enviada',
  'Disputa de Lances',
  'Fase Recursal',
  'Adjudicada e Homologada',
]


interface Props {
  bidding: Bidding
  clientName: string
  onClose: () => void
}

const CATEGORIAS_CHECKLIST = [
  'Habilitação Jurídica',
  'Regularidade Fiscal e Trabalhista',
  'Qualificação Econômico-Financeira',
  'Qualificação Técnica',
  'Proposta',
  'Outro',
]

// Trilho visual da etapa da licitação — só aparência + clique pra trocar de
// etapa (sem anexo/histórico por etapa, que já são cobertos pela
// Documentação da Licitação e pelo log de auditoria do sistema).
function EtapaTrilha({ etapaAtual, onMudar, atualizando, podeEditar }: {
  etapaAtual: BiddingEtapa | null
  onMudar: (etapa: BiddingEtapa) => void
  atualizando: boolean
  podeEditar: boolean
}) {
  const indiceAtual = etapaAtual ? ETAPAS_TRILHA.indexOf(etapaAtual) : -1
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {ETAPAS_TRILHA.map((etapa, idx) => {
        const concluida = idx < indiceAtual
        const atual = idx === indiceAtual
        return (
          <div key={etapa} className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onMudar(etapa)}
              disabled={atualizando || !podeEditar}
              title={etapa}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition border whitespace-nowrap disabled:opacity-50 ${podeEditar ? '' : 'cursor-default'} ${
                atual
                  ? 'bg-accent-500 text-base-950 border-accent-500'
                  : concluida
                  ? 'bg-positive-500/15 text-positive-400 border-positive-500/30 hover:bg-positive-500/25'
                  : 'bg-base-850/60 text-base-500 border-base-700 hover:text-base-300'
              }`}
            >
              {concluida && <Check className="w-3 h-3" />}
              {etapa}
            </button>
            {idx < ETAPAS_TRILHA.length - 1 && (
              <div className={`w-3 h-px shrink-0 ${concluida ? 'bg-positive-500/40' : 'bg-base-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// Histórico de versões dos itens/preços — só leitura de propósito (sem
// "restaurar" automático, pra não arriscar sobrescrever algo sem querer).
function HistoricoVersoes({ biddingId }: { biddingId: string }) {
  const { versoes, isLoading } = useBiddingItemVersions(biddingId)
  const [aberto, setAberto] = useState(false)
  const [versaoExpandida, setVersaoExpandida] = useState<string | null>(null)

  if (isLoading || versoes.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <button onClick={() => setAberto((v) => !v)} className="flex items-center justify-between w-full text-left">
        <span className="text-[10px] uppercase tracking-wider text-base-500 font-bold flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" /> Histórico de Versões dos Itens ({versoes.length})
        </span>
        {aberto ? <ChevronUp className="w-3.5 h-3.5 text-base-500" /> : <ChevronDown className="w-3.5 h-3.5 text-base-500" />}
      </button>
      {aberto && (
        <div className="flex flex-col gap-1.5">
          {versoes.map((v) => (
            <div key={v.id} className="bg-base-850/60 border border-base-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setVersaoExpandida(versaoExpandida === v.id ? null : v.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left"
              >
                <span className="text-[11px] font-bold text-accent-300 shrink-0">V{v.versao}</span>
                <span className="text-[11px] text-base-400 flex-1">
                  {new Date(v.createdAt).toLocaleString('pt-BR')}
                  {v.alteradoPorEmail && <span className="text-base-500"> — {v.alteradoPorEmail}</span>}
                </span>
                <span className="text-[10px] text-base-500 shrink-0">{v.itensSnapshot.length} item(ns)</span>
              </button>
              {versaoExpandida === v.id && (
                <div className="border-t border-base-800 px-3 py-2 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-base-500">
                        <th className="text-left font-semibold pr-2">Item</th>
                        <th className="text-left font-semibold pr-2">Descrição</th>
                        <th className="text-right font-semibold pr-2">Qtd.</th>
                        <th className="text-right font-semibold pr-2">Vl. Licitado</th>
                        <th className="text-right font-semibold">Vl. Ofertado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.itensSnapshot.map((item: any, idx: number) => (
                        <tr key={idx} className="border-t border-base-800/60">
                          <td className="py-1 pr-2 text-base-300">{item.numero_item}</td>
                          <td className="py-1 pr-2 text-base-300 max-w-[200px] truncate">{item.descricao}</td>
                          <td className="py-1 pr-2 text-right text-base-400">{item.quantidade}</td>
                          <td className="py-1 pr-2 text-right font-mono text-base-400">{Number(item.valor_unitario_licitado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-1 text-right font-mono text-base-400">{item.valor_unitario_ofertado ? Number(item.valor_unitario_ofertado).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LicitacaoDocumentacaoModal({ bidding, clientName, onClose }: Props) {
  const { updateEtapa } = useBiddings()
  const { nivel: nivelLicitacoes } = usePermissaoFerramenta('licitacoes')
  const podeEditar = nivelLicitacoes === 'edicao'
  const { files: editalFiles, uploadFile: uploadEdital, deleteFile: deleteEdital, getDownloadUrl: getEditalUrl } = useAttachedFiles('licitacao', bidding.id)
  const { items, addItem, updateItem, deleteItem } = useBiddingChecklist(bidding.id)
  const { documents: clientDocs } = useClientDocuments(bidding.clientId)
  const { atestados } = useAtestados(bidding.clientId)

  const rankingAtestados = [...atestados]
    .map((a) => ({ atestado: a, similaridade: calcularSimilaridade(bidding.objeto, a.objeto) }))
    .sort((a, b) => b.similaridade - a.similaridade)

  const [enviandoEdital, setEnviandoEdital] = useState(false)
  const [showNovoItem, setShowNovoItem] = useState(false)
  const [novoItem, setNovoItem] = useState({ descricao: '', categoria: CATEGORIAS_CHECKLIST[0], obrigatorio: true, prazo: '', responsavelNome: '' })
  const [abrindo, setAbrindo] = useState<string | null>(null)

  const edital = editalFiles.find((f) => f.category === 'Edital')

  const handleUploadEdital = async (file: File) => {
    setEnviandoEdital(true)
    try {
      await uploadEdital.mutateAsync({ file, category: 'Edital' })
    } catch (err) {
      alert('Erro ao enviar o edital: ' + String(err))
    } finally {
      setEnviandoEdital(false)
    }
  }

  const handleAbrirEdital = async () => {
    if (!edital) return
    setAbrindo(edital.id)
    try {
      const url = await getEditalUrl(edital.storagePath)
      window.open(url, '_blank')
    } catch {
      alert('Não foi possível abrir o edital.')
    } finally {
      setAbrindo(null)
    }
  }

  const handleAdicionarItem = () => {
    if (!novoItem.descricao.trim()) return
    addItem.mutate(
      {
        descricao: novoItem.descricao.trim(),
        categoria: novoItem.categoria,
        obrigatorio: novoItem.obrigatorio,
        prazo: novoItem.prazo || null,
        responsavelNome: novoItem.responsavelNome.trim() || null,
      },
      { onSuccess: () => { setShowNovoItem(false); setNovoItem({ descricao: '', categoria: CATEGORIAS_CHECKLIST[0], obrigatorio: true, prazo: '', responsavelNome: '' }) } }
    )
  }

  // Um item está "atendido" se: foi marcado manualmente, OU tem um
  // documento anexado específico, OU aponta pra um tipo de certidão que o
  // cliente já tem válida (ou vencendo — melhor avisar que esconder).
  const statusItem = (item: BiddingChecklistItem): 'atendido' | 'vencendo' | 'faltando' => {
    if (item.attachedFileId) return 'atendido'
    if (item.clientDocumentTipo) {
      const doc = clientDocs.find((d) => d.tipo === item.clientDocumentTipo)
      if (doc?.storagePath) {
        const status = calcDocStatus(doc.dataValidade)
        if (status === 'valido') return 'atendido'
        if (status === 'vencendo') return 'vencendo'
      }
    }
    return item.atendido ? 'atendido' : 'faltando'
  }

  const totalObrigatorios = items.filter((i) => i.obrigatorio).length
  const atendidosObrigatorios = items.filter((i) => i.obrigatorio && statusItem(i) === 'atendido').length
  const vencendoObrigatorios = items.filter((i) => i.obrigatorio && statusItem(i) === 'vencendo').length
  const faltandoObrigatorios = items.filter((i) => i.obrigatorio && statusItem(i) === 'faltando').length
  const percentualAderencia = totalObrigatorios > 0 ? Math.round((atendidosObrigatorios / totalObrigatorios) * 100) : null

  // "Motor de Compliance" simples: cruza o que o edital exige (itens
  // obrigatórios do checklist) com o que o cliente já tem — sem IA, sem
  // banco novo, só a mesma lógica que já usamos por item, resumida.
  const statusGeral: 'HABILITADO' | 'ATENÇÃO' | 'INABILITADO' | null =
    totalObrigatorios === 0 ? null
    : faltandoObrigatorios > 0 ? 'INABILITADO'
    : vencendoObrigatorios > 0 ? 'ATENÇÃO'
    : 'HABILITADO'

  return (
    <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4">
      <div className="bg-base-900 border border-base-700 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-base-800 sticky top-0 bg-base-900 z-10">
          <div>
            <h3 className="font-bold text-base-100">Documentação da Licitação</h3>
            <p className="text-[12px] text-base-500">{clientName} — {bidding.objeto.slice(0, 60)}</p>
          </div>
          <button onClick={onClose} className="text-base-500 hover:text-base-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Trilho visual da etapa */}
          <EtapaTrilha
            etapaAtual={bidding.etapa}
            atualizando={updateEtapa.isPending}
            onMudar={(etapa) => updateEtapa.mutate({ biddingId: bidding.id, etapa })}
            podeEditar={podeEditar}
          />

          {/* Status de Habilitação — resumo tipo "motor de compliance": cruza
              o que o edital exige (checklist) com o que o cliente já tem */}
          {statusGeral && (
            <div className={`rounded-xl border p-4 flex items-center justify-between ${
              statusGeral === 'HABILITADO' ? 'bg-positive-500/10 border-positive-500/30' :
              statusGeral === 'ATENÇÃO' ? 'bg-warning-500/10 border-warning-500/30' :
              'bg-negative-500/10 border-negative-500/30'
            }`}>
              <div>
                <p className={`text-lg font-extrabold ${
                  statusGeral === 'HABILITADO' ? 'text-positive-400' :
                  statusGeral === 'ATENÇÃO' ? 'text-warning-400' : 'text-negative-400'
                }`}>
                  {statusGeral === 'HABILITADO' && 'HABILITADO'}
                  {statusGeral === 'ATENÇÃO' && 'ATENÇÃO — documento(s) vencendo'}
                  {statusGeral === 'INABILITADO' && 'INABILITADO — documentação incompleta'}
                </p>
                <p className="text-[12px] text-base-400 mt-0.5">
                  {atendidosObrigatorios}/{totalObrigatorios} itens obrigatórios atendidos
                  {faltandoObrigatorios > 0 && ` — faltam ${faltandoObrigatorios}`}
                  {vencendoObrigatorios > 0 && ` — ${vencendoObrigatorios} vencendo`}
                </p>
              </div>
              {percentualAderencia !== null && (
                <div className="text-right shrink-0">
                  <p className={`text-2xl font-extrabold font-mono ${
                    statusGeral === 'HABILITADO' ? 'text-positive-400' :
                    statusGeral === 'ATENÇÃO' ? 'text-warning-400' : 'text-negative-400'
                  }`}>
                    {percentualAderencia}%
                  </p>
                  <p className="text-[10px] text-base-500 uppercase tracking-wider">aderência</p>
                </div>
              )}
            </div>
          )}

          {/* Edital */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Edital</p>
            {edital ? (
              <div className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-xl px-4 py-3">
                <FileText className="w-5 h-5 text-accent-400 shrink-0" />
                <span className="flex-1 text-[13px] text-base-200 truncate">{edital.name}</span>
                <button onClick={handleAbrirEdital} disabled={abrindo === edital.id} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                  <Download className="w-3.5 h-3.5" />
                </button>
                {podeEditar && (
                  <button onClick={() => deleteEdital.mutate(edital)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : podeEditar ? (
              <label className="flex items-center gap-2 justify-center border border-dashed border-base-700 rounded-xl px-4 py-4 cursor-pointer hover:border-accent-500/40 hover:bg-base-850/40 transition text-base-400">
                {enviandoEdital ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-[12px] font-medium">{enviandoEdital ? 'Enviando...' : 'Enviar PDF do edital'}</span>
                <input type="file" accept=".pdf" className="hidden" disabled={enviandoEdital} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadEdital(f); e.target.value = '' }} />
              </label>
            ) : (
              <p className="text-[12px] text-base-500 italic py-2">Nenhum edital enviado ainda.</p>
            )}
          </div>

          {/* Ranking de Compatibilidade — compara o objeto da licitação com
              o objeto de cada atestado técnico cadastrado do cliente.
              Comparação por sobreposição de palavras-chave (sem IA) — uma
              aproximação inicial; fica mais precisa quando a análise por
              IA (Gemini) estiver configurada. */}
          {atestados.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" /> Ranking de Compatibilidade (Atestados Técnicos)
              </p>
              <div className="flex flex-col gap-1.5">
                {rankingAtestados.map(({ atestado, similaridade }) => (
                  <div key={atestado.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-base-200 truncate">{atestado.nome}</p>
                      <p className="text-[11px] text-base-500 truncate">{atestado.objeto}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[14px] font-extrabold font-mono ${
                        similaridade >= 60 ? 'text-positive-400' : similaridade >= 30 ? 'text-warning-400' : 'text-base-500'
                      }`}>
                        {similaridade}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-base-600 mt-1.5 italic">
                Comparação por palavras-chave em comum — uma aproximação. Confira sempre o texto completo antes de decidir.
              </p>
            </div>
          )}

          {/* Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
                Checklist da Licitação
                {totalObrigatorios > 0 && (
                  <span className="ml-2 text-base-400 normal-case font-normal">
                    {atendidosObrigatorios}/{totalObrigatorios} obrigatórios atendidos
                  </span>
                )}
              </p>
              {podeEditar && (
                <button onClick={() => setShowNovoItem((v) => !v)} className="flex items-center gap-1 text-[11px] text-accent-300 hover:text-accent-200 transition">
                  <Plus className="w-3 h-3" /> Adicionar item
                </button>
              )}
            </div>

            {edital && items.length === 0 && (
              <div className="bg-accent-500/10 border border-accent-500/25 rounded-lg p-3 mb-2 text-[12px] text-accent-300 flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>A análise automática do edital por IA ainda não está configurada — por enquanto, adicione os itens exigidos manualmente abaixo.</span>
              </div>
            )}

            {showNovoItem && (
              <div className="bg-base-850/60 border border-accent-500/20 rounded-xl p-3 flex flex-col gap-2 mb-2">
                <Input
                  placeholder="Ex: Balanço Patrimonial 2025, Atestado de Capacidade Técnica..."
                  value={novoItem.descricao}
                  onChange={(e) => setNovoItem({ ...novoItem, descricao: e.target.value })}
                />
                <div className="flex gap-2">
                  <Select value={novoItem.categoria} onChange={(e) => setNovoItem({ ...novoItem, categoria: e.target.value })} className="flex-1">
                    {CATEGORIAS_CHECKLIST.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                  <label className="flex items-center gap-1.5 text-[12px] text-base-400 shrink-0">
                    <input type="checkbox" checked={novoItem.obrigatorio} onChange={(e) => setNovoItem({ ...novoItem, obrigatorio: e.target.checked })} />
                    Obrigatório
                  </label>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Prazo</label>
                    <Input type="date" value={novoItem.prazo} onChange={(e) => setNovoItem({ ...novoItem, prazo: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] uppercase tracking-wider text-base-500 font-bold block mb-1">Responsável</label>
                    <Input placeholder="Nome de quem vai resolver" value={novoItem.responsavelNome} onChange={(e) => setNovoItem({ ...novoItem, responsavelNome: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setShowNovoItem(false)}>Cancelar</Button>
                  <Button onClick={handleAdicionarItem} disabled={!novoItem.descricao.trim() || addItem.isPending}>
                    {addItem.isPending ? 'Adicionando...' : 'Adicionar'}
                  </Button>
                </div>
              </div>
            )}

            {items.length === 0 ? (
              <p className="text-[12px] text-base-500 italic py-2">Nenhum item no checklist ainda.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {items.map((item) => {
                  const status = statusItem(item)
                  return (
                    <div key={item.id} className="flex items-center gap-3 bg-base-850/60 border border-base-800 rounded-lg px-3 py-2.5">
                      {status === 'atendido' && <CheckCircle2 className="w-4 h-4 text-positive-400 shrink-0" />}
                      {status === 'vencendo' && <AlertCircle className="w-4 h-4 text-warning-400 shrink-0" />}
                      {status === 'faltando' && (
                        podeEditar ? (
                          <button onClick={() => updateItem.mutate({ ...item, atendido: !item.atendido })} title="Marcar como atendido">
                            <Circle className="w-4 h-4 text-base-600 hover:text-base-400 shrink-0 transition" />
                          </button>
                        ) : (
                          <Circle className="w-4 h-4 text-base-700 shrink-0" />
                        )
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-base-200 truncate">{item.descricao}</p>
                        <p className="text-[10px] text-base-500">
                          {item.categoria}
                          {item.obrigatorio && <span className="text-warning-400 ml-1.5">· obrigatório</span>}
                          {item.clientDocumentTipo && status !== 'faltando' && (
                            <span className="ml-1.5 text-accent-400">· vinculado à {CERT_CONFIG[item.clientDocumentTipo]?.label.split(' — ')[0]}</span>
                          )}
                          {item.prazo && (
                            <span className="ml-1.5">· prazo {new Date(item.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                          )}
                          {item.responsavelNome && (
                            <span className="ml-1.5">· {item.responsavelNome}</span>
                          )}
                        </p>
                      </div>
                      {podeEditar && (
                        <button onClick={() => deleteItem.mutate(item)} className="p-1 text-base-500 hover:text-negative-400 transition shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <HistoricoVersoes biddingId={bidding.id} />
        </div>
      </div>
    </div>
  )
}
