// Edge Function: drive-storage
//
// Broker genérico de arquivos no Google Drive — usado no lugar do Supabase
// Storage pra parar de consumir o espaço (limitado) do plano do Supabase.
// Guarda tudo numa única conta do Google Drive da empresa (autenticação
// OAuth2 com refresh token, não uma Service Account — ver combinação com o
// usuário: uma Service Account sem Google Workspace não tem espaço de
// armazenamento próprio de verdade).
//
// Três ações (action no corpo da requisição):
//   - upload:   { path, mimeType, fileBase64 } → sobe o arquivo pro Drive,
//     criando a cadeia de pastas necessária, e devolve { storagePath } já
//     no formato "gdrive:<id do arquivo no Drive>" — pronto pra gravar
//     direto na coluna storage_path de qualquer uma das tabelas de arquivo
//     (attached_files, client_documents, atestados_tecnicos,
//     modelos_documentos), exatamente como hoje se grava o caminho do
//     Supabase Storage ali.
//   - download: { table, storagePath } → confirma que o usuário autenticado
//     é dono do registro que aponta pra esse storagePath (mesma regra de
//     posse usada em toda a base: user_id = owner_efetivo(auth.uid())) e
//     devolve { fileBase64 } com o conteúdo do arquivo.
//   - delete:   { table, storagePath } → mesma verificação de posse, depois
//     apaga o arquivo no Drive (o registro na tabela continua sendo
//     responsabilidade de quem chamou, igual já era com o Storage).
//
// Por que um prefixo "gdrive:" em vez de uma coluna nova no banco: assim
// nenhuma tabela/tipo precisa mudar de schema, e os ~11 lugares no app que
// já chamam getDownloadUrl(storagePath) continuam funcionando sem alterar
// assinatura — só o hook por trás (useAttachedFiles, useClientDocuments,
// useAtestados, useModelosDocumentos) precisa saber olhar o prefixo.
//
// Nunca expõe o token de acesso do Google Drive pro navegador — a troca do
// refresh token por um access token de curta duração, e toda chamada à API
// do Drive, acontece só aqui dentro, com as credenciais guardadas como
// segredo da Edge Function.
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (Supabase → Edge Functions → Secrets):
// - GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET,
//   GOOGLE_DRIVE_REFRESH_TOKEN: credenciais OAuth2 da conta do Google Drive
//   da empresa (ver passo a passo combinado com o usuário).
// - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm injetadas
//   automaticamente pelo Supabase em toda Edge Function.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')!
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_DRIVE_REFRESH_TOKEN')!

const DRIVE_PREFIX = 'gdrive:'
const ROOT_FOLDER_NAME = 'ConectaGov Arquivos'
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20MB — mesmo limite já validado no navegador (useAttachedFiles.ts)

// Lista fechada de tabelas que este broker aceita mexer — nunca repassar o
// nome de tabela vindo do corpo da requisição direto pra uma query sem
// checar contra isto antes.
const TABELAS_PERMITIDAS = ['attached_files', 'client_documents', 'atestados_tecnicos', 'modelos_documentos'] as const
type TabelaPermitida = typeof TABELAS_PERMITIDAS[number]

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

type Supa = ReturnType<typeof createClient>

async function obterAccessToken(): Promise<string> {
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
// da empresa. Cacheia cada nível em google_drive_folders — a única exceção
// é a raiz, resolvida/criada uma vez e reaproveitada por tudo depois.
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
    }

    await supabase.from('google_drive_folders').upsert({ path: caminhoAtual, folder_id: folderId })
    parentId = folderId
  }
  return parentId
}

// Upload multipart "clássico" (metadados + conteúdo numa única requisição)
// — suficiente pro limite de 20MB já validado antes de chegar aqui; não
// precisa do protocolo resumível do Drive (esse sim, em vários passos, faz
// sentido pra arquivo grande de verdade, que não é o caso aqui).
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

function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

function bytesParaBase64(bytes: Uint8Array): string {
  let binario = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binario += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binario)
}

// Confirma que o usuário autenticado é dono do registro que aponta pra
// este storagePath, na mesma tabela informada — mesma regra usada em toda
// a base (user_id sempre igual a owner_efetivo(auth.uid()), garantido por
// trigger no banco, ver migração 041). Devolve o id do arquivo no Drive
// (sem o prefixo "gdrive:") se autorizado, ou lança erro se não.
async function confirmarPosseEExtrairId(supabase: Supa, table: TabelaPermitida, storagePath: string, ownerId: string): Promise<string> {
  if (!storagePath.startsWith(DRIVE_PREFIX)) {
    throw new Error('Este arquivo não está no Google Drive — use o fluxo do Supabase Storage pra ele.')
  }
  const { data: registro, error } = await supabase
    .from(table)
    .select('user_id')
    .eq('storage_path', storagePath)
    .maybeSingle()
  if (error) throw error
  if (!registro) throw Object.assign(new Error('Arquivo não encontrado.'), { status: 404 })
  if (registro.user_id !== ownerId) throw Object.assign(new Error('Sem permissão para este arquivo.'), { status: 403 })
  return storagePath.slice(DRIVE_PREFIX.length)
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

    const body = await req.json()
    const { action } = body

    if (action === 'upload') {
      const { path, mimeType, fileBase64 } = body as { path: string; mimeType: string; fileBase64: string }
      if (!path || !fileBase64) return json({ error: 'path e fileBase64 são obrigatórios' }, 400)
      // Mesma regra que hoje protege o Supabase Storage: o primeiro
      // segmento do caminho tem que ser o dono efetivo de quem está
      // chamando — sem isso, um usuário mal-intencionado poderia montar um
      // path com o owner de outra conta e gravar arquivo cruzado.
      const primeiroSegmento = path.split('/')[0]
      if (primeiroSegmento !== ownerId) return json({ error: 'Caminho de upload inválido para esta conta' }, 403)

      const bytes = base64ParaBytes(fileBase64)
      if (bytes.length > MAX_FILE_SIZE_BYTES) return json({ error: `Arquivo muito grande (máximo de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB).` }, 400)

      const segmentos = path.split('/')
      const nomeArquivo = segmentos.pop()!
      const accessToken = await obterAccessToken()
      const folderId = await resolverPasta(supabase, accessToken, segmentos)
      const driveFileId = await enviarArquivoDrive(accessToken, folderId, nomeArquivo, mimeType || 'application/octet-stream', bytes)

      return json({ storagePath: `${DRIVE_PREFIX}${driveFileId}` })
    }

    if (action === 'download' || action === 'delete') {
      const { table, storagePath } = body as { table: string; storagePath: string }
      if (!table || !storagePath) return json({ error: 'table e storagePath são obrigatórios' }, 400)
      if (!TABELAS_PERMITIDAS.includes(table as TabelaPermitida)) return json({ error: 'Tabela não suportada' }, 400)

      const driveFileId = await confirmarPosseEExtrairId(supabase, table as TabelaPermitida, storagePath, ownerId as string)
      const accessToken = await obterAccessToken()

      if (action === 'download') {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) throw new Error(`Falha ao baixar arquivo do Drive: ${await res.text()}`)
        const bytes = new Uint8Array(await res.arrayBuffer())
        return json({ fileBase64: bytesParaBase64(bytes) })
      }

      // action === 'delete'
      const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      // 404 aqui significa que o arquivo já não existe mais no Drive — não
      // é motivo pra falhar a exclusão do lado do app (o objetivo, "este
      // arquivo não deve mais existir", já está satisfeito).
      if (!delRes.ok && delRes.status !== 404) throw new Error(`Falha ao excluir arquivo do Drive: ${await delRes.text()}`)
      return json({ ok: true })
    }

    return json({ error: 'Ação desconhecida' }, 400)
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('Erro no drive-storage:', mensagem)
    return json({ error: mensagem }, status)
  }
})
