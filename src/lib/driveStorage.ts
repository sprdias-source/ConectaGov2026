// Ponte do navegador com a Edge Function `drive-storage` — todo upload novo
// de arquivo passa a ir pro Google Drive (conta única da empresa) em vez do
// Supabase Storage, que tem espaço limitado. Ver o comentário no topo de
// supabase/functions/drive-storage/index.ts pro desenho completo.
//
// Arquivos gravados via este caminho ficam com storage_path no formato
// "gdrive:<id do arquivo no Drive>" — os hooks (useAttachedFiles,
// useClientDocuments, useAtestados, useModelosDocumentos) checam esse
// prefixo com `ehArquivoDrive` pra decidir se leem/apagam via este arquivo
// ou pelo caminho antigo do Supabase Storage (arquivos enviados antes desta
// mudança continuam lá até serem migrados).
import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export function ehArquivoDrive(storagePath: string): boolean {
  return storagePath.startsWith('gdrive:')
}

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface RespostaDriveStorage {
  error?: string
  storagePath?: string
  fileBase64?: string
  ok?: boolean
}

async function chamarDriveStorage(body: Record<string, unknown>): Promise<RespostaDriveStorage> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')
  const res = await fetch(`${SUPABASE_URL}/functions/v1/drive-storage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  })
  const resultado: RespostaDriveStorage = await res.json()
  if (!res.ok || resultado.error) throw new Error(resultado.error || 'Falha ao comunicar com o Google Drive')
  return resultado
}

// Envia o arquivo pro Drive na "pasta virtual" indicada por `path` (o mesmo
// formato de caminho que já era usado pro Supabase Storage, ex:
// "{ownerId}/{entityType}/{entityId}/{timestamp}.{ext}" — cada segmento
// vira uma pasta real no Drive, exceto o último, que vira o nome do
// arquivo). Devolve o valor pronto pra gravar em storage_path.
export async function enviarParaDrive(file: File, path: string): Promise<string> {
  const fileBase64 = await fileParaBase64(file)
  const { storagePath } = await chamarDriveStorage({
    action: 'upload',
    path,
    mimeType: file.type || 'application/octet-stream',
    fileBase64,
  })
  return storagePath as string
}

// Baixa o conteúdo de um arquivo já no Drive e devolve uma URL local
// (blob:) pronta pra usar em <a href>, <iframe src\> ou window.open — mesmo
// uso que uma signed URL do Supabase Storage já tinha.
export async function baixarDoDrive(table: string, storagePath: string, mimeType?: string | null): Promise<string> {
  const { fileBase64 } = await chamarDriveStorage({ action: 'download', table, storagePath })
  const binario = atob(fileBase64 as string)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

export async function excluirNoDrive(table: string, storagePath: string): Promise<void> {
  await chamarDriveStorage({ action: 'delete', table, storagePath })
}
