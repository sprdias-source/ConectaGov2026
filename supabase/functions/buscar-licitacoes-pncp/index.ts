import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PNCP_BASE = 'https://pncp.gov.br/api/consulta/v1'
const TAMANHO_PAGINA = 50
const LIMITE_TEMPO_MS = 120_000 // margem de segurança abaixo do timeout de 150s da Edge Function
const LOTE_ITENS_PARALELOS = 15 // quantas chamadas de "itens" rodam ao mesmo tempo

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function formatarData(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '')
}

interface ContratacaoPNCP {
  numeroControlePNCP: string
  orgaoEntidade?: { cnpj?: string; razaoSocial?: string; poderId?: string; esferaId?: string }
  unidadeOrgao?: { ufSigla?: string; municipioNome?: string; codigoIbge?: string }
  modalidadeNome?: string
  objetoCompra?: string
  informacaoComplementar?: string | null
  processo?: string | null
  valorTotalEstimado?: number
  valorTotalHomologado?: number | null
  dataPublicacaoPncp?: string
  dataEncerramentoProposta?: string
  linkSistemaOrigem?: string
}

type StatusFiltro = 'a_receber' | 'em_julgamento' | 'encerradas' | 'todos'

function bateComEsferaPoder(contratacao: ContratacaoPNCP, esferas?: string[], poderes?: string[]): boolean {
  if (esferas?.length && !esferas.includes(contratacao.orgaoEntidade?.esferaId ?? '')) return false
  if (poderes?.length && !poderes.includes(contratacao.orgaoEntidade?.poderId ?? '')) return false
  return true
}

function bateComStatus(contratacao: ContratacaoPNCP, status: StatusFiltro): boolean {
  if (status === 'todos') return true
  const agora = new Date()
  const prazoEncerrado = contratacao.dataEncerramentoProposta
    ? new Date(contratacao.dataEncerramentoProposta) < agora
    : false
  const temResultado = contratacao.valorTotalHomologado != null
  if (status === 'a_receber') return !prazoEncerrado
  if (status === 'em_julgamento') return prazoEncerrado && !temResultado
  if (status === 'encerradas') return temResultado
  return true
}

interface FiltroBusca {
  uf?: string
  codigoMunicipioIbge?: string
  codigoModalidade?: number
}

// -----------------------------------------------------------------------------
// Busca UMA página de contratações. Retorna também o total de páginas, pra
// quem chama decidir se continua ou não (permite controlar tempo/orçamento).
// -----------------------------------------------------------------------------
async function buscarPaginaContratacoes(
  tipoBusca: 'publicacao' | 'aberta',
  dataInicial: string,
  dataFinal: string,
  filtro: FiltroBusca,
  pagina: number
): Promise<{ dados: ContratacaoPNCP[]; totalPaginas: number }> {
  const caminho = tipoBusca === 'aberta' ? 'contratacoes/proposta' : 'contratacoes/publicacao'
  const params = new URLSearchParams({ tamanhoPagina: String(TAMANHO_PAGINA), pagina: String(pagina) })

  if (tipoBusca === 'publicacao') {
    params.set('dataInicial', dataInicial)
    params.set('dataFinal', dataFinal)
  } else {
    params.set('dataFinal', dataFinal)
  }
  if (filtro.uf) params.set('uf', filtro.uf)
  if (filtro.codigoMunicipioIbge) params.set('codigoMunicipioIbge', filtro.codigoMunicipioIbge)
  if (filtro.codigoModalidade) params.set('codigoModalidadeContratacao', String(filtro.codigoModalidade))

  const url = `${PNCP_BASE}/${caminho}?${params.toString()}`
  const res = await fetch(url, { headers: { accept: '*/*' } })

  if (!res.ok) {
    console.warn(`PNCP retornou ${res.status} em ${url}`)
    return { dados: [], totalPaginas: 0 }
  }

  const json = await res.json()
  return { dados: json?.data ?? [], totalPaginas: json?.totalPaginas ?? 1 }
}

async function buscarItensContratacao(cnpj: string, ano: number, sequencial: number): Promise<{ descricao: string }[]> {
  try {
    const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens`
    const res = await fetch(url, { headers: { accept: '*/*' } })
    if (!res.ok) return []
    const itens = await res.json()
    if (!Array.isArray(itens)) return []
    return (itens as { descricao?: string }[]).map((item) => ({ descricao: item.descricao ?? '' }))
  } catch {
    return []
  }
}

function parseNumeroControle(numeroControle: string): { cnpj: string; ano: number; sequencial: number } | null {
  const match = numeroControle.match(/^(\d{14})-\d+-(\d+)\/(\d{4})$/)
  if (!match) return null
  return { cnpj: match[1], sequencial: parseInt(match[2], 10), ano: parseInt(match[3], 10) }
}

// -----------------------------------------------------------------------------
// Processa um lote de contratações em paralelo: checa palavra-chave no texto
// amplo (rápido) e, se ainda não bateu e houver tempo, busca os itens em
// paralelo (até LOTE_ITENS_PARALELOS por vez) para checar lá também.
// -----------------------------------------------------------------------------
async function processarLote(
  contratacoes: ContratacaoPNCP[],
  palavrasNormalizadas: string[],
  palavrasOriginais: string[],
  temPalavrasChave: boolean,
  inicioExecucao: number
): Promise<
  Array<{
    contratacao: ContratacaoPNCP
    palavra: string
    encontradoEm: 'objeto' | 'item'
    itemDescricao: string | null
  }>
> {
  const encontrados: Array<{
    contratacao: ContratacaoPNCP
    palavra: string
    encontradoEm: 'objeto' | 'item'
    itemDescricao: string | null
  }> = []

  const pendentesParaChecarItens: ContratacaoPNCP[] = []

  for (const contratacao of contratacoes) {
    if (!temPalavrasChave) {
      encontrados.push({ contratacao, palavra: '', encontradoEm: 'objeto', itemDescricao: null })
      continue
    }

    const textoAmplo = [contratacao.objetoCompra, contratacao.informacaoComplementar, contratacao.processo]
      .filter(Boolean)
      .join(' ')
    const textoAmploNormalizado = normalizar(textoAmplo)
    const palavraNoObjeto = palavrasNormalizadas.find((p) => textoAmploNormalizado.includes(p))

    if (palavraNoObjeto) {
      const palavraOriginal = palavrasOriginais[palavrasNormalizadas.indexOf(palavraNoObjeto)]
      encontrados.push({ contratacao, palavra: palavraOriginal, encontradoEm: 'objeto', itemDescricao: null })
    }
    // Mesmo já tendo batido no objeto, ainda vale checar os itens: pode haver
    // OUTRA palavra-chave (de uma lista com várias) que só aparece lá.
    pendentesParaChecarItens.push(contratacao)
  }

  if (!temPalavrasChave) return encontrados

  // Processa a checagem de itens em lotes paralelos, respeitando o orçamento
  // de tempo da execução inteira.
  for (let i = 0; i < pendentesParaChecarItens.length; i += LOTE_ITENS_PARALELOS) {
    if (Date.now() - inicioExecucao > LIMITE_TEMPO_MS) {
      console.warn('Tempo esgotado durante checagem de itens — resultados parciais.')
      break
    }

    const lote = pendentesParaChecarItens.slice(i, i + LOTE_ITENS_PARALELOS)
    const resultadosLote = await Promise.all(
      lote.map(async (contratacao) => {
        const partes = parseNumeroControle(contratacao.numeroControlePNCP)
        if (!partes) return []
        const itens = await buscarItensContratacao(partes.cnpj, partes.ano, partes.sequencial)
        const achados: typeof encontrados = []
        for (const item of itens) {
          const itemNormalizado = normalizar(item.descricao)
          const palavraNoItem = palavrasNormalizadas.find((p) => itemNormalizado.includes(p))
          if (palavraNoItem) {
            const palavraOriginal = palavrasOriginais[palavrasNormalizadas.indexOf(palavraNoItem)]
            achados.push({
              contratacao,
              palavra: palavraOriginal,
              encontradoEm: 'item',
              itemDescricao: item.descricao,
            })
          }
        }
        return achados
      })
    )
    encontrados.push(...resultadosLote.flat())
  }

  return encontrados
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const inicioExecucao = Date.now()

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let configIds: string[] | null = null
    try {
      const body = await req.json()
      if (body?.configId) configIds = [body.configId]
    } catch {
      // sem corpo — roda tudo que estiver ativo (chamada agendada)
    }

    let query = supabaseAdmin.from('busca_pncp_config').select('*').eq('ativo', true)
    if (configIds) query = query.in('id', configIds)
    const { data: configs, error: configError } = await query

    if (configError) throw new Error(`Erro ao buscar configurações: ${configError.message}`)
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ success: true, mensagem: 'Nenhuma busca ativa encontrada.' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const resumoPorConfig: Record<string, { encontrados: number; truncado: boolean; paginasVarridas: number; totalPaginas: number }> = {}

    for (const config of configs) {
      const status: StatusFiltro = config.status ?? 'todos'
      const tipoBusca: 'publicacao' | 'aberta' = status === 'a_receber' ? 'aberta' : 'publicacao'

      const hoje = new Date()
      const inicio = new Date(hoje)
      inicio.setDate(inicio.getDate() - (config.dias_retroativos ?? 1))
      const dataInicial = formatarData(inicio)
      const dataFinal = formatarData(hoje)

      const temPalavrasChave = Array.isArray(config.palavras_chave) && config.palavras_chave.length > 0
      const palavrasOriginais = temPalavrasChave ? (config.palavras_chave as string[]) : []
      const palavrasNormalizadas = palavrasOriginais.map(normalizar)

      const ufsAlvo: (string | undefined)[] = config.ufs?.length ? config.ufs : [undefined]
      const municipiosAlvo: (string | undefined)[] = config.codigos_municipio_ibge?.length
        ? config.codigos_municipio_ibge
        : [undefined]
      const modalidadesAlvo: (number | undefined)[] = config.codigos_modalidade?.length
        ? config.codigos_modalidade
        : [undefined]

      let encontrados = 0
      let truncado = false
      let paginasVarridas = 0
      let totalPaginasVistas = 0

      for (const uf of ufsAlvo) {
        for (const municipio of municipiosAlvo) {
          for (const modalidade of modalidadesAlvo) {
            let pagina = 1
            let totalPaginas = 1

            do {
              if (Date.now() - inicioExecucao > LIMITE_TEMPO_MS) {
                truncado = true
                break
              }

              const { dados, totalPaginas: tp } = await buscarPaginaContratacoes(
                tipoBusca, dataInicial, dataFinal,
                { uf, codigoMunicipioIbge: municipio, codigoModalidade: modalidade },
                pagina
              )
              totalPaginas = tp
              totalPaginasVistas = Math.max(totalPaginasVistas, totalPaginas)
              paginasVarridas++

              const filtradas = dados
                .filter((c) => bateComStatus(c, status))
                .filter((c) => bateComEsferaPoder(c, config.esferas, config.poderes))

              const achados = await processarLote(
                filtradas, palavrasNormalizadas, palavrasOriginais, temPalavrasChave, inicioExecucao
              )

              for (const achado of achados) {
                const c = achado.contratacao
                const { error: upsertError } = await supabaseAdmin.from('licitacoes_pncp').upsert({
                  user_id: config.user_id,
                  busca_config_id: config.id,
                  numero_controle_pncp: c.numeroControlePNCP,
                  orgao_cnpj: c.orgaoEntidade?.cnpj ?? null,
                  orgao_nome: c.orgaoEntidade?.razaoSocial ?? null,
                  uf: c.unidadeOrgao?.ufSigla ?? null,
                  municipio_nome: c.unidadeOrgao?.municipioNome ?? null,
                  modalidade_nome: c.modalidadeNome ?? null,
                  objeto_compra: c.objetoCompra ?? '',
                  valor_total_estimado: c.valorTotalEstimado ?? null,
                  data_publicacao_pncp: c.dataPublicacaoPncp ?? null,
                  data_encerramento_proposta: c.dataEncerramentoProposta ?? null,
                  valor_total_homologado: c.valorTotalHomologado ?? null,
                  link_sistema_origem: c.linkSistemaOrigem ?? null,
                  palavra_chave_encontrada: achado.palavra,
                  encontrado_em: achado.encontradoEm,
                  item_descricao: achado.itemDescricao,
                }, { onConflict: 'user_id,numero_controle_pncp,palavra_chave_encontrada,encontrado_em,item_descricao' })

                if (!upsertError) encontrados++
              }

              pagina++
            } while (pagina <= totalPaginas)

            if (truncado) break
          }
          if (truncado) break
        }
        if (truncado) break
      }

      resumoPorConfig[config.nome] = {
        encontrados,
        truncado,
        paginasVarridas,
        totalPaginas: totalPaginasVistas,
      }

      await supabaseAdmin
        .from('busca_pncp_config')
        .update({ ultima_execucao: new Date().toISOString() })
        .eq('id', config.id)
    }

    return new Response(JSON.stringify({ success: true, resumo: resumoPorConfig }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('buscar-licitacoes-pncp error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
