import { Upload as TusUpload } from 'tus-js-client'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Upload resumível via protocolo TUS — caminho oficialmente recomendado
// pela própria Supabase pra arquivos grandes/conexões instáveis (edital,
// certidões, atestados escaneados etc). Em vez de mandar o arquivo inteiro
// numa tacada só (o que o .upload() padrão faz, e que falha com "Failed to
// fetch" ao primeiro soluço de rede num arquivo grande ou conexão de
// celular), divide em pedaços de 6MB e retoma sozinho de onde parou se uma
// parte falhar.
export function uploadResumivel(
  file: File,
  path: string,
  accessToken: string,
  onProgress: (percentual: number) => void,
  bucketName = 'client-documents'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // fixo — exigido pelo endpoint resumível da Supabase, não é ajustável
      onError: (error) => {
        console.error('Erro detalhado no upload resumível:', error)
        reject(new Error('Falha no envio por problema de conexão durante o upload. Tente novamente.'))
      },
      onProgress: (bytesEnviados, bytesTotais) => {
        onProgress(bytesTotais > 0 ? Math.round((bytesEnviados / bytesTotais) * 100) : 0)
      },
      onSuccess: () => resolve(),
    })

    // Se um envio anterior desse mesmo arquivo ficou pela metade (aba
    // fechada, conexão caiu de vez), retoma de onde parou em vez de
    // recomeçar do zero.
    upload.findPreviousUploads().then((uploadsAnteriores) => {
      if (uploadsAnteriores.length > 0) {
        upload.resumeFromPreviousUpload(uploadsAnteriores[0])
      }
      upload.start()
    })
  })
}
