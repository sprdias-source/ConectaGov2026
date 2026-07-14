import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { PORTAIS_OFICIAIS } from './portaisOficiais'
import type { DocumentTipo } from '../../types/domain'

type UploadAndSaveFn = (doc: {
  file: File
  tipo: DocumentTipo
  nome: string
  dataEmissao?: string | null
  dataValidade?: string | null
  observacoes?: string | null
}) => Promise<unknown>

type Props = {
  clientId: string
  tipo: Exclude<DocumentTipo, 'manual'>
  nomeDocumento: string
  // Passar diretamente `uploadAndSave.mutateAsync` do hook useClientDocuments
  // já em uso na tela — assim reaproveita o MESMO bucket ('client-documents')
  // e a MESMA invalidação de cache que a busca automática usa, em vez de
  // duplicar a lógica de upload com um bucket diferente.
  uploadAndSave: UploadAndSaveFn
}

/**
 * Sempre disponível pra qualquer documento automatizável — mesmo que a busca
 * automática funcione, o usuário pode preferir resolver manualmente (ex:
 * portal bloqueado, captcha difícil). Fluxo híbrido: o sistema busca CNPJ/
 * nome/endereço do cliente e copia pra área de transferência, abre o site
 * oficial numa aba nova — lá, o bookmarklet "Preencher CNPJ" preenche os
 * campos sozinho, sobrando só o captcha (quando tiver) pro usuário resolver.
 * Depois, o PDF baixado é enviado aqui mesmo, entrando no sistema do mesmo
 * jeito que um robô teria feito.
 */
export default function AcoesDocumentoManual({ clientId, tipo, nomeDocumento, uploadAndSave }: Props) {
  const [carregando, setCarregando] = useState(false)
  const [mostrarUpload, setMostrarUpload] = useState(false)
  const [dataValidade, setDataValidade] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const portal = PORTAIS_OFICIAIS[tipo]

  async function buscarManualmente() {
    if (!portal) return
    setCarregando(true)
    setErro(null)
    try {
      const { data: cliente, error } = await supabase
        .from('clients')
        .select('name, cnpj, address')
        .eq('id', clientId)
        .single()

      if (error || !cliente) throw new Error('Não foi possível carregar os dados do cliente')

      const payload: Record<string, string> = {}
      if (portal.camposNecessarios.includes('cnpj')) payload.cnpj = (cliente.cnpj ?? '').replace(/\D/g, '')
      if (portal.camposNecessarios.includes('nome')) payload.nome = cliente.name ?? ''
      if (portal.camposNecessarios.includes('endereco')) payload.endereco = cliente.address ?? ''

      await navigator.clipboard.writeText(JSON.stringify(payload))
      window.open(portal.url, '_blank')

      // Já deixa a data de validade sugerida pronta pro upload seguinte
      const sugestao = new Date()
      sugestao.setDate(sugestao.getDate() + portal.validadeDiasSugerida)
      setDataValidade(sugestao.toISOString().split('T')[0])
      setMostrarUpload(true)
    } catch (err: any) {
      setErro(err?.message ?? 'Erro ao preparar a busca manual')
    } finally {
      setCarregando(false)
    }
  }

  async function enviarPdf(arquivo: File) {
    setEnviando(true)
    setErro(null)
    try {
      await uploadAndSave({
        file: arquivo,
        tipo,
        nome: nomeDocumento,
        dataEmissao: new Date().toISOString().split('T')[0],
        dataValidade: dataValidade || null,
      })
      setMostrarUpload(false)
    } catch (err: any) {
      setErro(err?.message ?? 'Erro ao enviar o documento')
    } finally {
      setEnviando(false)
    }
  }

  if (!portal) return null // documento sem portal mapeado ainda

  return (
    <div className="mt-2">
      <button
        onClick={buscarManualmente}
        disabled={carregando}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition border bg-base-800/60 text-base-300 border-base-700 hover:bg-base-800 disabled:opacity-60 disabled:cursor-wait"
      >
        📋 {carregando ? 'Preparando...' : 'Buscar manualmente'}
      </button>

      {mostrarUpload && (
        <div className="mt-2 p-3 border border-dashed border-base-700 rounded-lg bg-base-900/40 text-[12px]">
          <p className="mb-2 text-base-400">
            Dados copiados e site aberto numa aba nova. No site, clique no favorito{' '}
            <strong className="text-base-200">"Preencher CNPJ"</strong> pra preencher sozinho — sobra só o
            captcha (se tiver) pra você resolver. Depois de baixar o PDF, envia ele aqui:
          </p>

          <label className="flex items-center gap-2 mb-2 text-base-400">
            Válido até:
            <input
              type="date"
              value={dataValidade}
              onChange={(e) => setDataValidade(e.target.value)}
              className="bg-base-850 border border-base-700 rounded px-2 py-1 text-base-100 focus:border-accent-400 outline-none"
            />
          </label>

          <input
            type="file"
            accept="application/pdf"
            disabled={enviando}
            onChange={(e) => {
              const arquivo = e.target.files?.[0]
              if (arquivo) enviarPdf(arquivo)
            }}
            className="text-[12px] text-base-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-accent-500 file:text-base-950 file:font-semibold file:text-[11px] hover:file:bg-accent-400 file:cursor-pointer"
          />

          {enviando && <p className="mt-1.5 text-base-500">Enviando...</p>}
        </div>
      )}

      {erro && <p className="text-negative-400 text-[11px] mt-1">{erro}</p>}
    </div>
  )
}
