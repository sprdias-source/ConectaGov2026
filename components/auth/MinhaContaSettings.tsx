import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/FormControls'
import CampoSenha from './CampoSenha'

export default function MinhaContaSettings() {
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [carregandoEmail, setCarregandoEmail] = useState(false)
  const [carregandoSenha, setCarregandoSenha] = useState(false)
  const [mensagemEmail, setMensagemEmail] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [mensagemSenha, setMensagemSenha] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  async function handleTrocarEmail(e: React.FormEvent) {
    e.preventDefault()
    setMensagemEmail(null)

    if (!novoEmail) {
      setMensagemEmail({ tipo: 'erro', texto: 'Informe o novo e-mail.' })
      return
    }

    setCarregandoEmail(true)
    const { error } = await supabase.auth.updateUser({ email: novoEmail })
    setCarregandoEmail(false)

    if (error) {
      setMensagemEmail({ tipo: 'erro', texto: `Erro ao trocar e-mail: ${error.message}` })
      return
    }

    setMensagemEmail({
      tipo: 'sucesso',
      texto: 'Verifique sua caixa de entrada (no e-mail antigo e no novo) para confirmar a troca.',
    })
    setNovoEmail('')
  }

  async function handleTrocarSenha(e: React.FormEvent) {
    e.preventDefault()
    setMensagemSenha(null)

    if (novaSenha.length < 8) {
      setMensagemSenha({ tipo: 'erro', texto: 'A nova senha precisa ter pelo menos 8 caracteres.' })
      return
    }
    if (novaSenha !== confirmarSenha) {
      setMensagemSenha({ tipo: 'erro', texto: 'As senhas não coincidem.' })
      return
    }

    setCarregandoSenha(true)

    // Reautentica com a senha atual antes de trocar, por segurança — evita
    // que alguém com a sessão aberta num dispositivo esquecido troque a
    // senha sem saber a atual.
    const { data: userData } = await supabase.auth.getUser()
    const email = userData?.user?.email
    if (email && senhaAtual) {
      const { error: erroLogin } = await supabase.auth.signInWithPassword({
        email,
        password: senhaAtual,
      })
      if (erroLogin) {
        setCarregandoSenha(false)
        setMensagemSenha({ tipo: 'erro', texto: 'Senha atual incorreta.' })
        return
      }
    }

    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setCarregandoSenha(false)

    if (error) {
      setMensagemSenha({ tipo: 'erro', texto: `Erro ao trocar senha: ${error.message}` })
      return
    }

    setMensagemSenha({ tipo: 'sucesso', texto: 'Senha alterada com sucesso!' })
    setSenhaAtual('')
    setNovaSenha('')
    setConfirmarSenha('')
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
      <div className="bg-base-900/60 border border-base-700/50 rounded-xl p-5">
        <h3 className="font-semibold text-base-100 text-sm mb-3">Trocar e-mail</h3>

        {mensagemEmail && (
          <div className={`mb-3 p-2.5 rounded-lg text-[12px] border ${
            mensagemEmail.tipo === 'sucesso'
              ? 'bg-positive-500/10 border-positive-500/25 text-positive-300'
              : 'bg-negative-500/10 border-negative-500/25 text-negative-300'
          }`}>
            {mensagemEmail.texto}
          </div>
        )}

        <form onSubmit={handleTrocarEmail} className="flex flex-col gap-2.5">
          <input
            type="email"
            placeholder="Novo e-mail"
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            className="w-full bg-base-850 border border-base-700 rounded-lg px-3 py-2 text-[13px] text-base-100 placeholder:text-base-500 outline-none focus:border-accent-400"
          />
          <Button type="submit" disabled={carregandoEmail}>
            {carregandoEmail ? 'Salvando...' : 'Trocar e-mail'}
          </Button>
        </form>
      </div>

      <div className="bg-base-900/60 border border-base-700/50 rounded-xl p-5">
        <h3 className="font-semibold text-base-100 text-sm mb-3">Trocar senha</h3>

        {mensagemSenha && (
          <div className={`mb-3 p-2.5 rounded-lg text-[12px] border ${
            mensagemSenha.tipo === 'sucesso'
              ? 'bg-positive-500/10 border-positive-500/25 text-positive-300'
              : 'bg-negative-500/10 border-negative-500/25 text-negative-300'
          }`}>
            {mensagemSenha.texto}
          </div>
        )}

        <form onSubmit={handleTrocarSenha} className="flex flex-col gap-2.5">
          <CampoSenha
            value={senhaAtual}
            onChange={setSenhaAtual}
            placeholder="Senha atual"
            autoComplete="current-password"
          />
          <CampoSenha
            value={novaSenha}
            onChange={setNovaSenha}
            placeholder="Nova senha (mín. 8 caracteres)"
            autoComplete="new-password"
          />
          <CampoSenha
            value={confirmarSenha}
            onChange={setConfirmarSenha}
            placeholder="Confirmar nova senha"
            autoComplete="new-password"
          />
          <Button type="submit" disabled={carregandoSenha}>
            {carregandoSenha ? 'Salvando...' : 'Trocar senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
