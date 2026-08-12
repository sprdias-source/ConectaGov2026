// Transformações compartilhadas entre o resultado da análise de edital por
// IA (AnaliseEdital, ver types/domain.ts — mesmo formato pra Analisar-edital
// e Analisar-oportunidade) e os campos/itens de uma Bidding. Usado tanto na
// tela da Licitação (botão "Preencher Licitação com estes Dados", auto-
// import de itens) quanto na conversão de uma Oportunidade em Licitação.
import type { AnaliseEdital, Bidding, BiddingItem, BiddingModalidade } from '../types/domain'

export const MODALIDADES_VALIDAS: BiddingModalidade[] = [
  'Pregão Eletrônico', 'Pregão Presencial', 'Concorrência Pública', 'Tomada de Preços',
  'Convite', 'Leilão', 'Diálogo Competitivo', 'Dispensa de Licitação', 'Inexigibilidade',
]

const normalizarTexto = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

// A IA devolve a modalidade como texto livre — só aceitamos se bater com uma
// das opções válidas do formulário, pra nunca gravar um valor fora do enum.
export function encontrarModalidade(texto?: string): BiddingModalidade | null {
  if (!texto) return null
  const alvo = normalizarTexto(texto)
  return MODALIDADES_VALIDAS.find((m) => alvo.includes(normalizarTexto(m))) ?? null
}

// Idem para a data: a IA pode devolver "15/03/2026" ou já em ISO — qualquer
// outro formato (ex: "15 de março") é ignorado em vez de gravar algo errado.
export function converterDataParaISO(texto?: string): string | null {
  if (!texto) return null
  const iso = texto.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  return null
}

// Mesma transformação usada pelo botão manual "Preencher Licitação com estes
// Dados", pelo auto-import de itens, e pela conversão de Oportunidade em
// Licitação — só os itens, sem mexer em nenhum outro campo.
//
// Filtra pelos itens marcados como "participando" (ver AnaliseEdital.itens
// em types/domain.ts) — o edital às vezes traz itens/lotes que a empresa não
// vai disputar, e esse é o único lugar por onde os três fluxos acima passam,
// então filtrar aqui garante que Cadastrar Proposta/Proposta Readequada
// nunca vejam um item que o usuário já desmarcou na análise.
export function mapearItensDaAnalise(analise: AnaliseEdital): Partial<BiddingItem>[] | null {
  if (!analise.itens?.length) return null
  const selecionados = analise.itens
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => it.participando !== false)
  if (!selecionados.length) return null
  return selecionados.map(({ it, idx }) => ({
    numeroItem: it.numero != null ? String(it.numero) : String(idx + 1),
    lote: it.lote != null ? String(it.lote) : null,
    descricao: it.descricao,
    unidade: it.unidade ?? null,
    quantidade: it.quantidade ?? 1,
    marca: null,
    referencia: null,
    valorUnitarioLicitado: it.valorReferencia ?? 0,
    valorUnitarioOfertado: null,
  }))
}

// Soma o valor total dos itens (quantidade × valor unitário licitado) — usado
// pra preencher automaticamente "Valor que Vamos Participar" a partir dos
// itens selecionados na análise. Nunca usado pra "Valor Total do Edital":
// esse vem direto de AnaliseEdital.valorTotalEstimado, tal como declarado no
// próprio documento, porque a soma dos itens pode se perder (itens não
// selecionados, lotes, etc).
export function somarValorLicitado(itens: Partial<BiddingItem>[]): number {
  return itens.reduce((s, i) => s + (i.quantidade ?? 0) * (i.valorUnitarioLicitado ?? 0), 0)
}

// Só os campos que a análise conseguiu identificar (nunca sobrescreve com
// vazio) — quem decide o que fazer com campos ausentes (manter o que já
// tinha, ou deixar em branco por ser uma licitação nova) é quem chama.
export function mapearCamposDaAnalise(analise: AnaliseEdital): Partial<Bidding> {
  const campos: Partial<Bidding> = {}
  if (analise.municipio) campos.municipio = analise.municipio
  if (analise.orgao) campos.orgao = analise.orgao
  if (analise.objeto) campos.objeto = analise.objeto
  if (analise.numeroEdital) campos.numeroEdital = analise.numeroEdital
  if (analise.numeroProcesso) campos.processo = analise.numeroProcesso
  if (analise.portal) campos.portal = analise.portal
  const modalidade = encontrarModalidade(analise.modalidade)
  if (modalidade) campos.modalidade = modalidade
  const dataISO = converterDataParaISO(analise.data)
  if (dataISO) campos.dataAbertura = dataISO
  if (analise.validadeProposta) campos.diasValidadeProposta = analise.validadeProposta
  if (analise.valorTotalEstimado != null) campos.valorLicitado = analise.valorTotalEstimado
  return campos
}
