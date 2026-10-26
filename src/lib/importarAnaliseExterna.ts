// "Importar análise externa" — plano B pra quando a IA do sistema
// (Analisar-edital / Analisar-oportunidade) falha: o usuário roda o edital
// no Claude/ChatGPT com PROMPT_ANALISE_EXTERNA, cola (ou envia em
// .docx/.txt) a resposta, e as funções abaixo transformam aquilo numa
// AnaliseEdital igual à que a function gravaria. Tudo puro, sem React —
// quem grava no banco é a mutation `importar` de useBiddingAnalysis /
// useOpportunityAnalysis.
//
// A resposta de um chat é bem menos previsível que a do Gemini com schema
// estruturado: vem com cerca ```json, texto antes/depois, aspas curvas,
// vírgula sobrando, números em formato BR, às vezes dividida em duas
// partes (quando a lista de itens não cabe). Por isso cada etapa aqui é
// tolerante e prefere gerar um AVISO a recusar a importação — o usuário
// confere o resultado antes de aplicar.
import JSZip from 'jszip'
import { CATEGORIAS_CHECKLIST, converterDataParaISO, encontrarModalidade, normalizarTexto } from './analiseEdital'
import { parseFlexibleNumber } from './numberParsing'
import type { AnaliseEdital } from '../types/domain'

// ---------------------------------------------------------------------------
// a) Leitura do arquivo enviado
// ---------------------------------------------------------------------------

function decodificarEntidadesXml(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // &amp; por último — senão "&amp;lt;" (um "&lt;" literal no texto) viraria "<".
    .replace(/&amp;/g, '&')
}

// .docx é só um zip com o texto em word/document.xml — basta o jszip (que
// já é dependência, usado na geração de declarações) pra tirar o texto sem
// formatação. Quebra de parágrafo vira \n pra o JSON continuar legível na
// textarea; o resto das tags some.
export async function extrairTextoDeArquivo(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'txt' || ext === 'json') return file.text()
  if (ext === 'docx') {
    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer())
    } catch {
      throw new Error('Não foi possível abrir este .docx — o arquivo parece corrompido. Tente salvar de novo ou copie e cole o texto.')
    }
    const xml = await zip.file('word/document.xml')?.async('string')
    if (!xml) throw new Error('Este .docx não tem o conteúdo de texto esperado. Copie e cole a resposta no campo de texto.')
    const texto = xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
    return decodificarEntidadesXml(texto)
  }
  throw new Error(`Formato .${ext || '?'} não suportado. Envie um arquivo .docx, .txt ou .json — ou copie e cole a resposta no campo de texto.`)
}

// ---------------------------------------------------------------------------
// b) Localizar os blocos JSON no meio do texto
// ---------------------------------------------------------------------------

// Aspas curvas aparecem quando a resposta passa por Word/Google Docs (ou o
// próprio chat "embeleza" o texto). Só usadas como segunda tentativa no
// parse (ver interpretarBloco): trocá-las sempre quebraria um JSON
// perfeito cujo CONTEÚDO cita algo entre aspas curvas (ex: “Do Objeto”).
function normalizarAspas(texto: string): string {
  return texto.replace(/[“”„‟]/g, '"').replace(/[‘’‚‛]/g, "'")
}

// Varre o texto contando chaves, respeitando strings e escapes — assim
// pega o JSON esteja ele numa cerca ```json, solto, ou com explicação
// antes/depois. Fora de um bloco, aspas não abrem string (é prosa).
function varrerBlocos(texto: string): { blocos: string[]; incompleto: boolean } {
  const blocos: string[] = []
  let profundidade = 0
  let inicio = -1
  let emString = false
  let escapado = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (profundidade === 0) {
      if (c === '{') { inicio = i; profundidade = 1 }
      continue
    }
    if (emString) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') emString = false
      continue
    }
    if (c === '"') emString = true
    else if (c === '{') profundidade++
    else if (c === '}') {
      profundidade--
      if (profundidade === 0) blocos.push(texto.slice(inicio, i + 1))
    }
  }
  return { blocos, incompleto: profundidade > 0 }
}

export function extrairBlocosJson(texto: string): { blocos: string[]; incompleto: boolean } {
  const bruto = varrerBlocos(texto)
  // Se a estrutura toda veio com aspas curvas, a varredura acima não
  // reconhece as strings — chaves dentro do conteúdo atrapalhariam a
  // contagem. Refaz com as aspas normalizadas e fica com o que achar mais.
  const normalizado = varrerBlocos(normalizarAspas(texto))
  return normalizado.blocos.length > bruto.blocos.length ? normalizado : bruto
}

// ---------------------------------------------------------------------------
// c) Parse tolerante, bloco a bloco
// ---------------------------------------------------------------------------

// Remove a vírgula sobrando antes de } ou ] (erro clássico de JSON escrito
// à mão/por chat) — fora de strings, pra nunca mexer no conteúdo.
function removerVirgulasSobrando(json: string): string {
  let saida = ''
  let emString = false
  let escapado = false
  for (let i = 0; i < json.length; i++) {
    const c = json[i]
    if (emString) {
      saida += c
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') emString = false
      continue
    }
    if (c === '"') { emString = true; saida += c; continue }
    if (c === ',') {
      let j = i + 1
      while (j < json.length && /\s/.test(json[j])) j++
      if (json[j] === '}' || json[j] === ']') continue
    }
    saida += c
  }
  return saida
}

function interpretarBloco(bloco: string): Record<string, unknown> | null {
  for (const candidato of [bloco, normalizarAspas(bloco)]) {
    try {
      const valor = JSON.parse(removerVirgulasSobrando(candidato))
      if (valor && typeof valor === 'object' && !Array.isArray(valor)) return valor as Record<string, unknown>
    } catch {
      // tenta a próxima variação
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// d) Mesclar as partes (resposta dividida por "CONTINUA NO ITEM N")
// ---------------------------------------------------------------------------

const vazio = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '')

// Arrays (itens, checklist) são concatenados na ordem — a 2ª parte traz só
// a continuação. Escalares/objetos: o bloco mais novo só vence quando tem
// valor de verdade; um null/"" de uma parte de continuação nunca apaga o
// que a 1ª parte já trouxe.
function mesclar(base: Record<string, unknown>, novo: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = { ...base }
  for (const [chave, valor] of Object.entries(novo)) {
    const atual = saida[chave]
    if (Array.isArray(valor)) {
      saida[chave] = Array.isArray(atual) ? [...atual, ...valor] : valor
    } else if (valor && typeof valor === 'object') {
      saida[chave] = atual && typeof atual === 'object' && !Array.isArray(atual)
        ? mesclar(atual as Record<string, unknown>, valor as Record<string, unknown>)
        : valor
    } else if (!vazio(valor)) {
      saida[chave] = valor
    }
  }
  return saida
}

// ---------------------------------------------------------------------------
// e) Normalizar pro formato AnaliseEdital
// ---------------------------------------------------------------------------

function texto(v: unknown): string | undefined {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t : undefined
}

// "1.500" num edital brasileiro é mil e quinhentos, não 1,5 —
// parseFlexibleNumber deixa esse caso ambíguo de propósito (planilhas
// podem vir em formato internacional), mas aqui o prompt e o documento
// são sempre em português, então ponto seguido de grupos de 3 dígitos é
// milhar.
function numero(v: unknown): number | undefined {
  if (typeof v === 'string') {
    const limpo = v.replace(/R\$\s*/i, '').trim()
    if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) return Number(limpo.replace(/\./g, ''))
  }
  return parseFlexibleNumber(v) ?? undefined
}

function booleano(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  const t = typeof v === 'string' ? normalizarTexto(v) : ''
  if (['true', 'sim', 's', 'yes'].includes(t)) return true
  if (['false', 'nao', 'n', 'no'].includes(t)) return false
  return undefined
}

const chaveComparacao = (t: string) => normalizarTexto(t).replace(/[^a-z0-9]/g, '')

// Casa sem acento/caixa/pontuação ("qualificacao economico financeira" →
// "Qualificação Econômico-Financeira"); se não casar com nenhuma, "Outro" —
// nunca grava uma categoria fora das opções do formulário do checklist.
function categoriaChecklist(v: unknown): string {
  const t = texto(v)
  if (!t) return 'Outro'
  const alvo = chaveComparacao(t)
  return CATEGORIAS_CHECKLIST.find((c) => chaveComparacao(c) === alvo)
    ?? CATEGORIAS_CHECKLIST.find((c) => c !== 'Outro' && (alvo.includes(chaveComparacao(c)) || chaveComparacao(c).includes(alvo)))
    ?? 'Outro'
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
}

// Monta o objeto só com as chaves que tiverem valor — o resto fica
// ausente (undefined), igual a uma análise da function que não achou o campo.
function semVazios<T extends object>(o: T): T | undefined {
  const limpo = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  return Object.keys(limpo).length ? limpo : undefined
}

export function normalizar(raw: Record<string, unknown>): AnaliseEdital {
  const md = objeto(raw.modoDisputa)
  const hab = objeto(raw.habilitacao)

  const itens = Array.isArray(raw.itens)
    ? raw.itens.map(objeto).filter((it) => Object.keys(it).length > 0).map((it) => semVazios({
        numero: texto(it.numero),
        lote: texto(it.lote),
        // descricao é obrigatória no tipo — fica '' (e vira aviso em validar)
        // em vez de descartar o item, pra não sumir uma linha em silêncio.
        descricao: texto(it.descricao) ?? '',
        unidade: texto(it.unidade),
        quantidade: numero(it.quantidade),
        valorReferencia: numero(it.valorReferencia),
      })!)
    : undefined

  const checklist = Array.isArray(raw.checklistDocumentacao)
    ? raw.checklistDocumentacao.map(objeto)
        .filter((d) => texto(d.descricao))
        .map((d) => ({
          descricao: texto(d.descricao)!,
          categoria: categoriaChecklist(d.categoria),
          // Ausente = obrigatório: o prompt só manda marcar false quando o
          // próprio edital diz que é facultativo.
          obrigatorio: booleano(d.obrigatorio) ?? true,
        }))
    : undefined

  const marcas = Array.isArray(raw.marcasPreAprovadas)
    ? raw.marcasPreAprovadas.map(texto).filter((m): m is string => !!m)
    : texto(raw.marcasPreAprovadas)

  // Só as chaves de AnaliseEdital/ANALISE_SCHEMA — qualquer coisa extra que
  // o chat tenha inventado fica de fora. "participando" dos itens também
  // não é copiado de propósito: continua opt-out, como numa análise nova.
  const analise: AnaliseEdital = {
    municipio: texto(raw.municipio),
    orgao: texto(raw.orgao),
    objeto: texto(raw.objeto),
    numeroEdital: texto(raw.numeroEdital),
    numeroProcesso: texto(raw.numeroProcesso),
    modalidade: texto(raw.modalidade),
    srp: booleano(raw.srp),
    data: texto(raw.data),
    horario: texto(raw.horario),
    portal: texto(raw.portal),
    intervaloLances: texto(raw.intervaloLances),
    modoDisputa: semVazios({
      tipo: texto(md.tipo),
      duracaoFaseAberta: texto(md.duracaoFaseAberta),
      duracaoFaseFechada: texto(md.duracaoFaseFechada),
      prorrogacaoAutomatica: texto(md.prorrogacaoAutomatica),
      tempoAleatorio: texto(md.tempoAleatorio),
      criterioEncerramento: texto(md.criterioEncerramento),
      observacoes: texto(md.observacoes),
    }),
    resumoTecnico: texto(raw.resumoTecnico),
    valorTotalEstimado: numero(raw.valorTotalEstimado),
    itens: itens?.length ? itens : undefined,
    validadeProposta: texto(raw.validadeProposta),
    catalogo: texto(raw.catalogo),
    garantias: texto(raw.garantias),
    amostras: texto(raw.amostras),
    marcasPreAprovadas: Array.isArray(marcas) ? (marcas.length ? marcas : undefined) : marcas,
    habilitacao: semVazios({
      habilitacaoJuridica: texto(hab.habilitacaoJuridica),
      regularidadeFiscalTrabalhista: texto(hab.regularidadeFiscalTrabalhista),
      qualificacaoEconomicoFinanceira: texto(hab.qualificacaoEconomicoFinanceira),
      qualificacaoTecnica: texto(hab.qualificacaoTecnica),
      proposta: texto(hab.proposta),
    }),
    prazos: texto(raw.prazos),
    formaEntrega: texto(raw.formaEntrega),
    localEntrega: texto(raw.localEntrega),
    condicoesPagamento: texto(raw.condicoesPagamento),
    clausulasRestritivas: texto(raw.clausulasRestritivas),
    conclusaoTecnica: texto(raw.conclusaoTecnica),
    checklistDocumentacao: checklist?.length ? checklist : undefined,
    importadaDe: 'externa',
    importadaEm: new Date().toISOString(),
  }
  return semVazios(analise) ?? analise
}

// ---------------------------------------------------------------------------
// f) Avisos (não bloqueiam a importação — o usuário confere e decide)
// ---------------------------------------------------------------------------

const formatarMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function validar(analise: AnaliseEdital, opcoes: { incompleto?: boolean } = {}): string[] {
  const avisos: string[] = []
  if (opcoes.incompleto) {
    avisos.push('O último trecho da resposta parece cortado (o JSON não fecha) e foi ignorado. Se faltaram itens, peça à IA "continue de onde parou, só com o JSON restante" e cole a continuação junto.')
  }
  if (analise.data && !converterDataParaISO(analise.data)) {
    avisos.push(`A data "${analise.data}" não está no formato DD/MM/AAAA — ela não vai preencher a Data de Abertura.`)
  }
  if (analise.modalidade && !encontrarModalidade(analise.modalidade)) {
    avisos.push(`A modalidade "${analise.modalidade}" não corresponde a nenhuma opção do sistema — ela não vai preencher o campo Modalidade.`)
  }
  const itens = analise.itens ?? []
  if (!itens.length) {
    avisos.push('Nenhum item foi encontrado na resposta.')
  } else {
    const semDescricao = itens.filter((it) => !it.descricao).length
    if (semDescricao) avisos.push(`${semDescricao} item(ns) sem descrição.`)
    if (analise.valorTotalEstimado != null) {
      const soma = itens.reduce((s, it) => s + (it.quantidade ?? 0) * (it.valorReferencia ?? 0), 0)
      if (soma > 0 && Math.abs(soma - analise.valorTotalEstimado) > 1) {
        avisos.push(`A soma dos itens (${formatarMoeda(soma)}) é diferente do valor total estimado (${formatarMoeda(analise.valorTotalEstimado)}). Pode ser normal, mas confira.`)
      }
    }
  }
  return avisos
}

// ---------------------------------------------------------------------------
// Ponto de entrada usado pelo modal
// ---------------------------------------------------------------------------

export class ErroImportacaoAnalise extends Error {}

export function lerAnaliseExterna(textoResposta: string): { analise: AnaliseEdital; avisos: string[] } {
  const { blocos, incompleto } = extrairBlocosJson(textoResposta)
  const avisos: string[] = []
  let mesclado: Record<string, unknown> | null = null
  for (const [i, bloco] of blocos.entries()) {
    const obj = interpretarBloco(bloco)
    if (!obj) {
      avisos.push(`A parte ${i + 1} da resposta não é um JSON válido e foi ignorada.`)
      continue
    }
    mesclado = mesclado ? mesclar(mesclado, obj) : obj
  }

  if (!mesclado) {
    throw new ErroImportacaoAnalise(incompleto
      ? 'A resposta parece ter sido cortada no meio (o JSON não fecha). Peça à IA: "continue de onde parou, só com o JSON restante" e cole aqui as duas partes juntas.'
      : 'Não encontramos um JSON válido na resposta. Peça à IA: "refaça o JSON, válido, sem comentários" e cole a nova resposta aqui.')
  }

  const analise = normalizar(mesclado)
  avisos.push(...validar(analise, { incompleto }))
  const continua = textoResposta.match(/CONTINUA NO ITEM\s*(\S+)/i)
  if (continua && blocos.length === 1) {
    avisos.push(`A resposta avisa "CONTINUA NO ITEM ${continua[1]}" — responda "continue" à IA e cole a continuação aqui, junto com esta parte.`)
  }
  return { analise, avisos }
}
