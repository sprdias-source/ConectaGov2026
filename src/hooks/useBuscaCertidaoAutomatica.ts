import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DocumentTipo } from '../types/domain'

// Mapa de tipo de certidão → nome da Edge Function correspondente.
// 'cndt' aponta pra `disparar-robo-cndt` (dispara o robô no GitHub Actions,
// que vai gerar uma sessão de captcha pro usuário resolver no modal global)
// em vez de `buscar-cndt` (fluxo antigo via Browserless) — os outros 6
// continuam no Browserless até serem portados também.
export const EDGE_FUNCTIONS: Record<Exclude<DocumentTipo, 'manual'>, string> = {
  cndt: 'disparar-robo-cndt',
  cnd_federal: 'buscar-cnd-federal',
  cnd_estadual_rs: 'buscar-cnd-estadual-rs',
  fgts: 'buscar-fgts',
  cnd_municipal: 'buscar-cnd-municipal-vacaria',
  certidao_falencia_rs: 'buscar-certidao-falencia-rs',
  cnpj_cartao: 'buscar-cnpj-cartao',
}

// Tipos que agora rodam via GitHub Actions — o retorno da Edge Function
// só confirma que o robô foi DISPARADO, não que já terminou. O resultado
// real chega minutos depois (captcha + automação), por isso mostramos um
// aviso diferente do erro, em vez de tratar como concluído.
export const TIPOS_VIA_GITHUB_ACTIONS: Partial<Record<DocumentTipo, boolean>> = {
  cndt: true,
}

// "Buscar auto" — usado tanto no repositório do cliente (Cadastros →
// Documentos) quanto direto no item do Checklist de uma licitação (o
// mesmo robô, só disparado de dois lugares diferentes da UI). Extraído
// aqui pra não duplicar a lógica de disparo/erro/aviso nos dois lugares.
export function useBuscaCertidaoAutomatica(clientId: string | undefined, cnpj: string | undefined, podeEditar: boolean) {
  const [buscando, setBuscando] = useState<DocumentTipo | null>(null)
  const [errosBusca, setErrosBusca] = useState<Partial<Record<DocumentTipo, string>>>({})
  const [avisosBusca, setAvisosBusca] = useState<Partial<Record<DocumentTipo, string>>>({})

  const buscarAutomatico = async (tipo: Exclude<DocumentTipo, 'manual'>) => {
    if (!cnpj || !podeEditar || !clientId) return
    setBuscando(tipo)
    setErrosBusca((prev) => { const n = { ...prev }; delete n[tipo]; return n })
    setAvisosBusca((prev) => { const n = { ...prev }; delete n[tipo]; return n })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/${EDGE_FUNCTIONS[tipo]}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ cnpj, clientId }),
        }
      )
      const data = await res.json()
      if (!res.ok || data.error) {
        setErrosBusca((prev) => ({ ...prev, [tipo]: data.error || 'Erro desconhecido' }))
      } else if (TIPOS_VIA_GITHUB_ACTIONS[tipo]) {
        setAvisosBusca((prev) => ({
          ...prev,
          [tipo]: 'Robô disparado! Isso roda em segundo plano e pode levar alguns minutos — quando o captcha aparecer, você será avisado numa tela pra digitar a resposta.',
        }))
      }
    } catch (err) {
      setErrosBusca((prev) => ({ ...prev, [tipo]: String(err) }))
    } finally {
      setBuscando(null)
    }
  }

  const limparAviso = (tipo: DocumentTipo) => setAvisosBusca((p) => { const n = { ...p }; delete n[tipo]; return n })
  const limparErro = (tipo: DocumentTipo) => setErrosBusca((p) => { const n = { ...p }; delete n[tipo]; return n })

  return { buscando, errosBusca, avisosBusca, buscarAutomatico, limparAviso, limparErro }
}
