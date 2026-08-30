import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Mesma pasta de templates do bucket 'documents', mas em uma subpasta
// dedicada a modelos customizados por licitação — um arquivo por
// biddingId, sempre sobrescrevendo (upsert) se enviar de novo.
const caminhoCustomizado = (biddingId: string) => `templates/custom/${biddingId}.docx`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { biddingId, action, fileBase64 } = await req.json()
    if (!biddingId || !action) {
      return new Response(JSON.stringify({ error: 'biddingId e action são obrigatórios' }), {
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

    // Confirma que o usuário tem acesso a essa licitação usando o próprio
    // token dele (respeita RLS) — se não retornar nada, ou não existe ou
    // ele não tem permissão, e a gente nem chega a mexer no Storage.
    const { data: bidding, error: biddingError } = await supabase
      .from('biddings').select('id').eq('id', biddingId).single()
    if (biddingError || !bidding) throw new Error('Licitação não encontrada ou sem permissão de acesso')

    // Cliente com service role só pra mexer no Storage compartilhado
    // (pasta 'templates/'), pelo mesmo motivo já usado em gerar-proposta:
    // esse arquivo não é um dado privado de usuário, então fica fora do
    // escopo das políticas de RLS pensadas pra dados privados.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const path = caminhoCustomizado(biddingId)

    if (action === 'upload') {
      if (!fileBase64) throw new Error('fileBase64 é obrigatório para action "upload"')
      const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0))
      const { error: uploadError } = await supabaseAdmin.storage
        .from('documents')
        .upload(path, bytes, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: true,
        })
      if (uploadError) {
        console.error('upload-modelo-licitacao: erro ao subir arquivo:', uploadError)
        throw new Error(`Erro ao enviar o modelo: ${uploadError.message}`)
      }
      return new Response(JSON.stringify({ success: true, path }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'remove') {
      const { error: removeError } = await supabaseAdmin.storage.from('documents').remove([path])
      if (removeError) {
        console.error('upload-modelo-licitacao: erro ao remover arquivo:', removeError)
        throw new Error(`Erro ao remover o modelo: ${removeError.message}`)
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`action inválida: ${action}`)

  } catch (err) {
    console.error('upload-modelo-licitacao error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
