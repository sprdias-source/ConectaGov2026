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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LIMITE_PADRAO_POR_CHAMADA = 15
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_DRIVE_REFRESH_TOKEN')
const DRIVE_PREFIX = 'gdrive:'
const ROOT_FOLDER_NAME = 'ConectaGov Arquivos'

type Supa = ReturnType<typeof createClient>

function ehArquivoDrive(storagePath: string): boolean {
  return storagePath.startsWith(DRIVE_PREFIX)
}

// Embutido aqui em vez de importado de ../_shared/googleDrive.ts: essa
// function é colada manualmente no Dashboard do Supabase (um arquivo por
// vez), e o bundler do editor não enxerga pastas irmãs fora da function —
// só o deploy via CLI/git, que envia o repositório inteiro de uma vez, é que
// consegue resolver esse import. Fica autossuficiente de propósito.
async function obterAccessTokenDrive(): Promise<string> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Credenciais do Google Drive não configuradas nesta function (GOOGLE_DRIVE_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN).')
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!res.ok) throw new Error(`Falha ao renovar o acesso ao Google Drive: ${await res.text()}`)
  const data = await res.json()
  return data.access_token as string
}

// Resolve (criando se preciso) a cadeia de pastas do Drive correspondente
// aos segmentos recebidos, sempre dentro de uma pasta raiz fixa
// ("ConectaGov Arquivos") pra não espalhar arquivo solto na raiz do Drive
// da empresa. Cacheia cada nível em google_drive_folders.
async function resolverPasta(supabase: Supa, accessToken: string, segmentos: string[]): Promise<string> {
  let parentId = 'root'
  let caminhoAtual = ''
  for (const segmento of [ROOT_FOLDER_NAME, ...segmentos]) {
    caminhoAtual = caminhoAtual ? `${caminhoAtual}/${segmento}` : segmento

    const { data: doCache } = await supabase
      .from('google_drive_folders')
      .select('folder_id')
      .eq('path', caminhoAtual)
      .maybeSingle()
    if (doCache?.folder_id) {
      parentId = doCache.folder_id as string
      continue
    }

    const nomeEscapado = segmento.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const consulta = `name='${nomeEscapado}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    const buscaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(consulta)}&fields=files(id)&spaces=drive`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!buscaRes.ok) throw new Error(`Falha ao procurar a pasta "${segmento}" no Drive: ${await buscaRes.text()}`)
    const buscaJson = await buscaRes.json()
    let folderId: string | undefined = buscaJson.files?.[0]?.id

    if (!folderId) {
      const criaRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: segmento, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
      })
      if (!criaRes.ok) throw new Error(`Falha ao criar a pasta "${segmento}" no Drive: ${await criaRes.text()}`)
      const criaJson = await criaRes.json()
      folderId = criaJson.id as string

      // Duas chamadas concorrentes pro MESMO caminho (ex: dois uploads ao
      // mesmo tempo pra pasta de um cliente) podem passar pela busca acima
      // sem achar nada (nenhuma das duas tinha criado a pasta ainda) e
      // criar uma pasta DUPLICADA cada uma. Um upsert simples aqui faria
      // "o último grava por cima" e deixaria a pasta perdedora órfã e
      // duplicada no Drive, sem nada apontando pra ela. Em vez disso,
      // tenta um INSERT puro (falha com violação de PK se a outra chamada
      // já reivindicou este path primeiro) — quem perder a corrida usa o
      // folder_id de quem ganhou e apaga a pasta duplicada que acabou de
      // criar, convergindo as duas chamadas pra uma única pasta.
      const { error: erroReivindicar } = await supabase
        .from('google_drive_folders')
        .insert({ path: caminhoAtual, folder_id: folderId })
      if (erroReivindicar) {
        const { data: doCacheAposCorrida } = await supabase
          .from('google_drive_folders')
          .select('folder_id')
          .eq('path', caminhoAtual)
          .maybeSingle()
        if (doCacheAposCorrida?.folder_id && doCacheAposCorrida.folder_id !== folderId) {
          const accessTokenLimpeza = accessToken
          await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessTokenLimpeza}` },
          }).catch(() => {})
          folderId = doCacheAposCorrida.folder_id as string
        }
      }
    }

    parentId = folderId
  }
  return parentId
}

// Upload multipart "clássico" (metadados + conteúdo numa única requisição)
// — suficiente pro limite de 20MB validado antes de chegar aqui; não
// precisa do protocolo resumível do Drive, que só faz sentido pra arquivo
// grande de verdade.
async function enviarArquivoDrive(accessToken: string, folderId: string, nomeArquivo: string, mimeType: string, bytes: Uint8Array): Promise<string> {
  const boundary = `conectagov_${crypto.randomUUID()}`
  const encoder = new TextEncoder()
  const metadados = JSON.stringify({ name: nomeArquivo, parents: [folderId] })
  const corpo = new Blob([
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadados}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    bytes,
    encoder.encode(`\r\n--${boundary}--`),
  ])

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: corpo,
  })
  if (!res.ok) throw new Error(`Falha ao enviar "${nomeArquivo}" pro Drive: ${await res.text()}`)
  const data = await res.json()
  return data.id as string
}

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
