import { useRef, useState } from 'react'
import { Upload, FileText, Download, Trash2, Loader2 } from 'lucide-react'
import { useAttachedFiles } from '../../hooks/useAttachedFiles'
import type { FileCategory, FileEntityType } from '../../types/domain'
function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
export default function DocumentUploader({
  entityType, entityId, category, label = 'Anexar Documento',
}: {
  entityType: FileEntityType
  entityId: string
  category: FileCategory
  label?: string
}) {
  const { files, uploadFile, deleteFile, getDownloadUrl } = useAttachedFiles(entityType, entityId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // entityType/entityId já foram passados na chamada do hook acima —
    // o hook já sabe pra qual entidade este upload pertence, não precisa
    // (nem pode) mandar de novo aqui.
    uploadFile.mutate({ file, category })
    e.target.value = ''
  }
  const handleDownload = async (file: (typeof files)[number]) => {
    setDownloadingId(file.id)
    try {
      const url = await getDownloadUrl(file.storagePath)
      window.open(url, '_blank')
    } catch {
      alert('Não foi possível gerar o link de download. Tente novamente.')
    } finally {
      setDownloadingId(null)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-base-400">Documentos Anexados</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadFile.isPending}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-base-300 hover:text-accent-300 bg-base-850 border border-base-700 rounded-lg px-2.5 py-1.5 transition disabled:opacity-50"
        >
          {uploadFile.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {label}
        </button>
        <input ref={inputRef} type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleFileChange} />
      </div>
      {uploadFile.isError && (
        <p className="text-[11px] text-negative-400">Falha ao enviar o arquivo. Tente novamente.</p>
      )}
      {files.length === 0 ? (
        <p className="text-[12px] text-base-500 italic">Nenhum documento anexado ainda.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 bg-base-850/60 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-base-200 truncate">{f.name}</p>
                  <p className="text-[10px] text-base-500">{formatSize(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleDownload(f)} disabled={downloadingId === f.id} className="p-1.5 text-base-400 hover:text-accent-300 hover:bg-base-800 rounded transition">
                  {downloadingId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => deleteFile.mutate(f)} className="p-1.5 text-base-400 hover:text-negative-400 hover:bg-base-800 rounded transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
