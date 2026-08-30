import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import JSZip from 'https://esm.sh/jszip@3.10.1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TEMPLATE_PATH = 'templates/modelo_declaracoes_padrao.docx'

// Mesma lógica de escape/substituição já usada em `gerar-proposta` — mantém
// os dois arquivos consistentes entre si.
function escapeXml(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatarData(dataIso: string | null | undefined): string {
  if (!dataIso) return ''
  const d = new Date(dataIso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()
}

function substituirPlaceholders(xml: string, valores: Record<string, string>): string {
  return xml.replace(/\{\{(\w+)\}\}/g, (match, chave) => (chave in valores ? valores[chave] : match))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { clientId, biddingId } = await req.json()
    if (!clientId || !biddingId) {
      return new Response(JSON.stringify({ error: 'clientId e biddingId são obrigatórios' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) throw new Error('Não autenticado')

    const { data: client, error: clientError } = await supabase
      .from('clients').select('*').eq('id', clientId).single()
    if (clientError || !client) throw new Error('Cliente não encontrado')

    const { data: bidding, error: biddingError } = await supabase
      .from('biddings').select('*').eq('id', biddingId).single()
    if (biddingError || !bidding) throw new Error('Licitação não encontrada')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: templateBlob, error: templateError } = await supabaseAdmin.storage
      .from('documents').download(TEMPLATE_PATH)
    if (templateError || !templateBlob) {
      console.error('gerar-declaracoes: erro ao baixar modelo:', templateError)
      throw new Error(`Modelo de declarações não encontrado em '${TEMPLATE_PATH}': ${templateError?.message ?? 'motivo desconhecido'}`)
    }

    const zip = await JSZip.loadAsync(await templateBlob.arrayBuffer())

    const hoje = new Date()
    const valores: Record<string, string> = {
      cliente_nome: escapeXml(client.name),
      cliente_cnpj: escapeXml(client.cnpj ?? ''),
      responsavel_nome: escapeXml(client.responsavel_nome ?? ''),
      responsavel_cpf: escapeXml(client.responsavel_cpf ?? ''),
      responsavel_cargo: escapeXml(client.responsavel_cargo ?? ''),
      orgao: escapeXml(bidding.orgao),
      modalidade: escapeXml(bidding.modalidade),
      numero_edital: escapeXml(bidding.numero_edital ?? ''),
      objeto: escapeXml(bidding.objeto),
      cidade_emissao: escapeXml(client.cidade ?? ''),
      data_emissao: escapeXml(formatarData(hoje.toISOString().split('T')[0])),
    }

    const documentFile = zip.file('word/document.xml')
    if (!documentFile) throw new Error('Modelo inválido: word/document.xml não encontrado no .docx')
    let documentXml = await documentFile.async('string')
    documentXml = substituirPlaceholders(documentXml, valores)
    zip.file('word/document.xml', documentXml)

    const resultado = await zip.generateAsync({ type: 'base64' })
    const nomeArquivo = `Declaracoes_${client.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}_${bidding.numero_edital ?? biddingId.slice(0, 8)}.docx`

    return new Response(JSON.stringify({
      success: true,
      fileName: nomeArquivo,
      fileBase64: resultado,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('gerar-declaracoes error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
