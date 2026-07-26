import Modal from './Modal'

// Visualização embutida do PDF (edital, TR, contrato) sem sair da tela —
// antes só dava pra abrir numa aba nova (que em alguns navegadores de
// celular força o download em vez de mostrar o arquivo).
export default function PdfViewerModal({
  open, onClose, nome, url,
}: {
  open: boolean
  onClose: () => void
  nome: string
  url: string | null
}) {
  return (
    <Modal open={open} onClose={onClose} title={nome} maxWidth="max-w-5xl">
      <div className="h-[70vh] -m-6 mt-0">
        {url ? (
          <iframe src={url} title={nome} className="w-full h-full rounded-b-2xl bg-base-100" />
        ) : (
          <div className="flex items-center justify-center h-full text-base-500 text-[13px]">Carregando...</div>
        )}
      </div>
    </Modal>
  )
}
