import { useState } from 'react'
import { supabase } from '../lib/supabase'

type DisparoPayload = { modo: 'buscar'; buscaId: string } | { modo: 'baixar_edital'; editalId: string }

// Mesmo padrão de useBuscaCertidaoAutomatica.ts (robô CNDT): a Edge
// Function só CONFIRMA que o robô foi disparado no GitHub Actions — o
// resultado de verdade (editais gravados, ou o PDF baixado) chega minutos
// depois, direto nas tabelas. Não tem nenhum polling aqui de propósito; o
// usuário confere o resultado voltando na tela depois de um tempo, igual
// já acontece com a busca automática de certidões.
export function useDispararRoboLicitei() {
  const [disparando, setDisparando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const disparar = async (payload: DisparoPayload) => {
    setDisparando(true)
    setErro(null)
    setAviso(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${SUPABASE_URL}/functions/v1/disparar-robo-licitei`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setErro(data.error || 'Erro desconhecido')
      } else {
        setAviso('Robô disparado! Isso roda em segundo plano e pode levar alguns minutos — volte aqui daqui a pouco pra ver o resultado.')
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err))
    } finally {
      setDisparando(false)
    }
  }

  return { disparar, disparando, erro, aviso }
}
