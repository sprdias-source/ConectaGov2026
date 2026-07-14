import { useEffect, useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { UserPlus, Users } from 'lucide-react'
import { Button, Select } from '../ui/FormControls'
import { EmptyState } from '../ui/Primitives'

type Ferramenta = { key: string; nome: string; ordem: number }
type Membro = { id: string; nome: string | null; email: string | null; status: string }
type Permissao = { team_member_id: string; tool_key: string; nivel_acesso: string }

type Props = { supabase: SupabaseClient }

const NIVEIS = ['sem_acesso', 'visualizacao', 'edicao'] as const
const LABEL_NIVEL: Record<string, string> = {
  sem_acesso: 'Sem acesso',
  visualizacao: 'Visualização',
  edicao: 'Edição',
}

export default function MatrizPermissoes({ supabase }: Props) {
  const [ferramentas, setFerramentas] = useState<Ferramenta[]>([])
  const [membros, setMembros] = useState<Membro[]>([])
  const [permissoes, setPermissoes] = useState<Permissao[]>([])
  const [carregando, setCarregando] = useState(true)

  const [emailConvite, setEmailConvite] = useState('')
  const [nomeConvite, setNomeConvite] = useState('')
  const [convidando, setConvidando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true)
    const [{ data: ferr }, { data: memb }] = await Promise.all([
      supabase.from('system_tools').select('key, nome, ordem').order('ordem'),
      supabase.from('team_members').select('id, nome, email, status').eq('status', 'ativo'),
    ])
    setFerramentas(ferr ?? [])
    setMembros(memb ?? [])

    if (memb?.length) {
      const { data: perm } = await supabase
        .from('member_permissions')
        .select('team_member_id, tool_key, nivel_acesso')
        .in('team_member_id', memb.map((m) => m.id))
      setPermissoes(perm ?? [])
    } else {
      setPermissoes([])
    }
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  async function convidar() {
    if (!emailConvite.trim()) return
    setConvidando(true)
    setErro(null)
    try {
      const { data, error } = await supabase.functions.invoke('convidar-membro', {
        body: { email: emailConvite.trim(), nome: nomeConvite.trim() || null },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setEmailConvite('')
      setNomeConvite('')
      await carregar()
    } catch (err: any) {
      setErro(err?.message ?? 'Erro ao convidar membro')
    } finally {
      setConvidando(false)
    }
  }

  async function alterarNivel(teamMemberId: string, toolKey: string, novoNivel: string) {
    const membro = membros.find((m) => m.id === teamMemberId)
    const ferramenta = ferramentas.find((f) => f.key === toolKey)
    const nivelAntigo = nivelAtual(teamMemberId, toolKey)

    setPermissoes((atual) =>
      atual.map((p) =>
        p.team_member_id === teamMemberId && p.tool_key === toolKey
          ? { ...p, nivel_acesso: novoNivel }
          : p
      )
    )
    await supabase
      .from('member_permissions')
      .update({ nivel_acesso: novoNivel, atualizado_em: new Date().toISOString() })
      .eq('team_member_id', teamMemberId)
      .eq('tool_key', toolKey)

    // Log de auditoria — best effort: se falhar, não interrompe a mudança
    // de permissão em si, só perde o registro do histórico.
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('audit_logs').insert({
          user_id: user.id,
          action: 'Alterou Permissão',
          details: `${membro?.nome || membro?.email || 'Membro'}: ${ferramenta?.nome || toolKey} de "${LABEL_NIVEL[nivelAntigo] ?? nivelAntigo}" para "${LABEL_NIVEL[novoNivel] ?? novoNivel}"`,
        })
      }
    } catch (logErr) {
      console.warn('MatrizPermissoes: falha ao gravar log de auditoria:', logErr)
    }
  }

  function nivelAtual(teamMemberId: string, toolKey: string) {
    return permissoes.find((p) => p.team_member_id === teamMemberId && p.tool_key === toolKey)?.nivel_acesso
      ?? 'sem_acesso'
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 mb-5">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-base-500 mb-1">
            E-mail do novo membro
          </label>
          <input
            type="email"
            value={emailConvite}
            onChange={(e) => setEmailConvite(e.target.value)}
            placeholder="pessoa@email.com"
            className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 placeholder:text-base-500 outline-none focus:border-accent-400"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-base-500 mb-1">
            Nome (opcional)
          </label>
          <input
            type="text"
            value={nomeConvite}
            onChange={(e) => setNomeConvite(e.target.value)}
            placeholder="Nome da pessoa"
            className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 placeholder:text-base-500 outline-none focus:border-accent-400"
          />
        </div>
        <Button onClick={convidar} disabled={!emailConvite.trim() || convidando}>
          <UserPlus className="w-4 h-4" />
          {convidando ? 'Convidando...' : 'Convidar membro'}
        </Button>
      </div>

      {erro && (
        <div className="bg-negative-500/10 border border-negative-500/25 rounded-lg p-3 mb-4 text-[13px] text-negative-300">
          {erro}
        </div>
      )}

      <div className="bg-base-900/60 border border-base-700/50 rounded-xl overflow-hidden">
        {carregando ? (
          <div className="p-10 text-center text-base-500 text-sm">Carregando equipe...</div>
        ) : membros.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum membro na equipe ainda" description="Convide alguém pelo formulário acima para começar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-800 text-left">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">Membro</th>
                  {ferramentas.map((f) => (
                    <th key={f.key} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-base-500">
                      {f.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {membros.map((m) => (
                  <tr key={m.id} className="border-b border-base-800/60 hover:bg-base-850/40 transition">
                    <td className="px-4 py-3 font-semibold text-base-100">
                      {m.nome || m.email}
                    </td>
                    {ferramentas.map((f) => (
                      <td key={f.key} className="px-4 py-3">
                        <Select
                          value={nivelAtual(m.id, f.key)}
                          onChange={(e) => alterarNivel(m.id, f.key, e.target.value)}
                          className="text-[12px]"
                        >
                          {NIVEIS.map((n) => (
                            <option key={n} value={n}>{LABEL_NIVEL[n]}</option>
                          ))}
                        </Select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
