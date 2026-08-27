// Edge Function: migrar-arquivos-para-drive
//
// Script de migração ÚNICA (rodar manualmente, uma ou várias vezes até
// "restantes" chegar a zero) que move os arquivos que ainda estão no
// Supabase Storage pro Google Drive, liberando o espaço usado por eles no
// Supabase — a mesma mudança que já vale pra uploads novos desde a Edge
// Function drive-storage, aplicada agora aos arquivos antigos.
//
// COMO RODAR: no Dashboard do Supabase, em Edge Functions → esta function →
// aba de teste/invocar, mande um POST com corpo "{}" (ou
// {"limite": 15} pra ajustar quantos arquivos processar por chamada — o
// padrão é 15, pra não estourar o tempo de execução da function). A
// resposta traz quantos foram migrados e quantos ainda restam — se
// "restantes" for maior que zero, chame de novo pra continuar de onde
// parou (idempotente: não reprocessa o que já foi migrado).
//
// Varre, nesta ordem, attached_files, client_documents, atestados_tecnicos
// e modelos_documentos, procurando linhas cujo storage_path NÃO comece com
// "gdrive:" (ver lib/driveStorage.ts do lado do navegador pro mesmo
// prefixo). Pra cada uma: baixa o arquivo do Supabase Storage, sobe pro
// Drive (reaproveitando a mesma pasta/estrutura que o caminho antigo já
// descrevia), só DEPOIS de confirmar que o banco foi atualizado com o novo
// storage_path é que o arquivo antigo é apagado do Supabase — nessa ordem,
// nunca some um arquivo sem já ter a cópia nova gravada. Um erro num
// arquivo específico não interrompe os demais; fica registrado na resposta
// e a linha continua apontando pro Supabase Storage até uma nova tentativa.
//
// Restrito ao DONO da conta (não qualquer membro de equipe) — é uma
// operação que mexe nos arquivos de toda a empresa de uma vez.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS: as mesmas do drive-storage
// (GOOGLE_DRIVE_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN) + SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY (injetadas automaticamente).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { DRIVE_PREFIX, obterAccessTokenDrive, resolverPasta, enviarArquivoDrive, ehArquivoDrive, type Supa } from '../_shared/googleDrive.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LIMITE_PADRAO_POR_CHAMADA = 15

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const EXTENSAO_PARA_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

function adivinharMimeType(nomeArquivo: string): string {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSAO_PARA_MIME[ext] ?? 'application/octet-stream'
}

interface ResultadoTabela {
  tabela: string
  migrados: number
  falhas: { id: string; erro: string }[]
  restantesNestaChamada: number
}

// Migra até `limite` linhas de uma tabela. `colunaNome` é a coluna que dá o
// nome de exibição do arquivo (varia entre tabelas: "name" em
// attached_files, "nome" nas outras três) — só usada pra decidir o
// mimeType por extensão, já que nem toda tabela guarda mime_type.
async function migrarTabela(
  supabase: Supa,
  accessToken: string,
  ownerId: string,
  tabela: 'attached_files' | 'client_documents' | 'atestados_tecnicos' | 'modelos_documentos',
  colunaNome: string,
  limite: number
): Promise<ResultadoTabela> {
  const resultado: ResultadoTabela = { tabela, migrados: 0, falhas: [], restantesNestaChamada: 0 }
  if (limite <= 0) return resultado

  // Restrito à própria conta (owner_efetivo de quem chamou) — sem isso, como
  // a function roda com a service role (sem RLS), qualquer usuário
  // autenticado migraria/apagaria arquivos de OUTRAS contas.
  const { data: linhas, error } = await supabase
    .from(tabela)
    .select(`id, storage_path, ${colunaNome}`)
    .eq('user_id', ownerId)
    .not('storage_path', 'is', null)
    .not('storage_path', 'like', `${DRIVE_PREFIX}%`)
    .limit(limite + 1) // +1 só pra saber se ainda sobra depois deste lote
  if (error) throw new Error(`Falha ao listar ${tabela}: ${error.message}`)
  if (!linhas || linhas.length === 0) return resultado

  const paraProcessar = linhas.slice(0, limite)
  resultado.restantesNestaChamada = linhas.length > limite ? 1 : 0

  for (const linha of paraProcessar as Record<string, unknown>[]) {
    const id = linha.id as string
    const storagePath = linha.storage_path as string
    const nomeArquivo = (linha[colunaNome] as string | null) ?? storagePath.split('/').pop() ?? 'arquivo'

    if (!storagePath || ehArquivoDrive(storagePath)) continue // já migrado, nada a fazer

    try {
      const { data: blob, error: downloadError } = await supabase.storage.from('client-documents').download(storagePath)
      if (downloadError || !blob) throw new Error(downloadError?.message ?? 'download vazio')
      const bytes = new Uint8Array(await blob.arrayBuffer())

      // Reaproveita a mesma estrutura de pastas que o caminho antigo do
      // Supabase Storage já descrevia (owner/entidade/id/arquivo) — só
      // troca de provedor, a organização continua igual.
      const segmentos = storagePath.split('/')
      const nomeNoDrive = segmentos.pop()!
      const folderId = await resolverPasta(supabase, accessToken, segmentos)
      const driveFileId = await enviarArquivoDrive(accessToken, folderId, nomeNoDrive, adivinharMimeType(nomeArquivo), bytes)
      const novoStoragePath = `${DRIVE_PREFIX}${driveFileId}`

      const { error: updateError } = await supabase.from(tabela).update({ storage_path: novoStoragePath }).eq('id', id)
      if (updateError) throw new Error(`gravou no Drive mas falhou ao atualizar o registro: ${updateError.message}`)

      // Só apaga do Supabase DEPOIS de confirmar que o banco já aponta pro
      // Drive — nesta ordem, um erro aqui na frente no máximo deixa um
      // arquivo órfão no Supabase (que não custa nada de relevante), nunca
      // perde o arquivo.
      await supabase.storage.from('client-documents').remove([storagePath])

      resultado.migrados++
    } catch (err) {
      resultado.falhas.push({ id, erro: err instanceof Error ? err.message : String(err) })
    }
  }

  return resultado
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')
    if (!jwt) return json({ error: 'Não autenticado' }, 401)
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) return json({ error: 'Não autenticado' }, 401)

    const { data: ownerId, error: ownerError } = await supabase.rpc('owner_efetivo', { usuario_id: user.id })
    if (ownerError || !ownerId) return json({ error: 'Não foi possível identificar a conta do usuário' }, 500)
    if (ownerId !== user.id) return json({ error: 'Só o dono da conta pode rodar essa migração.' }, 403)

    const body = await req.json().catch(() => ({}))
    const limiteTotal = Number(body?.limite) > 0 ? Number(body.limite) : LIMITE_PADRAO_POR_CHAMADA

    const accessToken = await obterAccessTokenDrive()

    const tabelas: { nome: 'attached_files' | 'client_documents' | 'atestados_tecnicos' | 'modelos_documentos'; colunaNome: string }[] = [
      { nome: 'attached_files', colunaNome: 'name' },
      { nome: 'client_documents', colunaNome: 'nome' },
      { nome: 'atestados_tecnicos', colunaNome: 'nome' },
      { nome: 'modelos_documentos', colunaNome: 'nome' },
    ]

    const resultados: ResultadoTabela[] = []
    let orcamentoRestante = limiteTotal
    for (const { nome, colunaNome } of tabelas) {
      const resultado = await migrarTabela(supabase, accessToken, ownerId, nome, colunaNome, orcamentoRestante)
      resultados.push(resultado)
      orcamentoRestante -= resultado.migrados
      if (orcamentoRestante <= 0) break
    }

    const totalMigrado = resultados.reduce((s, r) => s + r.migrados, 0)
    const totalFalhas = resultados.reduce((s, r) => s + r.falhas.length, 0)
    const aindaRestam = resultados.some((r) => r.restantesNestaChamada > 0) || orcamentoRestante <= 0

    return json({
      migrados: totalMigrado,
      falhas: totalFalhas,
      detalhePorTabela: resultados,
      restantes: aindaRestam,
      dica: aindaRestam ? 'Ainda há arquivos no Supabase Storage — chame esta function de novo pra continuar.' : 'Nenhum arquivo restante no Supabase Storage — migração concluída.',
    })
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro em migrar-arquivos-para-drive:', mensagem)
    return json({ error: mensagem }, 500)
  }
})
