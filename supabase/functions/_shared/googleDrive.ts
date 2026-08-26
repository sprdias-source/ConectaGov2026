// Compartilhado entre a Edge Function drive-storage (broker chamado pelo
// navegador) e a migrar-arquivos-para-drive (varre o que ainda está no
// Supabase Storage e move pro Drive) — e reaproveitado também pelas
// functions de análise/pergunta por IA (Analisar-edital, Analisar-
// oportunidade, Analisar-edital-juridico, Analisar-oportunidade-juridico,
// Perguntar-edital, Perguntar-oportunidade, Analisar-anexos-declaracao) só
// pra baixar um anexo de onde ele estiver.
//
// Todo o acesso ao Google Drive desta aplicação passa por aqui: troca do
// refresh token por um access token de curta duração, resolução/criação da
// cadeia de pastas (com cache em google_drive_folders), upload, download e
// exclusão. Nenhuma outra function deve chamar a API do Drive diretamente.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')
const GOOGLE_REFRESH_TOKEN = Deno.env.get('GOOGLE_DRIVE_REFRESH_TOKEN')

export const DRIVE_PREFIX = 'gdrive:'
export const ROOT_FOLDER_NAME = 'ConectaGov Arquivos'

export type Supa = ReturnType<typeof createClient>

export function ehArquivoDrive(storagePath: string): boolean {
  return storagePath.startsWith(DRIVE_PREFIX)
}

export async function obterAccessTokenDrive(): Promise<string> {
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
export async function resolverPasta(supabase: Supa, accessToken: string, segmentos: string[]): Promise<string> {
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
// — suficiente pro limite de 20MB validado antes de chegar aqui (ver
// MAX_FILE_SIZE_BYTES em drive-storage/index.ts); não precisa do protocolo
// resumível do Drive, que só faz sentido pra arquivo grande de verdade.
export async function enviarArquivoDrive(accessToken: string, folderId: string, nomeArquivo: string, mimeType: string, bytes: Uint8Array): Promise<string> {
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

export async function excluirArquivoDrive(accessToken: string, driveFileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // 404 aqui significa que o arquivo já não existe mais no Drive — não é
  // motivo pra falhar (o objetivo, "este arquivo não deve mais existir",
  // já está satisfeito).
  if (!res.ok && res.status !== 404) throw new Error(`Falha ao excluir arquivo do Drive: ${await res.text()}`)
}

// Baixa um anexo de onde ele estiver — Google Drive (storage_path com
// prefixo "gdrive:") ou Supabase Storage (caminho antigo, de antes da
// migração pro Drive) — sempre devolvendo um Response comum, exatamente
// como um fetch(signedUrl) faria.
export async function baixarAnexo(supabase: Supa, storagePath: string): Promise<Response> {
  if (ehArquivoDrive(storagePath)) {
    const driveFileId = storagePath.slice(DRIVE_PREFIX.length)
    const accessToken = await obterAccessTokenDrive()
    return fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  }
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from('client-documents')
    .createSignedUrl(storagePath, 300)
  if (signedUrlError || !signedUrlData) throw new Error('Não foi possível gerar a URL do arquivo no Storage')
  return fetch(signedUrlData.signedUrl)
}
