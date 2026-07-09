import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export type NivelAcesso = 'sem_acesso' | 'visualizacao' | 'edicao'

/**
 * Descobre o nível de acesso do usuário logado numa ferramenta específica
 * ('clientes', 'cadastros', 'financeiro', 'relatorios' — bate com as
 * chaves cadastradas em system_tools).
 *
 * - Se o usuário logado é o DONO da própria conta (não está vinculado como
 *   membro de nenhuma equipe), sempre tem 'edicao' completa — o sistema de
 *   permissões só entra em ação quando é um membro convidado.
 * - Se é membro de uma equipe, o nível vem exatamente do que o
 *   administrador configurou na tela de permissões (MatrizPermissoes.tsx).
 *
 * A checagem de segurança "de verdade" continua sendo o RLS do banco
 * (migration 022) — este hook é só pra a INTERFACE se comportar direito
 * (esconder botões que a pessoa não pode usar), não é a última linha de
 * defesa.
 */
export function usePermissaoFerramenta(toolKey: string): { nivel: NivelAcesso; carregando: boolean } {
  const { user } = useAuth()
  const [nivel, setNivel] = useState<NivelAcesso>('edicao')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let cancelado = false

    async function verificar() {
      if (!user) {
        setCarregando(false)
        return
      }
      setCarregando(true)

      const { data: vinculo } = await supabase
        .from('team_members')
        .select('id')
        .eq('member_user_id', user.id)
        .eq('status', 'ativo')
        .maybeSingle() as { data: { id: string } | null }

      if (!vinculo) {
        // Não é membro de equipe de ninguém — é dono da própria conta.
        if (!cancelado) {
          setNivel('edicao')
          setCarregando(false)
        }
        return
      }

      const { data: permissao } = await supabase
        .from('member_permissions')
        .select('nivel_acesso')
        .eq('team_member_id', vinculo.id)
        .eq('tool_key', toolKey)
        .maybeSingle() as { data: { nivel_acesso: string } | null }

      if (!cancelado) {
        setNivel((permissao?.nivel_acesso as NivelAcesso) ?? 'sem_acesso')
        setCarregando(false)
      }
    }

    verificar()
    return () => { cancelado = true }
  }, [user, toolKey])

  return { nivel, carregando }
}
