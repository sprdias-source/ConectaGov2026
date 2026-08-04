import { formatBRL } from '../../hooks/useAccountBalances'
import type { AnaliseEdital } from '../../types/domain'

// Formato esperado do JSON retornado pela function analisar-edital (e pela
// sua irmã Analisar-oportunidade, mesmo schema) — tabela/function já
// existem no banco, criadas por fora deste repo. Os nomes de campo abaixo
// são os combinados na especificação da tarefa; se a function usar chaves
// diferentes, as seções correspondentes simplesmente não aparecem (nada
// quebra), já que cada uma só renderiza quando o campo existe.
const CAMPOS_MODO_DISPUTA: { chave: keyof NonNullable<AnaliseEdital['modoDisputa']>; label: string }[] = [
  { chave: 'tipo', label: 'Tipo' },
  { chave: 'duracaoFaseAberta', label: 'Duração — Fase Aberta' },
  { chave: 'duracaoFaseFechada', label: 'Duração — Fase Fechada' },
  { chave: 'prorrogacaoAutomatica', label: 'Prorrogação Automática' },
  { chave: 'tempoAleatorio', label: 'Tempo Aleatório' },
  { chave: 'criterioEncerramento', label: 'Critério de Encerramento' },
  { chave: 'observacoes', label: 'Observações' },
]

const CAMPOS_HABILITACAO: { chave: keyof NonNullable<AnaliseEdital['habilitacao']>; label: string }[] = [
  { chave: 'habilitacaoJuridica', label: 'Habilitação Jurídica' },
  { chave: 'regularidadeFiscalTrabalhista', label: 'Regularidade Fiscal e Trabalhista' },
  { chave: 'qualificacaoEconomicoFinanceira', label: 'Qualificação Econômico-Financeira' },
  { chave: 'qualificacaoTecnica', label: 'Qualificação Técnica' },
  { chave: 'proposta', label: 'Proposta' },
]

export function CampoResumo({ label, valor }: { label: string; valor?: string | null }) {
  if (!valor) return null
  return (
    <div className="bg-base-850/60 border border-base-800 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-0.5">{label}</p>
      <p className="text-[12px] text-base-200">{valor}</p>
    </div>
  )
}

export function SecaoTexto({ label, texto }: { label: string; texto?: string | null }) {
  if (!texto) return null
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-1.5">{label}</p>
      <p className="text-[12px] text-base-300 whitespace-pre-line">{texto}</p>
    </div>
  )
}

// Exibição completa dos dados extraídos pela IA a partir do edital — mesma
// exata visualização usada no Kanban (LicitacaoPage) e na fase de
// Oportunidade (OportunidadesPanel), já que as duas rodam a mesma análise
// (Analisar-edital / Analisar-oportunidade) sobre o mesmo schema.
//
// onToggleItem/onToggleTodos são opcionais de propósito: só quem pode
// editar (e só depois que a análise já rodou) passa essas props — sem elas,
// a tabela de itens fica só leitura, sem a coluna de checkbox.
export function AnaliseEditalResumo({ analise, onToggleItem, onToggleTodos }: {
  analise: AnaliseEdital
  onToggleItem?: (index: number) => void
  onToggleTodos?: (participando: boolean) => void
}) {
  const localOuFormaEntrega = [analise.formaEntrega, analise.localEntrega].filter(Boolean).join(' — ')
  const marcasTexto = Array.isArray(analise.marcasPreAprovadas) ? analise.marcasPreAprovadas.join(', ') : analise.marcasPreAprovadas
  const totalItens = analise.itens?.length ?? 0
  const itensSelecionados = analise.itens?.filter((it) => it.participando !== false).length ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <CampoResumo label="Município / Órgão" valor={[analise.municipio, analise.orgao].filter(Boolean).join(' — ')} />
        <CampoResumo label="Nº Edital / Processo" valor={[analise.numeroEdital, analise.numeroProcesso].filter(Boolean).join(' — ')} />
        <CampoResumo label="Objeto" valor={analise.objeto} />
        <CampoResumo label="Modalidade / SRP" valor={[analise.modalidade, analise.srp ? 'SRP' : null].filter(Boolean).join(' — ')} />
        <CampoResumo label="Data / Horário / Portal" valor={[analise.data, analise.horario, analise.portal].filter(Boolean).join(' — ')} />
        <CampoResumo label="Intervalo Mínimo entre Lances" valor={analise.intervaloLances} />
        <CampoResumo label="Validade da Proposta" valor={analise.validadeProposta} />
        <CampoResumo label="Catálogo" valor={analise.catalogo} />
        <CampoResumo label="Forma / Local de Entrega" valor={localOuFormaEntrega} />
      </div>

      {analise.modoDisputa && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Modo de Disputa</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CAMPOS_MODO_DISPUTA.map(({ chave, label }) => (
              <CampoResumo key={chave} label={label} valor={analise.modoDisputa?.[chave]} />
            ))}
          </div>
        </div>
      )}

      <SecaoTexto label="Resumo Técnico" texto={analise.resumoTecnico} />

      {!!analise.itens?.length && (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold">
              Itens Identificados
              {onToggleItem && (
                <span className="normal-case font-normal text-base-400"> — {itensSelecionados} de {totalItens} selecionados pra participar</span>
              )}
            </p>
            {onToggleTodos && (
              <div className="flex items-center gap-2 text-[11px]">
                <button type="button" onClick={() => onToggleTodos(true)} className="text-accent-300 hover:text-accent-200">Marcar todos</button>
                <span className="text-base-700">·</span>
                <button type="button" onClick={() => onToggleTodos(false)} className="text-accent-300 hover:text-accent-200">Desmarcar todos</button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto bg-base-850/60 border border-base-800 rounded-xl">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-base-500 border-b border-base-800">
                  {onToggleItem && <th className="text-left font-semibold px-3 py-2 w-8">Part.</th>}
                  <th className="text-left font-semibold px-3 py-2">Item</th>
                  <th className="text-left font-semibold px-3 py-2">Descrição</th>
                  <th className="text-right font-semibold px-3 py-2">Qtd.</th>
                  <th className="text-right font-semibold px-3 py-2">Vl. Referência</th>
                </tr>
              </thead>
              <tbody>
                {analise.itens.map((it, idx) => {
                  const participando = it.participando !== false
                  return (
                    <tr key={idx} className={`border-t border-base-800/60 ${!participando ? 'opacity-50' : ''}`}>
                      {onToggleItem && (
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={participando}
                            onChange={() => onToggleItem(idx)}
                            className="accent-accent-500 cursor-pointer"
                            title={participando ? 'Vamos participar deste item' : 'Não vamos participar deste item'}
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 text-base-300">{it.numero ?? idx + 1}</td>
                      <td className={`px-3 py-2 text-base-300 ${!participando ? 'line-through' : ''}`}>{it.descricao}</td>
                      <td className="px-3 py-2 text-right text-base-400">{it.quantidade ?? '—'}{it.unidade ? ` ${it.unidade}` : ''}</td>
                      <td className="px-3 py-2 text-right font-mono text-base-400">{it.valorReferencia != null ? formatBRL(Number(it.valorReferencia)) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SecaoTexto label="Garantias" texto={analise.garantias} />
      <SecaoTexto label="Amostras" texto={analise.amostras} />
      <SecaoTexto label="Marcas Pré-Aprovadas" texto={marcasTexto} />

      {analise.habilitacao && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-base-500 font-bold mb-2">Habilitação</p>
          <div className="flex flex-col gap-2">
            {CAMPOS_HABILITACAO.map(({ chave, label }) => {
              const texto = analise.habilitacao?.[chave]
              if (!texto) return null
              return (
                <div key={chave} className="bg-base-850/60 border border-base-800 rounded-lg px-3 py-2">
                  <p className="text-[10px] font-bold text-accent-400 uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-[12px] text-base-300">{texto}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <SecaoTexto label="Prazos" texto={analise.prazos} />
      <SecaoTexto label="Condições de Pagamento" texto={analise.condicoesPagamento} />
      <SecaoTexto label="Cláusulas Restritivas" texto={analise.clausulasRestritivas} />
      <SecaoTexto label="Conclusão Técnica" texto={analise.conclusaoTecnica} />

      {(analise.checklistDocumentacao?.length ?? 0) > 0 && (
        <p className="text-[11px] text-base-500 italic">
          {analise.checklistDocumentacao!.length} documento(s) sugerido(s) pela análise pra habilitação.
        </p>
      )}
    </div>
  )
}
