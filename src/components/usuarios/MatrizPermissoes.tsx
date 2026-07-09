import { useEffect, useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'

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
    // Atualiza local primeiro (resposta imediata na tela), depois grava
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
  }

  function nivelAtual(teamMemberId: string, toolKey: string) {
    return permissoes.find((p) => p.team_member_id === teamMemberId && p.tool_key === toolKey)?.nivel_acesso
      ?? 'sem_acesso'
  }

  if (carregando) return <p>Carregando equipe...</p>

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Equipe e permissões</h2>

      <div style={{
        display: 'flex', gap: 8, marginBottom: 20, padding: 12,
        background: '#f5f5f5', borderRadius: 6, flexWrap: 'wrap',
      }}>
        <input
          type="email"
          placeholder="E-mail do novo membro"
          value={emailConvite}
          onChange={(e) => setEmailConvite(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
        />
        <input
          type="text"
          placeholder="Nome (opcional)"
          value={nomeConvite}
          onChange={(e) => setNomeConvite(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
        />
        <button
          onClick={convidar}
          disabled={!emailConvite.trim() || convidando}
          style={{
            padding: '8px 16px', borderRadius: 4, border: 'none',
            background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {convidando ? 'Convidando...' : 'Convidar membro'}
        </button>
      </div>

      {erro && <p style={{ color: '#dc2626', marginBottom: 12 }}>{erro}</p>}

      {membros.length === 0 ? (
        <p style={{ color: '#666' }}>Nenhum membro na equipe ainda — convide alguém acima.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #ddd' }}>Membro</th>
              {ferramentas.map((f) => (
                <th key={f.key} style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #ddd' }}>
                  {f.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.id}>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                  {m.nome || m.email}
                </td>
                {ferramentas.map((f) => (
                  <td key={f.key} style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                    <select
                      value={nivelAtual(m.id, f.key)}
                      onChange={(e) => alterarNivel(m.id, f.key, e.target.value)}
                      style={{ padding: 4, borderRadius: 4, border: '1px solid #ccc' }}
                    >
                      {NIVEIS.map((n) => (
                        <option key={n} value={n}>{LABEL_NIVEL[n]}</option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
